import type { NextRequest } from "next/server";

import { listAgents } from "@/lib/data/agents";
import { DISCLAIMER, publicAgent } from "@/lib/public-api/format";
import { publicGet, publicOptions } from "@/lib/public-api/http";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET /api/public/v1/agents: every published paper agent, best return first. Cached 5 minutes. */
export async function GET(request: NextRequest) {
  return publicGet(request, 300, async () => {
    const agents = (await listAgents(db())).sort((a, b) => b.returnPct - a.returnPct);
    return { agents: agents.map(publicAgent), count: agents.length, disclaimer: DISCLAIMER };
  });
}

export const OPTIONS = publicOptions;
