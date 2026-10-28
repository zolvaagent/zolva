/**
 * Live executor smoke test (owner only, real money, small): runs the same
 * executeSwap the hourly runner uses, outside the database.
 *
 *   npm run live:smoke -- <wallet> <usd>
 *
 * 1. Buys <usd> of NVDA with USDG, checked against NVDA's latest hourly close.
 * 2. Sells the wallet's whole NVDA balance back to USDG.
 * Each step prints the fill, the price against the reference and the gas.
 */
import { readFileSync } from "node:fs";

import { PrivyClient } from "@privy-io/node";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, erc20Abi, formatUnits, http, parseUnits, type Hex } from "viem";

import { USDG } from "../lib/live/contracts.ts";
import { executeSwap, type LiveContext, type SwapOrder } from "../lib/live/executor.ts";

const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" as Hex;
const MAX_USD = 5;

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);

async function main() {
  const wallet = (process.argv[2] ?? "").toLowerCase() as Hex;
  const usd = Number(process.argv[3]);
  if (!/^0x[0-9a-f]{40}$/.test(wallet) || !(usd > 0 && usd <= MAX_USD)) throw new Error(`Usage: npm run live:smoke -- <wallet> <usd up to ${MAX_USD}>`);

  const chain = createPublicClient({ transport: http(vars.ROBINHOOD_RPC_URL) });
  const privy = new PrivyClient({ appId: vars.PRIVY_APP_ID, appSecret: vars.PRIVY_APP_SECRET });
  const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const found = (await privy.wallets().list({ address: wallet, chain_type: "ethereum" })).data?.[0];
  if (!found) throw new Error(`No Privy wallet ${wallet}`);

  const { data: token } = await db.from("tokens").select("price_pool, token_decimals").eq("address", NVDA).single();
  const { data: candle } = await db.from("candles").select("ts, close").eq("token_address", NVDA).order("ts", { ascending: false }).limit(1).single();
  const reference = Number(candle!.close);
  console.log(`reference: NVDA hourly close ${reference.toFixed(2)} at ${candle!.ts}`);

  const ctx: LiveContext = { chain: chain as never, privy, authorizationKey: vars.PRIVY_AUTHORIZATION_KEY, walletId: found.id, wallet, ethUsd: 2400 };
  const base = { pool: token!.price_pool as Hex, tokenDecimals: Number(token!.token_decimals), referencePrice: reference, maxSlippageBps: 100, maxDeviationBps: 200 };
  const report = (label: string, result: Awaited<ReturnType<typeof executeSwap>>, order: SwapOrder) => {
    if (!result.ok) {
      console.log(`${label}: ${result.stage} stopped it: ${result.error}${result.txHash ? ` (tx ${result.txHash})` : ""}`);
      return false;
    }
    const gap = (result.price / reference - 1) * 100;
    console.log(
      `${label}: ${formatUnits(result.amountIn, order.side === "buy" ? 6 : 18)} in, ${formatUnits(result.amountOut, order.side === "buy" ? 18 : 6)} out, price ${result.price.toFixed(2)} (${gap >= 0 ? "+" : ""}${gap.toFixed(2)}% vs close), gas ${result.gasUsed} ($${result.gasCostUsd.toFixed(4)})  https://robinhoodchain.blockscout.com/tx/${result.txHash}`,
    );
    return true;
  };

  const buy: SwapOrder = { ...base, side: "buy", tokenIn: USDG as Hex, tokenOut: NVDA, amountIn: parseUnits(usd.toFixed(2), 6) };
  if (!report("buy", await executeSwap(ctx, buy, async (hash) => console.log(`buy submitted ${hash}`)), buy)) process.exit(1);

  const held = await chain.readContract({ address: NVDA, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
  const sell: SwapOrder = { ...base, side: "sell", tokenIn: NVDA, tokenOut: USDG as Hex, amountIn: held };
  if (!report("sell", await executeSwap(ctx, sell, async (hash) => console.log(`sell submitted ${hash}`)), sell)) process.exit(1);

  const usdg = await chain.readContract({ address: USDG as Hex, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
  console.log(`done: wallet holds ${formatUnits(usdg, 6)} USDG and no NVDA`);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
