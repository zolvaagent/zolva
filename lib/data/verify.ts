import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { agentParams, type AgentRow } from "@/lib/agents/plan";
import { anchorsFromRecord, verifyAgent, type HourWindow, type VerifyResult } from "@/lib/agents/verify";
import { paramsLookback, type Decision } from "@/lib/engine/engine";
import { buildCloseSeries, HOUR_SECONDS, OUTLIER_WINDOW } from "@/lib/engine/series";

import { allRows } from "./paged";

/**
 * Loads one published paper agent and everything its replay needs: every hour it ran, its trades, and the
 * cleaned closes and funding of its markets from before its first hour (the rules' look-back). The engine
 * then replays it (lib/agents/verify.ts). null when the agent is unknown, private or live.
 */
export type VerifyReport = Omit<VerifyResult, "priceCorrections"> & {
  agentId: string;
  firstHour: string | null;
  lastHour: string | null;
  /** As in VerifyResult, with market symbols instead of token addresses. */
  priceCorrections: { hours: number; recent: { at: number; market: string; then: number; now: number }[] };
};

export async function loadAndVerifyAgent(db: SupabaseClient, id: string): Promise<VerifyReport | null> {
  const { data: agent, error } = await db
    .from("agents")
    .select("id, strategy, params, token_addresses, start_capital, cash, last_run_ts, mode, published_at, ai_model")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Loading the agent failed: ${error.message}`);
  if (!agent || agent.mode !== "paper" || agent.published_at === null) return null;

  // Decisions carry the co-pilot's vetoes and, from 2026-11-14, the close the agent saw each hour.
  const runs = await allRows<{ ts: string; equity: number; cash: number; decisions: Decision[] | null }>((from, to) =>
    db.from("agent_runs").select("ts, equity, cash, decisions").eq("agent_id", id).order("ts").range(from, to),
  );
  const trades = await allRows<{ ts: string; token_address: string; side: string; quantity: number; price: number; cost_usd: number }>((from, to) =>
    db.from("trades").select("ts, token_address, side, quantity, price, cost_usd").eq("agent_id", id).order("ts").range(from, to),
  );
  const params = agentParams(agent as unknown as AgentRow);
  const base = { agentId: id, firstHour: runs[0]?.ts ?? null, lastHour: runs[runs.length - 1]?.ts ?? null };
  if (!runs.length) {
    const empty = verifyAgent({ params, startCapital: Number(agent.start_capital), series: {}, funding: {}, startTs: 0, runs: [], trades: [] });
    return { ...base, ...empty, priceCorrections: { hours: 0, recent: [] } };
  }

  // History from before the first hour, so the rules' look-back is full on the first replayed hour.
  const first = Date.parse(runs[0].ts) / 1000;
  const last = Date.parse(runs[runs.length - 1].ts) / 1000;
  const startTs = first - (paramsLookback(params) + 24) * HOUR_SECONDS;
  const { data: raw, error: closesError } = await db.rpc("candle_closes", { p_from: new Date((startTs - OUTLIER_WINDOW * HOUR_SECONDS) * 1000).toISOString() });
  if (closesError) throw new Error(`Loading prices failed: ${closesError.message}`);
  const tokens = new Map((raw as { address: string; candles: [number, number, (number | null)?, (number | null)?][] }[]).map((token) => [token.address, token.candles]));

  const series: Record<string, (number | null)[]> = {};
  const funding: Record<string, (number | null)[]> = {};
  const openInterest: Record<string, (number | null)[]> = {};
  for (const address of agent.token_addresses as string[]) {
    const candles = tokens.get(address) ?? [];
    series[address] = buildCloseSeries(
      candles.map(([time, close]) => ({ time: Number(time), close: Number(close) })),
      startTs,
      last,
    ).closes;
    const rates = new Map(candles.map(([time, , rate]) => [Number(time), rate == null ? null : Number(rate)]));
    funding[address] = series[address].map((_, i) => rates.get(startTs + i * HOUR_SECONDS) ?? null);
    const interest = new Map(candles.map(([time, , , value]) => [Number(time), value == null ? null : Number(value)]));
    openInterest[address] = series[address].map((_, i) => interest.get(startTs + i * HOUR_SECONDS) ?? null);
  }

  // Spot long-only agents are checked hour by hour from the recorded state (see anchorsFromRecord). A preset
  // can short too (spike_fade, bounce_short, dip_fade), so any trade other than a buy or sell rules it out.
  const recordedTrades = trades.map((trade) => ({ ts: Date.parse(trade.ts) / 1000, token: trade.token_address, side: trade.side, quantity: Number(trade.quantity), price: Number(trade.price), costUsd: Number(trade.cost_usd) }));
  const longOnlySpot =
    params.venue !== "perps" && !params.sizing && !params.rules?.shortEntry && recordedTrades.every((trade) => trade.side === "buy" || trade.side === "sell");
  const anchors = longOnlySpot
    ? anchorsFromRecord(Number(agent.start_capital), runs.map((run) => ({ ts: Date.parse(run.ts) / 1000, cash: Number(run.cash) })), recordedTrades)
    : undefined;

  const result = verifyAgent({
    params,
    startCapital: Number(agent.start_capital),
    series,
    funding,
    openInterest,
    startTs,
    runs: runs.map((run) => ({ ts: Date.parse(run.ts) / 1000, equity: Number(run.equity), decisions: run.decisions ?? [] })),
    trades: recordedTrades,
    ...(anchors ? { anchors } : {}),
  });
  // Market symbols instead of token addresses in the plain-words details.
  const { data: symbols } = await db.from("tokens").select("address, symbol").in("address", agent.token_addresses as string[]);
  const tokenSymbols = (symbols ?? []) as { address: string; symbol: string }[];
  const symbolOf = new Map(tokenSymbols.map((token) => [token.address, token.symbol]));
  const named = (detail: string) => tokenSymbols.reduce((text, token) => text.split(token.address).join(token.symbol), detail);
  const rename = (difference: VerifyResult["firstDifference"]) => (difference ? { ...difference, detail: named(difference.detail) } : null);
  const renameWindow = (window: HourWindow | null) => (window ? { ...window, firstDifference: rename(window.firstDifference), lastDifference: rename(window.lastDifference) } : null);
  return {
    ...base,
    ...result,
    firstDifference: rename(result.firstDifference),
    lastDifference: rename(result.lastDifference),
    unverifiable: renameWindow(result.unverifiable),
    priceCorrections: {
      hours: result.priceCorrections.hours,
      recent: result.priceCorrections.recent.map(({ at, token, then, now }) => ({ at, market: symbolOf.get(token) ?? token, then, now })),
    },
  };
}
