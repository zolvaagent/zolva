/**
 * $ZOLVA buyback and burn from Zolva's swap-fee wallet. Owner only, run by hand:
 *
 *   npm run zolva:buyback                 dry run: balances and what a buyback would burn now
 *   npm run zolva:buyback -- --execute    buys ZOLVA with the wallet's USDG and WETH, burns it
 *
 * The fee wallet's key lives in .dev.vars (SWAP_FEE_WALLET_KEY; created on the first run, never
 * printed). Set SWAP_FEE_RECIPIENT to the address this prints, so swap fees land there. The
 * wallet needs a little ETH for gas.
 *
 * Each buyback goes through the same route as the swap card (Uniswap Universal Router, ZOLVA's
 * Pons pool, lib/swap-zolva.ts) with no Zolva fee on itself and at most 2% slippage, then every
 * ZOLVA the wallet holds is sent to the dead address. The transactions are appended to
 * docs/zolva-burns.md, the public burn log.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, erc20Abi, formatEther, formatUnits, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { QUOTE_EXACT_INPUT_SINGLE_ABI, QUOTER_V2, USDG } from "../lib/live/contracts.ts";
import { DEAD, PERMIT2, PERMIT2_ABI, permit2ApproveCall, UNIVERSAL_ROUTER, V4_QUOTE_ABI, V4_QUOTER, WETH, ZOLVA, ZOLVA_POOL_KEY, zolvaSwapCall } from "../lib/swap-zolva.ts";

const SLIPPAGE_BPS = 200n;
/** Below these the buyback is skipped: gas would eat a real part of it. */
const MIN_USDG = 1_000_000n; // 1 USDG
const MIN_WETH = 500_000_000_000_000n; // 0.0005 WETH
/** The v3 WETH/USDG pool the swap card bridges through (0.01%). */
const WETH_USDG_FEE = 100;

const DEV_VARS = new URL("../.dev.vars", import.meta.url);
const text = readFileSync(DEV_VARS, "utf8");
const rpcUrl = text.match(/^ROBINHOOD_RPC_URL=(.*)$/m)?.[1].trim();
if (!rpcUrl) throw new Error("ROBINHOOD_RPC_URL is missing in .dev.vars");
let key = text.match(/^SWAP_FEE_WALLET_KEY=(0x[0-9a-f]{64})\s*$/m)?.[1] as Hex | undefined;
if (!key) {
  key = generatePrivateKey();
  writeFileSync(DEV_VARS, `${text.trimEnd()}\nSWAP_FEE_WALLET_KEY=${key}\n`);
  console.log("Created a new fee wallet key in .dev.vars (SWAP_FEE_WALLET_KEY).");
}
const account = privateKeyToAccount(key);
const recipient = text.match(/^SWAP_FEE_RECIPIENT=(0x[0-9a-fA-F]{40})\s*$/m)?.[1]?.toLowerCase();

const robinhood = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
const chain = createPublicClient({ chain: robinhood, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain: robinhood, transport: http(rpcUrl) });
const execute = process.argv.includes("--execute");

