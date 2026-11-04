import type { NextRequest } from "next/server";

import { marketsBody, TTL } from "@/lib/public-api/data";
import { publicGet, publicOptions } from "@/lib/public-api/http";

export const dynamic = "force-dynamic";

/** GET /api/public/v1/markets: every market Zolva prices, with the latest hourly close. Cached 60 seconds. */
export async function GET(request: NextRequest) {
  return publicGet(request, TTL.markets, marketsBody);
}

export const OPTIONS = publicOptions;
