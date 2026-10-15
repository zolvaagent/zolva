import { NextResponse } from "next/server";

import { getMarket } from "@/lib/data/market";

export const dynamic = "force-dynamic";

/**
 * Cleaned hourly closes of every stock token (about 900 hours), used by the
 * Forge to backtest in the browser. Public market data; cached briefly.
 */
export async function GET() {
  const market = await getMarket();
  return NextResponse.json(market, { headers: { "Cache-Control": "public, max-age=300" } });
}
