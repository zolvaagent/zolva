import { NextResponse, type NextRequest } from "next/server";
import type { Hex } from "viem";

import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createChainClient } from "@/lib/prices/onchain";
import { checkLimit } from "@/lib/public-api/http";
import { db } from "@/lib/supabase";
import { MAX_SLIPPAGE_BPS } from "@/lib/swap";
import { listSwapTokens, quoteSwap, tokenChart, walletBalances, walletHistory } from "@/lib/swap-server";

export const dynamic = "force-dynamic";

/**
 * GET: the tokens the swap card offers (USDG and every market with a v3 pool). Logged in, it
 * adds what the wallet holds of each (raw units) and its ETH for gas.
 * GET ?chart=0x…: a token's hourly closes for the last week (public).
 * GET ?history: the wallet's latest transactions with Zolva's tokens (logged in).
 * GET ?tx=0x…: whether that transaction has confirmed, so the card can wait for an approval
 * or a swap. Logged in only.
 */
export async function GET(request: NextRequest) {
  const owner = await getSessionAddress();
  const tx = request.nextUrl.searchParams.get("tx");
  const chart = request.nextUrl.searchParams.get("chart");
  if (chart !== null) {
    // Public: the same hourly closes as the Markets pages.
    if (!/^0x[0-9a-fA-F]{40}$/.test(chart)) return NextResponse.json({ error: "Not a token address." }, { status: 400 });
    const body = await tokenChart(db(), chart.toLowerCase() as Hex);
    return body ? NextResponse.json(body) : NextResponse.json({ error: "No prices for this token." }, { status: 404 });
  }
  if (request.nextUrl.searchParams.get("history") !== null) {
    if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
    const tokens = await listSwapTokens(db());
    return NextResponse.json({ transactions: await walletHistory(createChainClient(env.robinhoodRpcUrl), owner as Hex, tokens) });
  }
  if (tx === null) {
    const tokens = await listSwapTokens(db());
    if (!owner) return NextResponse.json({ tokens, balances: null, ethWei: null });
    const { tokens: balances, ethWei } = await walletBalances(createChainClient(env.robinhoodRpcUrl), owner as Hex, tokens);
    return NextResponse.json({ tokens, balances, ethWei });
  }
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return NextResponse.json({ error: "Not a transaction hash." }, { status: 400 });
  try {
    const receipt = await createChainClient(env.robinhoodRpcUrl).getTransactionReceipt({ hash: tx as Hex });
    return NextResponse.json({ status: receipt.status === "success" ? "confirmed" : "failed" });
  } catch {
    // Not mined yet (viem throws TransactionReceiptNotFoundError).
    return NextResponse.json({ status: "pending" });
  }
}

/**
 * Quotes a swap: { tokenIn, tokenOut, amountIn (base units), slippageBps }. With a logged in
 * wallet it adds the balance and the router allowance. Read only: nothing is signed or sent
 * here; the browser wallet signs the swap itself.
 */
export async function POST(request: NextRequest) {
  // Quotes work logged out too (no balance or allowance then), like any swap page.
  const owner = await getSessionAddress();
  if ((await checkLimit(request)) === "limited") return NextResponse.json({ error: "Too many quotes. Wait a minute and try again." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { tokenIn?: unknown; tokenOut?: unknown; amountIn?: unknown; slippageBps?: unknown } | null;
  const tokens = await listSwapTokens(db());
  const find = (value: unknown) => tokens.find((token) => typeof value === "string" && token.address === value.toLowerCase());
  const tokenIn = find(body?.tokenIn);
  const tokenOut = find(body?.tokenOut);
  if (!tokenIn || !tokenOut || tokenIn.address === tokenOut.address) return NextResponse.json({ error: "Pick two different tokens from the list." }, { status: 400 });
  if (typeof body?.amountIn !== "string" || !/^\d{1,40}$/.test(body.amountIn) || BigInt(body.amountIn) === 0n) return NextResponse.json({ error: "Enter an amount above zero." }, { status: 400 });
  const slippageBps = typeof body.slippageBps === "number" && Number.isInteger(body.slippageBps) && body.slippageBps >= 1 && body.slippageBps <= MAX_SLIPPAGE_BPS ? body.slippageBps : null;
  if (slippageBps === null) return NextResponse.json({ error: `Slippage must be between 0.01% and ${MAX_SLIPPAGE_BPS / 100}%.` }, { status: 400 });

  try {
    const quote = await quoteSwap(createChainClient(env.robinhoodRpcUrl), { tokenIn, tokenOut, amountIn: BigInt(body.amountIn), slippageBps, owner: owner ? (owner as Hex) : null });
    return NextResponse.json(quote);
  } catch (cause) {
    console.error("swap quote", cause instanceof Error ? cause.message.replace(/https?:\/\/\S+/g, "[url]") : cause);
    return NextResponse.json({ error: "No quote right now: the pool may be too thin for this amount. Try a smaller amount." }, { status: 502 });
  }
}
