import { NextResponse, type NextRequest } from "next/server";
import type { Hex } from "viem";

import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createChainClient } from "@/lib/prices/onchain";
import { checkLimit } from "@/lib/public-api/http";
import { db } from "@/lib/supabase";
import { MAX_SLIPPAGE_BPS, USDG } from "@/lib/swap";
import { listSwapTokens, quoteSwap } from "@/lib/swap-server";

export const dynamic = "force-dynamic";

/**
 * GET: the tokens the Swap card offers (USDG and every market with a v3 pool).
 * GET ?tx=0x…: whether that transaction has confirmed, so the card can wait for an approval
 * or a swap. Logged in only.
 */
export async function GET(request: NextRequest) {
  if (!(await getSessionAddress())) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const tx = request.nextUrl.searchParams.get("tx");
  if (tx === null) return NextResponse.json({ tokens: await listSwapTokens(db()) });
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
 * Quotes a swap for the logged in wallet: { tokenIn, tokenOut, amountIn (base units), slippageBps }.
 * Read only: nothing is signed or sent here; the browser wallet signs the swap itself.
 */
export async function POST(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if ((await checkLimit(request)) === "limited") return NextResponse.json({ error: "Too many quotes. Wait a minute and try again." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { tokenIn?: unknown; tokenOut?: unknown; amountIn?: unknown; slippageBps?: unknown } | null;
  const tokens = await listSwapTokens(db());
  const find = (value: unknown) => tokens.find((token) => typeof value === "string" && token.address === value.toLowerCase());
  const tokenIn = find(body?.tokenIn);
  const tokenOut = find(body?.tokenOut);
  if (!tokenIn || !tokenOut || tokenIn.address === tokenOut.address) return NextResponse.json({ error: "Pick two different tokens from the list." }, { status: 400 });
  if ((tokenIn.address === USDG) === (tokenOut.address === USDG)) return NextResponse.json({ error: "One side of a swap must be USDG." }, { status: 400 });
  if (typeof body?.amountIn !== "string" || !/^\d{1,40}$/.test(body.amountIn) || BigInt(body.amountIn) === 0n) return NextResponse.json({ error: "Enter an amount above zero." }, { status: 400 });
  const slippageBps = typeof body.slippageBps === "number" && Number.isInteger(body.slippageBps) && body.slippageBps >= 1 && body.slippageBps <= MAX_SLIPPAGE_BPS ? body.slippageBps : null;
  if (slippageBps === null) return NextResponse.json({ error: `Slippage must be between 0.01% and ${MAX_SLIPPAGE_BPS / 100}%.` }, { status: 400 });

  try {
    const quote = await quoteSwap(createChainClient(env.robinhoodRpcUrl), { tokenIn, tokenOut, amountIn: BigInt(body.amountIn), slippageBps, owner: owner as Hex });
    return NextResponse.json(quote);
  } catch (cause) {
    console.error("swap quote", cause instanceof Error ? cause.message.replace(/https?:\/\/\S+/g, "[url]") : cause);
    return NextResponse.json({ error: "No quote right now: the pool may be too thin for this amount. Try a smaller amount." }, { status: 502 });
  }
}
