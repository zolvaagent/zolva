import "server-only";

import { ACTIVITY_HOURS, getActivity } from "@/lib/data/activity";
import { getAgentDetail, listAgents } from "@/lib/data/agents";
import { getMarketDetail, getMarketOverview } from "@/lib/data/markets";
import { loadAndVerifyAgent } from "@/lib/data/verify";
import { getLongbowListings } from "@/lib/longbow";
import { db } from "@/lib/supabase";

import { DISCLAIMER, isPublicAgent, publicAgent, publicAgentDetail, publicMarket, publicMarketDetail, publicTrade } from "./format";

/**
 * The public API's five bodies, loaded from Supabase and shaped by format.ts. The REST
 * routes (app/api/public/v1) and the MCP tools (lib/public-api/mcp.ts) both call these
 * through the same edge cache, so they always return the same data. null = not found.
 */

export { TTL } from "./limits";

export async function agentsBody() {
  const agents = (await listAgents(db())).sort((a, b) => b.returnPct - a.returnPct);
  return { agents: agents.map(publicAgent), count: agents.length, disclaimer: DISCLAIMER };
}

export async function agentBody(id: string) {
  const detail = await getAgentDetail(db(), id.toLowerCase());
  return detail && isPublicAgent(detail) ? publicAgentDetail(detail, Date.now() / 1000) : null;
}

/**
 * "Verify this agent": the real engine replays every hour the agent ran on the same closes and funding,
 * and every trade and the value are compared with what Zolva recorded. Published paper agents only.
 */
export async function verifyBody(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const result = await loadAndVerifyAgent(db(), id.toLowerCase());
  if (!result) return null;
  const iso = (ts: number) => new Date(ts * 1000).toISOString();
  return {
    agentId: result.agentId,
    status: result.status,
    method: result.method,
    hoursReplayed: result.hours,
    hoursDiffering: result.hoursDiffering,
    firstHour: result.firstHour,
    lastHour: result.lastHour,
    trades: result.trades,
    value: { replay: Math.round(result.value.replay * 100) / 100, recorded: Math.round(result.value.recorded * 100) / 100, gapPct: Math.round(result.value.gapPct * 10000) / 10000 },
    firstDifference: result.firstDifference ? { at: iso(result.firstDifference.at), detail: result.firstDifference.detail } : null,
    lastDifference: result.lastDifference ? { at: iso(result.lastDifference.at), detail: result.lastDifference.detail } : null,
    // Why, when the stored decisions can tell: the hour's closes were corrected after the agent acted.
    cause: result.cause,
    howItWorks:
      result.method === "hour_by_hour"
        ? "Each hour the agent ran is replayed with Zolva's engine (runHour, open source: lib/engine/engine.ts) from the state Zolva recorded at the start of that hour, on the same cleaned hourly closes, with its AI co-pilot's recorded vetoes; each trade (hour, market, side) and the hourly value are compared with the record. A price corrected in one hour does not carry into the next."
        : "The agent is replayed with Zolva's engine (runHour, open source: lib/engine/engine.ts) from its first hour over every hour it ran, on the same cleaned hourly closes and funding; each trade (hour, market, side) and the hourly value are compared with the record. After a first difference, later hours can differ too.",
    disclaimer: DISCLAIMER,
  };
}

export async function marketsBody() {
  // Longbow is optional: when it cannot be read, every market's longbow is null.
  const [overview, longbow] = await Promise.all([getMarketOverview(db(), { perps: true }), getLongbowListings()]);
  return { markets: overview.rows.map((row) => publicMarket(row, longbow)), asOf: new Date(overview.asOf * 1000).toISOString(), usMarketOpen: overview.marketOpen };
}

export async function marketBody(symbol: string) {
  // Letters and digits, plus the -PERP suffix of Lighter perps (BTC-PERP).
  if (!/^[A-Za-z0-9]{1,12}(-PERP)?$/i.test(symbol)) return null;
  const [detail, longbow] = await Promise.all([getMarketDetail(db(), symbol, { perps: true }), getLongbowListings()]);
  return detail ? publicMarketDetail(detail, longbow) : null;
}

export async function activityBody() {
  const client = db();
  const [activity, agents] = await Promise.all([getActivity(client), listAgents(client)]);
  // The activity feed covers every paper agent; only published ones are public.
  const published = new Set(agents.map((agent) => agent.id));
  const trades = activity.trades.filter((trade) => published.has(trade.agentId)).sort((a, b) => b.ts - a.ts);
  return { trades: trades.map(publicTrade), hours: ACTIVITY_HOURS, disclaimer: DISCLAIMER };
}