const balanceOf = (token: Hex) => chain.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
const quoteBuy = async (other: "usdg" | "weth", amount: bigint) => {
  const ethIn =
    other === "usdg"
      ? (await chain.simulateContract({ address: QUOTER_V2, abi: QUOTE_EXACT_INPUT_SINGLE_ABI, functionName: "quoteExactInputSingle", args: [{ tokenIn: USDG, tokenOut: WETH, amountIn: amount, fee: WETH_USDG_FEE, sqrtPriceLimitX96: 0n }] })).result[0]
      : amount;
  return (await chain.simulateContract({ address: V4_QUOTER, abi: V4_QUOTE_ABI, functionName: "quoteExactInputSingle", args: [{ poolKey: ZOLVA_POOL_KEY, zeroForOne: true, exactAmount: ethIn, hookData: "0x" }] })).result[0];
};
const sendAndWait = async (label: string, to: Hex, data: Hex): Promise<Hex> => {
  const hash = await wallet.sendTransaction({ to, data });
  const receipt = await chain.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} failed on chain: ${hash}`);
  console.log(`  ${label}: ${hash}`);
  return hash;
};

async function main() {
  console.log(`fee wallet: ${account.address}`);
  if (recipient !== account.address.toLowerCase()) console.log(`  note: SWAP_FEE_RECIPIENT is ${recipient ?? "not set"}; set it to ${account.address} so swap fees land here.`);
  const [eth, usdg, weth, zolva] = await Promise.all([chain.getBalance({ address: account.address }), balanceOf(USDG), balanceOf(WETH), balanceOf(ZOLVA)]);
  console.log(`  ETH (gas) ${formatEther(eth)} · USDG ${formatUnits(usdg, 6)} · WETH ${formatEther(weth)} · ZOLVA ${formatUnits(zolva, 18)}`);

  const legs = [
    { other: "usdg" as const, token: USDG as Hex, amount: usdg, enough: usdg >= MIN_USDG, label: `${formatUnits(usdg, 6)} USDG` },
    { other: "weth" as const, token: WETH as Hex, amount: weth, enough: weth >= MIN_WETH, label: `${formatEther(weth)} WETH` },
  ];
  for (const leg of legs.filter((item) => item.amount > 0n)) {
    if (!leg.enough) {
      console.log(`  ${leg.label}: below the minimum, kept for next time`);
      continue;
    }
    const out = await quoteBuy(leg.other, leg.amount);
    console.log(`  ${leg.label} -> about ${formatUnits(out, 18)} ZOLVA to burn`);
  }
  if (!execute) {
    console.log("dry run: nothing sent. Add --execute to buy back and burn.");
    return;
  }
  if (eth < 20_000_000_000_000n) throw new Error("The fee wallet needs a little ETH for gas (at least 0.00002 ETH).");

  const done: { spent: string; hashes: Hex[] }[] = [];
  for (const leg of legs.filter((item) => item.enough)) {
    console.log(`buying back with ${leg.label}`);
    const hashes: Hex[] = [];
    // Exact approvals only: the token to Permit2, then Permit2 to the router for 30 minutes.
    const allowance = await chain.readContract({ address: leg.token, abi: erc20Abi, functionName: "allowance", args: [account.address, PERMIT2] });
    if (allowance < leg.amount) hashes.push(await sendAndWait("approve Permit2", leg.token, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [PERMIT2, leg.amount] })));
    const [permitted, expiration] = await chain.readContract({ address: PERMIT2, abi: PERMIT2_ABI, functionName: "allowance", args: [account.address, leg.token, UNIVERSAL_ROUTER] });
    const now = Math.floor(Date.now() / 1000);
    if (permitted < leg.amount || expiration < now + 60) hashes.push(await sendAndWait("Permit2 allows the router", PERMIT2, permit2ApproveCall(leg.token, leg.amount, now)));
    const quote = await quoteBuy(leg.other, leg.amount);
    const minOut = (quote * (10_000n - SLIPPAGE_BPS)) / 10_000n;
    hashes.push(await sendAndWait("buy ZOLVA", UNIVERSAL_ROUTER, zolvaSwapCall({ leg: { buy: true, other: leg.other }, amountIn: leg.amount, minOut, wethUsdgFee: WETH_USDG_FEE, deadline: now + 600, fee: null })));
    done.push({ spent: leg.label, hashes });
  }
  const toBurn = await balanceOf(ZOLVA);
  if (toBurn === 0n) {
    console.log("nothing to burn");
    return;
  }
  const burn = await sendAndWait(`burn ${formatUnits(toBurn, 18)} ZOLVA`, ZOLVA, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [DEAD, toBurn] }));

  // The public log: one row per run.
  const log = new URL("../docs/zolva-burns.md", import.meta.url);
  if (!existsSync(log)) {
    writeFileSync(
      log,
      "# $ZOLVA buyback and burn log\n\nZolva's swap fee (0.25% on USDG, ETH, BTC and ZOLVA pairs; stock tokens pay none) is collected in the fee wallet and used to buy back ZOLVA, which is then sent to the dead address. On ZOLVA buys in the swap card the fee is burnt in the same transaction instead.\n\n| Date (UTC) | Spent | ZOLVA burnt | Burn tx | Buy txs |\n| --- | --- | --- | --- | --- |\n",
    );
  }
  const date = new Date().toISOString().slice(0, 16).replace("T", " ");
  appendFileSync(log, `| ${date} | ${done.map((item) => item.spent).join(" + ") || "earlier balance"} | ${formatUnits(toBurn, 18)} | ${burn} | ${done.flatMap((item) => item.hashes).join(", ")} |\n`);
  console.log("logged in docs/zolva-burns.md");
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
