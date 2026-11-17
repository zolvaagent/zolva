import "server-only";

/**
 * Carries out one trench trade for one agent: Rushr builds it, checkBuild refuses anything
 * unexpected, Zolva's Privy signer signs from the agent's own wallet (under the agent's policy), and
 * Rushr's curve fee follows as a plain ETH transfer to its treasury. Fills are measured from wallet
 * balances, so taxes, refunds and gas are all included.
 */
import { PrivyClient } from "@privy-io/node";
import type { Address, Hex, PublicClient } from "viem";

import { checkBuild, type BuiltTx } from "./check-build.ts";
import { CHAIN_ID, curveOf, tokenAbi } from "./curve.ts";
import { LOCKED } from "./rules.ts";
import { buildTrade, reportFee } from "./rushr-api.ts";

export type Signer = { privy: PrivyClient; authorizationKey: string };
export type AgentWallet = { walletId: string; address: Address; rushrKey: string };
export type Fill = { tokens: bigint; eth: bigint; txHash: Hex; feeTxHash: Hex | null };

/** Sign and send one transaction from the agent wallet; waits for success. */
export async function sendFromAgent(chain: PublicClient, signer: Signer, wallet: Pick<AgentWallet, "walletId" | "address">, tx: Pick<BuiltTx, "to" | "data" | "value" | "gas">): Promise<Hex> {
  const [nonce, fees, gas] = await Promise.all([
    chain.getTransactionCount({ address: wallet.address, blockTag: "pending" }),
    chain.estimateFeesPerGas(),
    tx.gas ? Promise.resolve(BigInt(tx.gas)) : chain.estimateGas({ account: wallet.address, to: tx.to as Address, data: (tx.data || "0x") as Hex, value: BigInt(tx.value) }),
  ]);
  const signed = await signer.privy
    .wallets()
    .ethereum()
    .signTransaction(wallet.walletId, {
      params: {
        transaction: {
          type: 2,
          chain_id: CHAIN_ID,
          to: tx.to,
          data: tx.data || "0x",
          value: `0x${BigInt(tx.value).toString(16)}`,
          nonce,
          gas_limit: Number((gas * 13n) / 10n),
          max_fee_per_gas: Number(fees.maxFeePerGas * 2n),
          max_priority_fee_per_gas: Number(fees.maxPriorityFeePerGas ?? 0n),
        },
      },
      authorization_context: { authorization_private_keys: [signer.authorizationKey] },
    });
  const hash = await chain.sendRawTransaction({ serializedTransaction: signed.signed_transaction as Hex });
  const receipt = await chain.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
  return hash;
}

/** One buy (amountIn in wei) or sell (amountIn in token units) through Rushr. */
export async function trade(chain: PublicClient, signer: Signer, wallet: AgentWallet, side: "buy" | "sell", token: Address, amountIn: bigint): Promise<Fill> {
  const curve = await curveOf(chain, token);
  const built = await buildTrade(wallet.rushrKey, { token, side, amountIn: amountIn.toString(), slippageBps: LOCKED.slippageBps, from: wallet.address });
  checkBuild(built, { side, token, curve, amountIn });
  const balance = () => chain.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [wallet.address] });
  const [tokensBefore, ethBefore] = await Promise.all([balance(), chain.getBalance({ address: wallet.address })]);
  for (const approval of built.approvals) await sendFromAgent(chain, signer, wallet, approval.tx);
  const txHash = await sendFromAgent(chain, signer, wallet, built.tx);
  const [tokensAfter, ethAfter] = await Promise.all([balance(), chain.getBalance({ address: wallet.address })]);
  let feeTxHash: Hex | null = null;
  if (built.followUp) {
    // Paid right after the trade, as Rushr requires (unpaid after 10 min blocks every build). A failure
    // here is reported by the caller; Rushr's /fees answer gives the exact transfer to retry with.
    feeTxHash = await sendFromAgent(chain, signer, wallet, built.followUp.tx);
    await reportFee(wallet.rushrKey, feeTxHash).catch(() => undefined);
  }
  const tokens = side === "buy" ? tokensAfter - tokensBefore : tokensBefore - tokensAfter;
  const eth = side === "buy" ? ethBefore - ethAfter : ethAfter - ethBefore;
  return { tokens, eth: eth < 0n ? 0n : eth, txHash, feeTxHash };
}

/** Sends the wallet's ETH (minus gas) back to the owner; the policy allows no other address. */
export async function withdrawEth(chain: PublicClient, signer: Signer, wallet: Pick<AgentWallet, "walletId" | "address">, owner: Address): Promise<Hex | null> {
  const [balance, fees] = await Promise.all([chain.getBalance({ address: wallet.address }), chain.estimateFeesPerGas()]);
  // sendFromAgent signs gas_limit = 1.3 x 21,000 at twice the fee, and the wallet must hold all of it.
  const gasCost = 28_000n * fees.maxFeePerGas * 2n;
  if (balance <= gasCost) return null;
  return sendFromAgent(chain, signer, wallet, { to: owner, data: "0x", value: (balance - gasCost).toString(), gas: "21000" });
}
