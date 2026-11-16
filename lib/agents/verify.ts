/**
 * "Verify this agent": replays a paper agent with the real engine (runHour, the only place decisions
 * are made) on the same closes and funding, hour by hour over exactly the hours it ran, and compares
 * every trade (hour, market, side) and the hourly value with what the database recorded.
 *
 * AI co-pilot vetoes are replayed from the agent's own stored decisions, so an agent with a co-pilot
 * verifies too. Pure: the loader (lib/data/verify.ts) brings the data. Live agents are not replayed:
 * their fills are real transactions, each linked on chain.
 */
import { runHour, type AgentParams, type AgentState, type Decision } from "../engine/engine.ts";

export type VerifyInput = {
  params: AgentParams;
  startCapital: number;
  /** Cleaned hourly closes per token address, index 0 at startTs (the runner's own series). */
  series: Record<string, (number | null)[]>;
  /** Perps funding per token and hour, aligned with series. */
  funding: Record<string, (number | null)[]>;
  /** Perps open interest per token and hour (Lab oiChange gate), aligned with series. */
  openInterest?: Record<string, (number | null)[]>;
  startTs: number;
  /** Every hour the agent ran, oldest first, with what was recorded. Decisions only matter for co-pilot vetoes. */
  runs: { ts: number; equity: number; decisions?: Decision[] }[];
  trades: { ts: number; token: string; side: string }[];
  /**
   * The recorded state at the start of each hour, when it can be rebuilt exactly (spot, long only).
   * With it every hour is checked on its own: a price corrected in one hour does not carry into the next.
   * Without it the replay carries its own state from the first hour.
   */
  anchors?: ReadonlyMap<number, AgentState>;
};

export type VerifyResult = {
  status: "match" | "differs" | "no_history";
  /** hour_by_hour: each hour from the recorded state; cumulative: one replay from the first hour. */
  method: "hour_by_hour" | "cumulative";
  hours: number;
  /** Hours whose trades or value differ from the record. */
  hoursDiffering: number;
  trades: { replay: number; recorded: number; matched: number };
  value: { replay: number; recorded: number; gapPct: number };
  /** The first and last hour where the replay and the record part ways, in plain words. */
  firstDifference: { at: number; detail: string } | null;
  lastDifference: { at: number; detail: string } | null;
};

export type PriceRevision = { token: string; then: number; now: number };

/**
 * Hourly closes that changed after the agent acted: the close each decision stored (from 2026-11-14 on)
 * against today's close for the same hour. A repaired candle explains a replay that differs.
 * null when the hour's decisions stored no prices (older hours), so the cause cannot be shown.
 */
export function priceRevisions(decisions: Decision[], series: Record<string, (number | null)[]>, index: number): PriceRevision[] | null {
  const priced = decisions.filter((decision) => typeof decision.price === "number");
  if (!priced.length) return null;
  return priced
    .map((decision) => ({ token: decision.token, then: decision.price as number, now: series[decision.token]?.[index] ?? NaN }))
    .filter((row) => Number.isFinite(row.now) && Math.abs(row.now / row.then - 1) > 0.0001);
}

/** Value gap allowed per hour: rounding only. Anything bigger is a real difference. */
export const VALUE_TOLERANCE = 0.0005;

