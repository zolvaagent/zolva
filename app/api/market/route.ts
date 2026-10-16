import { NextResponse } from "next/server";

import { getMarket } from "@/lib/data/market";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Cleaned hourly closes of every stock token (about 900 hours), used by the
 * Studio to backtest in the browser. Public market data; cached briefly.
 */
export async function GET() {
  const client = db();
  const market = await getMarket(client);
  return NextResponse.json(market, { headers: { "Cache-Control": "public, max-age=300" } });
}
