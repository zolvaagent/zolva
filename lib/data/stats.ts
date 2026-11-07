import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Days of history in the activity chart on /stats. */
export const STATS_DAYS = 30;

export type PublicStats = {
  totals: {
    /** One agent looking at one token in one hour, with written reasoning (holds included). */
    decisions: number;
    agentHours: number;
    engineHours: number;
    /** Unix seconds. */
    firstRun: number | null;
    lastTick: number | null;
    paperTrades: number;
    /** Simulated dollars traded by paper agents. */
    paperVolume: number;
    liveTrades: number;
    agentsActive: number;
    agentsTotal: number;
    candles: number;
    firstCandle: number | null;
    markets: number;
    aiReviews: number;
    aiStrategies: number;
  };
  /** Per UTC day, oldest first. `ts` is unix seconds at midnight UTC. */
  daily: { ts: number; decisions: number; trades: number }[];
  topTokens: { symbol: string; trades: number }[];
  strategies: { strategy: string; agents: number }[];
  /** Latest confirmed real money trades, newest first. */
  live: { ts: number; symbol: string; side: string; usd: number | null; txHash: string }[];
  /** Unix seconds when the stats were read. */
  builtAt: number;
};

type RawStats = {
  totals: Record<string, string | number | null>;
  daily: { day: string; decisions: number; trades: number }[];
  top_tokens: { symbol: string; trades: number }[];
  strategies: { strategy: string; agents: number }[];
  live: { confirmed_at: string; symbol: string; side: string; usd: number | null; tx_hash: string }[];
};

const seconds = (value: string | number | null | undefined) => (typeof value === "string" ? Math.floor(Date.parse(value) / 1000) : null);
const count = (value: string | number | null | undefined) => Number(value ?? 0);

/** Everything the engine has done since launch, from the public_stats SQL function (one call). */
export async function getPublicStats(db: SupabaseClient): Promise<PublicStats> {
  const { data, error } = await db.rpc("public_stats", { p_days: STATS_DAYS });
  if (error) throw new Error(`Loading stats failed: ${error.message}`);
  const raw = data as RawStats;
  const t = raw.totals;
  return {
    totals: {
      decisions: count(t.decisions),
      agentHours: count(t.agent_hours),
      engineHours: count(t.engine_hours),
      firstRun: seconds(t.first_run),
      lastTick: seconds(t.last_tick),
      paperTrades: count(t.paper_trades),
      paperVolume: count(t.paper_volume),
      liveTrades: count(t.live_trades),
      agentsActive: count(t.agents_active),
      agentsTotal: count(t.agents_total),
      candles: count(t.candles),
      firstCandle: seconds(t.first_candle),
      markets: count(t.markets),
      aiReviews: count(t.ai_reviews),
      aiStrategies: count(t.ai_strategies),
    },
    daily: raw.daily.map((day) => ({ ts: seconds(day.day) ?? 0, decisions: count(day.decisions), trades: count(day.trades) })),
    topTokens: raw.top_tokens.map((token) => ({ symbol: token.symbol, trades: count(token.trades) })),
    strategies: raw.strategies.map((row) => ({ strategy: row.strategy, agents: count(row.agents) })),
    builtAt: Math.floor(Date.now() / 1000),
    live: raw.live.map((row) => ({ ts: seconds(row.confirmed_at) ?? 0, symbol: row.symbol, side: row.side, usd: row.usd === null ? null : Number(row.usd), txHash: row.tx_hash })),
  };
}
