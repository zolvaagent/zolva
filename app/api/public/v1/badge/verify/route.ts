import type { NextRequest } from "next/server";

import { TTL, verifyBadgeBody } from "@/lib/public-api/data";
import { publicGet, publicOptions } from "@/lib/public-api/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/v1/badge/verify: shields.io endpoint JSON for the README badge
 * "replay-verified N/M agents" (img.shields.io/endpoint?url=...). Reads the stored verify result of every
 * public agent (agent_verify_status); it never replays agents itself. Cached 5 minutes.
 */
export async function GET(request: NextRequest) {
  return publicGet(request, TTL.agents, () => verifyBadgeBody());
}

export const OPTIONS = publicOptions;
