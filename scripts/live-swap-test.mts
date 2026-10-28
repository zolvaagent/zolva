/**
 * Real money spike, step 1b (owner only). Proves the signing path end to end:
 * Privy signs a raw transaction for chain 4663 under the live policy, and we
 * broadcast it through Alchemy.
 *
 *   npm run live:test -- <wallet> <usd>          dry run: signs, never broadcasts
 *   npm run live:test -- <wallet> <usd> --send   approve + swap USDG -> NVDA for real
 *
 * Both modes first ask Privy to sign a USDG transfer to a burn address, which
 * the policy must refuse. That transaction is never broadcast, even if signed.
 * The swap uses QuoterV2's quote minus 1% as the minimum output.
 */
import { readFileSync } from "node:fs";

import { PrivyClient } from "@privy-io/node";
import { createPublicClient, encodeFunctionData, erc20Abi, formatUnits, http, parseUnits, type Hex } from "viem";

import { ERC20_APPROVE_ABI, EXACT_INPUT_SINGLE_ABI, QUOTE_EXACT_INPUT_SINGLE_ABI, QUOTER_V2, ROBINHOOD_CHAIN_ID, SWAP_ROUTER_02, USDG } from "../lib/live/contracts.ts";

const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";
const NVDA_POOL = "0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3";
const MAX_USD = 10;
const SLIPPAGE = 0.01;

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);

const chain = createPublicClient({ transport: http(vars.ROBINHOOD_RPC_URL) });
const privy = new PrivyClient({ appId: vars.PRIVY_APP_ID, appSecret: vars.PRIVY_APP_SECRET });
const authorization = { authorization_private_keys: [vars.PRIVY_AUTHORIZATION_KEY] };

async function sign(walletId: string, from: string, to: string, data: Hex, gas: bigint): Promise<Hex> {
  const [nonce, fees] = await Promise.all([chain.getTransactionCount({ address: from as Hex, blockTag: "pending" }), chain.estimateFeesPerGas()]);
  const signed = await privy
    .wallets()
    .ethereum()
    .signTransaction(walletId, {
      params: {
        transaction: { type: 2, chain_id: ROBINHOOD_CHAIN_ID, to, data, value: 0, nonce, gas_limit: Number(gas), max_fee_per_gas: Number(fees.maxFeePerGas * 2n), max_priority_fee_per_gas: Number(fees.maxPriorityFeePerGas ?? 0n) },
      },
      authorization_context: authorization,
    });
  return signed.signed_transaction as Hex;
}

async function broadcast(label: string, raw: Hex) {
  const hash = await chain.sendRawTransaction({ serializedTransaction: raw });
  console.log(`${label}: sent ${hash}`);
  const receipt = await chain.waitForTransactionReceipt({ hash, timeout: 120_000 });
  const ethUsd = 2400;
  const fee = Number(receipt.gasUsed * receipt.effectiveGasPrice) / 1e18;
  console.log(`${label}: ${receipt.status}, gas ${receipt.gasUsed}, fee about $${(fee * ethUsd).toFixed(4)}  https://robinhoodchain.blockscout.com/tx/${hash}`);
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
}

async function main() {
  const wallet = (process.argv[2] ?? "").toLowerCase() as Hex;
  const usd = Number(process.argv[3]);
  const send = process.argv.includes("--send");
  if (!/^0x[0-9a-f]{40}$/.test(wallet) || !(usd > 0 && usd <= MAX_USD)) throw new Error(`Usage: npm run live:test -- <wallet> <usd up to ${MAX_USD}> [--send]`);
  if (!vars.PRIVY_AUTHORIZATION_KEY || !vars.PRIVY_SIGNER_ID) throw new Error("Run npm run live:setup first");

  const found = (await privy.wallets().list({ address: wallet, chain_type: "ethereum" })).data?.[0];
  if (!found) throw new Error(`No Privy wallet ${wallet}`);
  const [usdg, eth] = await Promise.all([chain.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }), chain.getBalance({ address: wallet })]);
  console.log(`wallet ${found.id}: ${formatUnits(usdg, 6)} USDG, ${formatUnits(eth, 18)} ETH, mode ${send ? "SEND" : "dry run"}`);

  // 1. The policy must refuse anything outside it: a USDG transfer to a burn address. Never broadcast.
  const transfer = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: ["0x000000000000000000000000000000000000dEaD", 1n] });
  try {
    await sign(found.id, wallet, USDG, transfer, 80_000n);
    console.log("POLICY CHECK FAILED: Privy signed a transfer the policy should refuse (not broadcast). Stop and fix the policy.");
    process.exit(1);
  } catch (cause) {
    console.log(`policy refused the transfer, as it should: ${(cause instanceof Error ? cause.message : String(cause)).slice(0, 140)}`);
  }

  // 2. Approve exactly the amount, then swap USDG -> NVDA with a 1% minimum.
  const amountIn = parseUnits(usd.toFixed(2), 6);
  if (usdg < amountIn) throw new Error(`Not enough USDG: need ${usd}, have ${formatUnits(usdg, 6)}`);
  const fee = (await chain.readContract({ address: NVDA_POOL, abi: [{ type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] }], functionName: "fee" })) as number;
  const quote = await chain.simulateContract({ address: QUOTER_V2, abi: QUOTE_EXACT_INPUT_SINGLE_ABI, functionName: "quoteExactInputSingle", args: [{ tokenIn: USDG, tokenOut: NVDA, amountIn, fee, sqrtPriceLimitX96: 0n }] });
  const amountOut = quote.result[0];
  const minimum = (amountOut * BigInt(Math.round((1 - SLIPPAGE) * 10_000))) / 10_000n;
  console.log(`quote: $${usd} USDG -> ${formatUnits(amountOut, 18)} NVDA (min ${formatUnits(minimum, 18)}, pool fee ${fee})`);

  const approve = encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: "approve", args: [SWAP_ROUTER_02, amountIn] });
  const approveRaw = await sign(found.id, wallet, USDG, approve, 80_000n);
  console.log(`approve signed by Privy (${approveRaw.length / 2 - 1} bytes)`);
  if (!send) {
    console.log("dry run: nothing broadcast. Add --send to approve and swap for real.");
    return;
  }
  await broadcast("approve", approveRaw);

  const swap = encodeFunctionData({ abi: EXACT_INPUT_SINGLE_ABI, functionName: "exactInputSingle", args: [{ tokenIn: USDG, tokenOut: NVDA, fee, recipient: wallet, amountIn, amountOutMinimum: minimum, sqrtPriceLimitX96: 0n }] });
  const gas = await chain.estimateGas({ account: wallet, to: SWAP_ROUTER_02, data: swap });
  await broadcast("swap", await sign(found.id, wallet, SWAP_ROUTER_02, swap, (gas * 13n) / 10n));
  const nvda = await chain.readContract({ address: NVDA, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
  console.log(`done: wallet now holds ${formatUnits(nvda, 18)} NVDA`);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
