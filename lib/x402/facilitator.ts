import "server-only";

import { PrivyClient } from "@privy-io/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encodeFunctionData, erc20Abi, parseSignature, recoverTypedDataAddress, size, type Hex, type PublicClient } from "viem";

import { env } from "@/lib/env";
import { message } from "@/lib/live/executor";
import { createChainClient } from "@/lib/prices/onchain";
import { authorizationTypedData, X402_ASSET, X402_CHAIN_ID, type PaymentPayload, type PaymentRequirements } from "@/lib/x402/protocol";

/**
 * Zolva's own x402 facilitator for USDG on Robinhood Chain (the big facilitators do not
 * list the chain). Two steps around the paid work:
 *
 * 1. claimPayment: the signature recovers to the payer, the nonce is unused on the token,
 *    the payer holds enough USDG, then the nonce is claimed in x402_payments (unique), so
 *    the same signed payment cannot pay for two calls.
 * 2. settlePayment: the relayer wallet (a Privy server wallet whose policy only allows
 *    USDG.transferWithAuthorization to Zolva's address) sends the transfer and waits for
 *    the receipt. The relayer pays the gas; the payer pays nothing but the price.
 *
 * If the work fails after a claim, releasePayment marks it failed and nothing is taken.
 */

/** EIP-3009 on USDG: the (v, r, s) variant, which every EOA signature fits. */
export const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const AUTHORIZATION_STATE_ABI = [
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export type Relayer = { privy: PrivyClient; authorizationKey: string; walletId: string; address: Hex };

/** The relayer from the environment, or null while it is not set up (scripts/x402-relayer-setup.mts). */
export function relayerFromEnv(): Relayer | null {
  const privyConfig = env.privy;
  const authorizationKey = env.privyAuthorizationKey;
  const relayer = env.x402Relayer;
  if (!privyConfig || !authorizationKey || !relayer) return null;
  return { privy: new PrivyClient({ appId: privyConfig.appId, appSecret: privyConfig.appSecret }), authorizationKey, walletId: relayer.walletId, address: relayer.address };
}

export type Claim = { ok: true; id: number; payer: Hex } | { ok: false; reason: string };

/** Checks the signature and the chain, then claims the nonce. Call after checkPayment passed. */
export async function claimPayment(db: SupabaseClient, chain: PublicClient, payment: PaymentPayload, requirements: PaymentRequirements, endpoint: string): Promise<Claim> {
  const auth = payment.payload.authorization;
  const signature = payment.payload.signature;
  // Only plain 65 byte signatures: the token's (v, r, s) transfer cannot carry a smart wallet signature.
  if (size(signature) !== 65) return { ok: false, reason: "Only signatures from a regular wallet (65 bytes) are accepted" };
  let signer: Hex;
  try {
    signer = await recoverTypedDataAddress({ ...authorizationTypedData(auth), signature });
  } catch {
    return { ok: false, reason: "The signature could not be read" };
  }
  if (signer.toLowerCase() !== auth.from.toLowerCase()) return { ok: false, reason: "The signature is not from the payer" };

  const [used, balance] = await Promise.all([
    chain.readContract({ address: X402_ASSET, abi: AUTHORIZATION_STATE_ABI, functionName: "authorizationState", args: [auth.from, auth.nonce] }),
    chain.readContract({ address: X402_ASSET, abi: erc20Abi, functionName: "balanceOf", args: [auth.from] }),
  ]);
  if (used) return { ok: false, reason: "This payment was already used" };
  if (balance < BigInt(auth.value)) return { ok: false, reason: "The payer does not hold enough USDG" };

  const { data, error } = await db
    .from("x402_payments")
    .insert({ nonce: auth.nonce.toLowerCase(), payer: auth.from.toLowerCase(), pay_to: requirements.payTo.toLowerCase(), amount: auth.value, endpoint })
    .select("id")
    .single();
  if (error) {
    // 23505: unique violation, the nonce was claimed by another request.
    if (error.code === "23505") return { ok: false, reason: "This payment was already used" };
    throw new Error(`Claiming the payment failed: ${error.message}`);
  }
  return { ok: true, id: data.id as number, payer: auth.from.toLowerCase() as Hex };
}

/** Marks a claimed payment failed without taking it (the work did not run). */
export async function releasePayment(db: SupabaseClient, id: number, reason: string) {
  await db.from("x402_payments").update({ status: "failed", error: reason.slice(0, 300) }).eq("id", id).eq("status", "pending");
}

export type Settlement = { ok: true; txHash: Hex } | { ok: false; reason: string; txHash?: Hex };

/** Sends the payer's signed transfer from the relayer and waits for it. */
export async function settlePayment(db: SupabaseClient, chain: PublicClient, relayer: Relayer, id: number, payment: PaymentPayload): Promise<Settlement> {
  const auth = payment.payload.authorization;
  const { v, r, s, yParity } = parseSignature(payment.payload.signature);
  const data = encodeFunctionData({
    abi: TRANSFER_WITH_AUTHORIZATION_ABI,
    functionName: "transferWithAuthorization",
    args: [auth.from, auth.to, BigInt(auth.value), BigInt(auth.validAfter), BigInt(auth.validBefore), auth.nonce, Number(v ?? BigInt(yParity + 27)), r, s],
  });

  let txHash: Hex | undefined;
  try {
    // Estimating first turns a transfer the token would refuse into a clear error, before any gas is spent.
    const gas = await chain.estimateGas({ account: relayer.address, to: X402_ASSET, data });
    const [nonce, fees] = await Promise.all([chain.getTransactionCount({ address: relayer.address, blockTag: "pending" }), chain.estimateFeesPerGas()]);
    const signed = await relayer.privy
      .wallets()
      .ethereum()
      .signTransaction(relayer.walletId, {
        params: {
          transaction: {
            type: 2,
            chain_id: X402_CHAIN_ID,
            to: X402_ASSET,
            data,
            value: 0,
            nonce,
            gas_limit: Number((gas * 12n) / 10n),
            max_fee_per_gas: Number(fees.maxFeePerGas * 2n),
            max_priority_fee_per_gas: Number(fees.maxPriorityFeePerGas ?? 0n),
          },
        },
        authorization_context: { authorization_private_keys: [relayer.authorizationKey] },
      });
    txHash = await chain.sendRawTransaction({ serializedTransaction: signed.signed_transaction as Hex });
    const receipt = await chain.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
    if (receipt.status !== "success") throw new Error("The transfer reverted");
  } catch (cause) {
    const reason = message(cause);
    // A sent transaction that timed out may still land: keep it pending with its hash for a manual look.
    await db
      .from("x402_payments")
      .update(txHash ? { tx_hash: txHash, error: reason.slice(0, 300) } : { status: "failed", error: reason.slice(0, 300) })
      .eq("id", id);
    return { ok: false, reason, txHash };
  }

  await db.from("x402_payments").update({ status: "settled", tx_hash: txHash, settled_at: new Date().toISOString() }).eq("id", id);
  return { ok: true, txHash };
}

export { createChainClient };
