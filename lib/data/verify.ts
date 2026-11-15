import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { agentParams, type AgentRow } from "@/lib/agents/plan";
import { anchorsFromRecord, priceRevisions, verifyAgent, type VerifyResult } from "@/lib/agents/verify";
import { paramsLookback, type Decision } from "@/lib/engine/engine";
import { buildCloseSeries, HOUR_SECONDS, OUTLIER_WINDOW } from "@/lib/engine/series";

/**
 * Loads one published paper agent and everything its replay needs: every hour it ran, its trades, and the
 * cleaned closes and funding of its markets from before its first hour (the rules' look-back). The engine
 * then replays it (lib/agents/verify.ts). null when the agent is unknown, private or live.
 */
export type VerifyReport = VerifyResult & {
  agentId: string;
  firstHour: string | null;
  lastHour: string | null;
  /** Why the first difference happened, when the stored decisions can tell: closes corrected after the agent acted. */
  cause: { kind: "price_revised"; revisions: { market: string; then: number; now: number }[] } | { kind: "unknown"; note: string } | null;
};

export async function loadAndVerifyAgent(db: SupabaseClient, id: string): Promise<VerifyReport | null> {
  const { data: agent, error } = await db
    .from("agents")
    .select("id, strategy, params, token_addresses, start_capital, cash, last_run_ts, mode, published_at, ai_model")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Loading the agent failed: ${error.message}`);
  if (!agent || agent.mode !== "paper" || agent.published_at === null) return null;

  const withDecisions = agent.ai_model !== null;
  const runs = await all<{ ts: string; equity: number; cash: number; decisions?: Decision[] }>((from, to) =>
    db.from("agent_runs").select(withDecisions ? "ts, equity, cash, decisions" : "ts, equity, cash").eq("agent_id", id).order("ts").range(from, to),
  );
  const trades = await all<{ ts: string; token_address: string; side: string; quantity: number; price: number; cost_usd: number }>((from, to) =>
    db.from("trades").select("ts, token_address, side, quantity, price, cost_usd").eq("agent_id", id).order("ts").range(from, to),
  );
  const params = agentParams(agent as unknown as AgentRow);
  const base = { agentId: id, firstHour: runs[0]?.ts ?? null, lastHour: runs[runs.length - 1]?.ts ?? null };
  if (!runs.length) return { ...base, ...verifyAgent({ params, startCapital: Number(agent.start_capital), series: {}, funding: {}, startTs: 0, runs: [], trades: [] }), cause: null };

  // History from before the first hour, so the rules' look-back is full on the first replayed hour.
  const first = Date.parse(runs[0].ts) / 1000;
  const last = Date.parse(runs[runs.length - 1].ts) / 1000;
  const startTs = first - (paramsLookback(params) + 24) * HOUR_SECONDS;
  const { data: raw, error: closesError } = await db.rpc("candle_closes", { p_from: new Date((startTs - OUTLIER_WINDOW * HOUR_SECONDS) * 1000).toISOString() });
  if (closesError) throw new Error(`Loading prices failed: ${closesError.message}`);
  const tokens = new Map((raw as { address: string; candles: [number, number, number | null][] }[]).map((token) => [token.address, token.candles]));

  const series: Record<string, (number | null)[]> = {};
  const funding: Record<string, (number | null)[]> = {};
  for (const address of agent.token_addresses as string[]) {
    const candles = tokens.get(address) ?? [];
    series[address] = buildCloseSeries(
      candles.map(([time, close]) => ({ time: Number(time), close: Number(close) })),
      startTs,
      last,
    ).closes;
    const rates = new Map(candles.map(([time, , rate]) => [Number(time), rate == null ? null : Number(rate)]));
    funding[address] = series[address].map((_, i) => rates.get(startTs + i * HOUR_SECONDS) ?? null);
  }

  // Spot long-only agents are checked hour by hour from the recorded state (see anchorsFromRecord).
  const longOnlySpot = params.venue !== "perps" && !params.sizing && !params.rules?.shortEntry;
  const recordedTrades = trades.map((trade) => ({ ts: Date.parse(trade.ts) / 1000, token: trade.token_address, side: trade.side, quantity: Number(trade.quantity), price: Number(trade.price), costUsd: Number(trade.cost_usd) }));
  const anchors = longOnlySpot
    ? anchorsFromRecord(Number(agent.start_capital), runs.map((run) => ({ ts: Date.parse(run.ts) / 1000, cash: Number(run.cash) })), recordedTrades)
    : undefined;

  const result = verifyAgent({
    params,
    startCapital: Number(agent.start_capital),
    series,
    funding,
    startTs,
    runs: runs.map((run) => ({ ts: Date.parse(run.ts) / 1000, equity: Number(run.equity), ...(run.decisions ? { decisions: run.decisions } : {}) })),
    trades: recordedTrades,
    ...(anchors ? { anchors } : {}),
  });
  // Market symbols instead of token addresses in the plain-words details.
  const { data: symbols } = await db.from("tokens").select("address, symbol").in("address", agent.token_addresses as string[]);
  const named = (detail: string) => ((symbols ?? []) as { address: string; symbol: string }[]).reduce((text, token) => text.split(token.address).join(token.symbol), detail);
  const rename = (difference: VerifyResult["firstDifference"]) => (difference ? { ...difference, detail: named(difference.detail) } : null);
  return {
    ...base,
    ...result,
    firstDifference: rename(result.firstDifference),
    lastDifference: rename(result.lastDifference),
    cause: result.firstDifference ? await causeOf(db, id, result.firstDifference.at, series, Math.round((result.firstDifference.at - startTs) / HOUR_SECONDS)) : null,
  };
}

/** Looks at the decisions of the first differing hour: did its closes change after the agent acted? */
async function causeOf(db: SupabaseClient, agentId: string, at: number, series: Record<string, (number | null)[]>, index: number): Promise<VerifyReport["cause"]> {
  const { data } = await db.from("agent_runs").select("decisions").eq("agent_id", agentId).eq("ts", new Date(at * 1000).toISOString()).maybeSingle();
  const revisions = priceRevisions(((data?.decisions ?? []) as Decision[]), series, index);
  if (revisions === null) {
    return { kind: "unknown", note: "This hour's decisions predate stored prices (2026-11-14), so a later price correction cannot be shown or ruled out." };
  }
  if (!revisions.length) return { kind: "unknown", note: "The closes the agent saw match today's closes for this hour." };
  const { data: tokens } = await db.from("tokens").select("address, symbol").in("address", revisions.map((r) => r.token));
  const symbolOf = new Map(((tokens ?? []) as { address: string; symbol: string }[]).map((t) => [t.address, t.symbol]));
  return { kind: "price_revised", revisions: revisions.map((r) => ({ market: symbolOf.get(r.token) ?? r.token, then: r.then, now: r.now })) };
}

/** Supabase returns at most 1,000 rows per call: page through. */
async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
