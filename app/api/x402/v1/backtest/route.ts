import type { NextRequest } from "next/server";

import { getMarket, type Market } from "@/lib/data/market";
import { db } from "@/lib/supabase";
import { PREMIUM_ENDPOINTS } from "@/lib/x402/catalog";
import { parseBacktestRequest, runBacktest, type BacktestRequest } from "@/lib/x402/premium";
import { paidCall, paidOptions } from "@/lib/x402/server";

export const dynamic = "force-dynamic";

/** POST /api/x402/v1/backtest (paid, x402): replays a strategy with Zolva's engine. The body is checked before any charge. */
export async function POST(request: NextRequest) {
  return paidCall<{ request: BacktestRequest; market: Market }>(request, {
    price: PREMIUM_ENDPOINTS.backtest.price,
    description: PREMIUM_ENDPOINTS.backtest.description,
    prepare: async (req) => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return { errors: ["The body must be JSON"] };
      }
      const market = await getMarket(db());
      const parsed = parseBacktestRequest(body, market);
      return parsed.request ? { input: { request: parsed.request, market } } : { errors: parsed.errors };
    },
    run: async ({ request: backtest, market }) => runBacktest(backtest, market),
  });
}

export const OPTIONS = paidOptions;
