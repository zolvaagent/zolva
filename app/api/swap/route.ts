import { NextResponse, type NextRequest } from "next/server";
import type { Hex } from "viem";

import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createChainClient } from "@/lib/prices/onchain";
import { checkLimit } from "@/lib/public-api/http";
import { db } from "@/lib/supabase";
import { isAddressQuery, MAX_IMPORTED, MAX_SLIPPAGE_BPS, type SwapToken } from "@/lib/swap";
import { listSwapTokens, lookupToken, quoteSwap, tokenChart, walletBalances, walletHistory, ZolvaPairError } from "@/lib/swap-server";

export const dynamic = "force-dynamic";

/**
 * GET: the tokens the swap card offers (USDG and every market with a v3 pool). Logged in, it
 * adds what the wallet holds of each (raw units) and its ETH for gas.
 * GET ?chart=0x…: a token's hourly closes for the last week (public).
 * GET ?history: the wallet's latest transactions with Zolva's tokens (logged in).
 * GET ?tx=0x…: whether that transaction has confirmed, so the card can wait for an approval
 * or a swap. Logged in only.
 * GET ?lookup=0x…: what a pasted contract address is (public, rate limited): an allowlisted
 * token, another token with or without a v3 USDG route, or not a token. Logged in, it adds the
 * wallet's balance of it.
 * GET ?imported=0x…,0x…: the list as above, plus the tokens this browser imported (at most
 * MAX_IMPORTED, each looked up again on chain; ones without a route are left out).
 */
export async function GET(request: NextRequest) {
  const owner = await getSessionAddress();
  const lookup = request.nextUrl.searchParams.get("lookup");
  if (lookup !== null) {
    if (!isAddressQuery(lookup)) return NextResponse.json({ error: "Not a contract address." }, { status: 400 });
    if ((await checkLimit(request)) === "limited") return NextResponse.json({ error: "Too many lookups. Wait a minute and try again." }, { status: 429 });
    const chain = createChainClient(env.robinhoodRpcUrl);
    const result = await lookupToken(chain, lookup.trim() as Hex, await listSwapTokens(db()), { address: env.zolvaToken?.address ?? null, tradeUrl: env.zolvaLinks.tradeUrl });
    if (result.kind === "not-token" || !owner) return NextResponse.json({ ...result, balance: null });
    const { tokens: balances } = await walletBalances(chain, owner as Hex, [result.token]);
    return NextResponse.json({ ...result, balance: balances[result.token.address] ?? "0" });
  }
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
    const tokens = await withImported(await listSwapTokens(db()), request.nextUrl.searchParams.get("imported"));
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
  // A token off the list is looked up on chain again here, so its pool never comes from the browser.
  const chain = createChainClient(env.robinhoodRpcUrl);
  const find = async (value: unknown): Promise<SwapToken | undefined> => {
    if (typeof value !== "string" || !isAddressQuery(value)) return undefined;
    const result = await lookupToken(chain, value.trim() as Hex, tokens);
    if (result.kind === "listed") return result.token;
    return result.kind === "token" && result.routable ? result.token : undefined;
  };
  const [tokenIn, tokenOut] = await Promise.all([find(body?.tokenIn), find(body?.tokenOut)]);
  if (!tokenIn || !tokenOut || tokenIn.address === tokenOut.address) return NextResponse.json({ error: "Pick two different tokens that Zolva can route." }, { status: 400 });
  if (typeof body?.amountIn !== "string" || !/^\d{1,40}$/.test(body.amountIn) || BigInt(body.amountIn) === 0n) return NextResponse.json({ error: "Enter an amount above zero." }, { status: 400 });
  const slippageBps = typeof body.slippageBps === "number" && Number.isInteger(body.slippageBps) && body.slippageBps >= 1 && body.slippageBps <= MAX_SLIPPAGE_BPS ? body.slippageBps : null;
  if (slippageBps === null) return NextResponse.json({ error: `Slippage must be between 0.01% and ${MAX_SLIPPAGE_BPS / 100}%.` }, { status: 400 });

  try {
    const quote = await quoteSwap(chain, { tokenIn, tokenOut, amountIn: BigInt(body.amountIn), slippageBps, owner: owner ? (owner as Hex) : null });
    return NextResponse.json(quote);
  } catch (cause) {
    if (cause instanceof ZolvaPairError) return NextResponse.json({ error: cause.message }, { status: 400 });
    console.error("swap quote", cause instanceof Error ? cause.message.replace(/https?:\/\/\S+/g, "[url]") : cause);
    return NextResponse.json({ error: "No quote right now: the pool may be too thin for this amount. Try a smaller amount." }, { status: 502 });
  }
}

/** Adds this browser's imported tokens (comma separated addresses) that still have a route. */
async function withImported(tokens: SwapToken[], imported: string | null): Promise<SwapToken[]> {
  const addresses = [...new Set((imported ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(isAddressQuery))].slice(0, MAX_IMPORTED);
  if (!addresses.length) return tokens;
  const chain = createChainClient(env.robinhoodRpcUrl);
  const found = await Promise.all(addresses.map((address) => lookupToken(chain, address as Hex, tokens).catch(() => null)));
  return [...tokens, ...found.flatMap((result) => (result?.kind === "token" && result.routable ? [result.token] : []))];
}
