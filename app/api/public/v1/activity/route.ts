import type { NextRequest } from "next/server";

import { ACTIVITY_HOURS, getActivity } from "@/lib/data/activity";
import { listAgents } from "@/lib/data/agents";
import { DISCLAIMER, publicTrade } from "@/lib/public-api/format";
import { publicGet, publicOptions } from "@/lib/public-api/http";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET /api/public/v1/activity: trades by published paper agents over the last 48 hours, newest first. Cached 60 seconds. */
export async function GET(request: NextRequest) {
  return publicGet(request, 60, async () => {
    const client = db();
    const [activity, agents] = await Promise.all([getActivity(client), listAgents(client)]);
    // The activity feed covers every paper agent; only published ones are public.
    const published = new Set(agents.map((agent) => agent.id));
    const trades = activity.trades.filter((trade) => published.has(trade.agentId)).sort((a, b) => b.ts - a.ts);
    return { trades: trades.map(publicTrade), hours: ACTIVITY_HOURS, disclaimer: DISCLAIMER };
  });
}

export const OPTIONS = publicOptions;
