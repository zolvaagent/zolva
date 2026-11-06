import type { NextRequest } from "next/server";

import { getMarket } from "@/lib/data/market";
import { db } from "@/lib/supabase";
import { PREMIUM_ENDPOINTS } from "@/lib/x402/catalog";
import { scanMarkets } from "@/lib/x402/premium";
import { paidCall, paidOptions } from "@/lib/x402/server";

export const dynamic = "force-dynamic";

/** GET /api/x402/v1/scan (paid, x402): every market at the latest hour, deepest dip first. */
export async function GET(request: NextRequest) {
  return paidCall(request, {
    price: PREMIUM_ENDPOINTS.scan.price,
    description: PREMIUM_ENDPOINTS.scan.description,
    prepare: async () => ({ input: null }),
    run: async () => scanMarkets(await getMarket(db())),
  });
}

export const OPTIONS = paidOptions;
