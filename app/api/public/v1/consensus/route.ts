import type { NextRequest } from "next/server";

import { consensusAnswer, consensusBody, TTL } from "@/lib/public-api/data";
import { publicGet, publicOptions } from "@/lib/public-api/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/v1/consensus: per market, how many Tested published paper agents are long, short or
 * in cash, and what they did in the newest hour. Every market, no filters (publicGet caches by path);
 * the MCP tool get_consensus filters by market and venue. Cached 5 minutes.
 */
export async function GET(request: NextRequest) {
  return publicGet(request, TTL.consensus, async () => consensusAnswer(await consensusBody(), {}));
}

export const OPTIONS = publicOptions;
