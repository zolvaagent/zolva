import type { NextRequest } from "next/server";

import { agentsBody, TTL } from "@/lib/public-api/data";
import { publicGet, publicOptions } from "@/lib/public-api/http";

export const dynamic = "force-dynamic";

/** GET /api/public/v1/agents: every published paper agent, best return first. Cached 5 minutes. */
export async function GET(request: NextRequest) {
  return publicGet(request, TTL.agents, agentsBody);
}

export const OPTIONS = publicOptions;
