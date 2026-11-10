import "server-only";

import { ACTIVITY_HOURS, getActivity } from "@/lib/data/activity";
import { getAgentDetail, listAgents } from "@/lib/data/agents";
import { getMarketDetail, getMarketOverview } from "@/lib/data/markets";
import { db } from "@/lib/supabase";

import { DISCLAIMER, isPublicAgent, publicAgent, publicAgentDetail, publicMarket, publicMarketDetail, publicTrade } from "./format";

/**
 * The public API's five bodies, loaded from Supabase and shaped by format.ts. The REST
 * routes (app/api/public/v1) and the MCP tools (lib/public-api/mcp.ts) both call these
 * through the same edge cache, so they always return the same data. null = not found.
 */

/** How long each body may be reused, in seconds. */
export const TTL = { agents: 300, markets: 60, activity: 60 } as const;

export async function agentsBody() {
  const agents = (await listAgents(db())).sort((a, b) => b.returnPct - a.returnPct);
  return { agents: agents.map(publicAgent), count: agents.length, disclaimer: DISCLAIMER };
}

export async function agentBody(id: string) {
  const detail = await getAgentDetail(db(), id.toLowerCase());
  return detail && isPublicAgent(detail) ? publicAgentDetail(detail, Date.now() / 1000) : null;
}

export async function marketsBody() {
  const overview = await getMarketOverview(db(), { perps: true });
  return { markets: overview.rows.map(publicMarket), asOf: new Date(overview.asOf * 1000).toISOString(), usMarketOpen: overview.marketOpen };
}

export async function marketBody(symbol: string) {
  // Letters and digits, plus the -PERP suffix of Lighter perps (BTC-PERP).
  if (!/^[A-Za-z0-9]{1,12}(-PERP)?$/i.test(symbol)) return null;
  const detail = await getMarketDetail(db(), symbol, { perps: true });
  return detail ? publicMarketDetail(detail) : null;
}

export async function activityBody() {
  const client = db();
  const [activity, agents] = await Promise.all([getActivity(client), listAgents(client)]);
  // The activity feed covers every paper agent; only published ones are public.
  const published = new Set(agents.map((agent) => agent.id));
  const trades = activity.trades.filter((trade) => published.has(trade.agentId)).sort((a, b) => b.ts - a.ts);
  return { trades: trades.map(publicTrade), hours: ACTIVITY_HOURS, disclaimer: DISCLAIMER };
}
