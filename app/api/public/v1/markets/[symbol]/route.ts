import type { NextRequest } from "next/server";

import { getMarketDetail } from "@/lib/data/markets";
import { publicMarketDetail } from "@/lib/public-api/format";
import { publicGet, publicOptions } from "@/lib/public-api/http";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET /api/public/v1/markets/{symbol}: one market with up to 30 days of hourly closes and the published agents trading it. Cached 60 seconds. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return publicGet(request, 60, async () => {
    if (!/^[A-Za-z0-9]{1,12}$/.test(symbol)) return null;
    const detail = await getMarketDetail(db(), symbol);
    return detail ? publicMarketDetail(detail) : null;
  });
}

export const OPTIONS = publicOptions;