export function verifyAgent(input: VerifyInput): VerifyResult {
  const runs = [...input.runs].sort((a, b) => a.ts - b.ts);
  const method = input.anchors ? "hour_by_hour" : "cumulative";
  if (!runs.length) {
    return { status: "no_history", method, hours: 0, hoursDiffering: 0, trades: { replay: 0, recorded: input.trades.length, matched: 0 }, value: { replay: input.startCapital, recorded: input.startCapital, gapPct: 0 }, firstDifference: null, lastDifference: null };
  }

  const recordedByHour = new Map<number, string[]>();
  for (const trade of input.trades) recordedByHour.set(trade.ts, [...(recordedByHour.get(trade.ts) ?? []), `${trade.token}:${trade.side}`]);

  let state: AgentState = { cash: input.startCapital, positions: {} };
  let replayTrades = 0;
  let matched = 0;
  let firstDifference: VerifyResult["firstDifference"] = null;
  let lastDifference: VerifyResult["lastDifference"] = null;
  let hoursDiffering = 0;
  let lastEquity = input.startCapital;

  for (const run of runs) {
    const index = Math.round((run.ts - input.startTs) / 3600);
    if (index < 0) continue;
    const anchored = input.anchors?.get(run.ts);
    if (anchored) state = anchored;
    // The co-pilot's "passed" verdicts, exactly as recorded for this hour.
    const passed = (run.decisions ?? []).filter((decision) => decision.ai?.verdict === "passed");
    const veto = passed.length ? new Map(passed.map((decision) => [decision.token, decision.ai!.reasoning])) : undefined;
    const hour = runHour(state, input.params, input.series, index, run.ts, { funding: input.funding, ...(input.openInterest ? { openInterest: input.openInterest } : {}), ...(veto ? { veto } : {}) });
    state = hour.state;
    lastEquity = hour.equity;

    const replayKeys = hour.fills.map((fill) => `${fill.token}:${fill.side}`).sort();
    const recordedKeys = [...(recordedByHour.get(run.ts) ?? [])].sort();
    replayTrades += replayKeys.length;
    const remaining = [...recordedKeys];
    for (const key of replayKeys) {
      const at = remaining.indexOf(key);
      if (at >= 0) {
        matched += 1;
        remaining.splice(at, 1);
      }
    }
    const sameTrades = replayKeys.length === recordedKeys.length && replayKeys.every((key, i) => key === recordedKeys[i]);
    const gap = run.equity > 0 ? Math.abs(hour.equity / run.equity - 1) : 0;
    const difference = !sameTrades
      ? { at: run.ts, detail: `trades differ: replay ${list(replayKeys)}, recorded ${list(recordedKeys)}` }
      : gap > VALUE_TOLERANCE
        ? { at: run.ts, detail: `value differs: replay $${hour.equity.toFixed(2)}, recorded $${run.equity.toFixed(2)}` }
        : null;
    if (difference) {
      hoursDiffering += 1;
      firstDifference ??= difference;
      lastDifference = difference;
    }
  }

  const recorded = runs[runs.length - 1].equity;
  return {
    status: firstDifference ? "differs" : "match",
    method,
    hours: runs.length,
    hoursDiffering,
    trades: { replay: replayTrades, recorded: input.trades.length, matched },
    value: { replay: lastEquity, recorded, gapPct: recorded > 0 ? (lastEquity / recorded - 1) * 100 : 0 },
    firstDifference,
    lastDifference,
  };
}

type RecordedTrade = { ts: number; token: string; side: string; quantity: number; price: number; costUsd: number };

/**
 * The recorded state at the start of every hour, rebuilt from the record itself: cash from the previous
 * hour's run, positions from the trades before the hour. Exact for spot long-only agents, where a buy
 * opens a whole position (entry includes its cost) and a sell closes it. Other agents (shorts, perps
 * funding, resizes) get no anchors and replay cumulatively.
 */
export function anchorsFromRecord(startCapital: number, runs: { ts: number; cash: number }[], trades: RecordedTrade[]): Map<number, AgentState> {
  const sortedRuns = [...runs].sort((a, b) => a.ts - b.ts);
  const sortedTrades = [...trades].sort((a, b) => a.ts - b.ts);
  const anchors = new Map<number, AgentState>();
  const open = new Map<string, AgentState["positions"][string]>();
  let cash = startCapital;
  let next = 0;
  for (const run of sortedRuns) {
    while (next < sortedTrades.length && sortedTrades[next].ts < run.ts) {
      const trade = sortedTrades[next++];
      if (trade.side === "buy") open.set(trade.token, { quantity: trade.quantity, entryPrice: (trade.quantity * trade.price + trade.costUsd) / trade.quantity, openedAt: trade.ts });
      else if (trade.side === "sell") open.set(trade.token, undefined as never);
    }
    const positions: AgentState["positions"] = {};
    for (const [token, position] of open) if (position) positions[token] = position;
    anchors.set(run.ts, { cash, positions });
    cash = run.cash;
  }
  return anchors;
}

function list(keys: string[]): string {
  return keys.length ? keys.join(", ") : "none";
}
