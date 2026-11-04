import type { NextRequest } from "next/server";

import { getMarketOverview } from "@/lib/data/markets";
import { publicMarket } from "@/lib/public-api/format";
import { publicGet, publicOptions } from "@/lib/public-api/http";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET /api/public/v1/markets: every market Zolva prices, with the latest hourly close. Cached 60 seconds. */
export async function GET(request: NextRequest) {
  return publicGet(request, 60, async () => {
    const overview = await getMarketOverview(db());
    return { markets: overview.rows.map(publicMarket), asOf: new Date(overview.asOf * 1000).toISOString(), usMarketOpen: overview.marketOpen };
  });
}

export const OPTIONS = publicOptions;
