import "server-only";

import { ACTIVITY_HOURS, getActivity } from "@/lib/data/activity";
import { getAgentDetail, listAgents } from "@/lib/data/agents";
import { getMarketDetail, getMarketOverview } from "@/lib/data/markets";
import { loadAndVerifyAgent } from "@/lib/data/verify";
import { getLongbowListings } from "@/lib/longbow";
import { db } from "@/lib/supabase";

import { buildConsensus, consensusNote, MIN_CONSENSUS_AGENTS, type ConsensusAgent } from "./consensus";
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
  const difference = (value: { at: number; detail: string } | null) => (value ? { at: iso(value.at), detail: value.detail } : null);
  const before = result.unverifiable;
  const prices =
    "Since 2026-11-14 each decision stores the close the agent saw. A verifiable hour (its close and every close of its rules' look-back were stored) is replayed on exactly those closes, so a candle corrected later shows under priceCorrections, not as a difference; other hours are reported under unverifiable.";
  return {
    agentId: result.agentId,
    status: result.status,
    method: result.method,
    verifiedSince: result.verifiedSince === null ? null : iso(result.verifiedSince),
    hoursReplayed: result.hours,
    // Verifiable hours (all hours when none is).
    hoursVerified: result.verifiedSince === null ? result.hours : result.hours - (before?.hours ?? 0),
    hoursDiffering: result.hoursDiffering,
    firstHour: result.firstHour,
    lastHour: result.lastHour,
    trades: result.trades,
    value: { replay: Math.round(result.value.replay * 100) / 100, recorded: Math.round(result.value.recorded * 100) / 100, gapPct: Math.round(result.value.gapPct * 10000) / 10000 },
    firstDifference: difference(result.firstDifference),
    lastDifference: difference(result.lastDifference),
    // Hours whose look-back reads a close that was not stored: replayed on today's closes and shown in full, but a
    // difference there cannot be told apart from a close corrected after the agent acted, so they do not decide the status.
    unverifiable: before
      ? {
          hours: before.hours,
          hoursDiffering: before.hoursDiffering,
          firstDifference: difference(before.firstDifference),
          lastDifference: difference(before.lastDifference),
          note: "These hours read closes that were not stored with a decision (before 2026-11-14, when decisions began storing the close the agent saw, or an hour the agent did not run): they are replayed on today's closes, and a difference cannot be told apart from a close corrected after the agent acted.",
        }
      : null,
    priceCorrections: { hours: result.priceCorrections.hours, recent: result.priceCorrections.recent.map((row) => ({ ...row, at: iso(row.at) })) },
    howItWorks:
      result.method === "hour_by_hour"
        ? `Each hour the agent ran is replayed with Zolva's engine (runHour, open source: lib/engine/engine.ts) from the state Zolva recorded at the start of that hour, with its AI co-pilot's recorded vetoes; each trade (hour, market, side) and the hourly value are compared with the record. ${prices}`
        : `The agent is replayed with Zolva's engine (runHour, open source: lib/engine/engine.ts) from its first hour over every hour it ran, with funding; each trade (hour, market, side) and the hourly value are compared with the record. After a first difference, later hours can differ too. ${prices}`,
    disclaimer: DISCLAIMER,
  };
}

/**
 * get_consensus: per market, how many Tested published paper agents are long, short or flat, and what
 * they did in the newest hour. Every published market row; the MCP tool and REST route filter it.
 */
export async function consensusBody() {
  const client = db();
  const agents = (await listAgents(client, { periods: true })).filter((agent) => agent.tested && agent.status === "active");
  const ids = agents.map((agent) => agent.id);
  const newest = Math.max(0, ...agents.map((agent) => agent.lastTs ?? 0));
  const [positions, runs] = ids.length
    ? await Promise.all([
        client.from("positions").select("agent_id, token_address, side").in("agent_id", ids),
        newest ? client.from("agent_runs").select("agent_id, decisions").in("agent_id", ids).eq("ts", new Date(newest * 1000).toISOString()) : Promise.resolve({ data: [], error: null }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  for (const result of [positions, runs]) if (result.error) throw new Error(`Loading consensus failed: ${result.error.message}`);

  const symbolOf = new Map(agents.flatMap((agent) => agent.tokens.map((token) => [token.address, token.symbol] as const)));
  const positionsOf = new Map<string, Record<string, "long" | "short">>();
  for (const row of positions.data ?? []) {
    const symbol = symbolOf.get(row.token_address as string);
    if (!symbol) continue;
    const held = positionsOf.get(row.agent_id as string) ?? {};
    held[symbol] = row.side === "short" ? "short" : "long";
    positionsOf.set(row.agent_id as string, held);
  }
  const lastHourOf = new Map<string, ConsensusAgent["lastHour"]>();
  for (const run of runs.data ?? []) {
    const actions: NonNullable<ConsensusAgent["lastHour"]> = {};
    for (const decision of (run.decisions ?? []) as { token: string; action: NonNullable<ConsensusAgent["lastHour"]>[string] }[]) {
      const symbol = symbolOf.get(decision.token);
      if (symbol) actions[symbol] = decision.action;
    }
    lastHourOf.set(run.agent_id as string, actions);
  }

  const rows: ConsensusAgent[] = agents.map((agent) => ({
    id: agent.id,
    venue: agent.venue,
    markets: agent.tokens.map((token) => token.symbol),
    recordDays: Math.floor(agent.runs / 24),
    positions: positionsOf.get(agent.id) ?? {},
    lastHour: lastHourOf.get(agent.id) ?? null,
  }));
  return { agents: rows, asOf: newest ? new Date(newest * 1000).toISOString() : null };
}

/** The consensus answer for one filter, from the cached body. */
export function consensusAnswer(body: Awaited<ReturnType<typeof consensusBody>> | null, filter: { market?: string; venue?: "spot" | "perps" }) {
  const agents = body?.agents ?? [];
  const markets = buildConsensus(agents, filter);
  return {
    markets,
    asOf: body?.asOf ?? null,
    agentsCounted: agents.length,
    minAgents: MIN_CONSENSUS_AGENTS,
    note: consensusNote(markets, agents.length),
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
