import type { NextRequest } from "next/server";

import { marketBody, TTL } from "@/lib/public-api/data";
import { publicGet, publicOptions } from "@/lib/public-api/http";

export const dynamic = "force-dynamic";

/** GET /api/public/v1/markets/{symbol}: one market with up to 30 days of hourly closes and the published agents trading it. Cached 60 seconds. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return publicGet(request, TTL.markets, () => marketBody(symbol));
}

export const OPTIONS = publicOptions;
