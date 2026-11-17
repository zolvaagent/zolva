/**
 * "Verify this agent": replays a paper agent with the real engine (runHour, the only place decisions
 * are made) on the same closes and funding, hour by hour over exactly the hours it ran, and compares
 * every trade (hour, market, side) and the hourly value with what the database recorded.
 *
 * AI co-pilot vetoes are replayed from the agent's own stored decisions, so an agent with a co-pilot
 * verifies too. From 2026-11-14 every decision stores the close the agent saw. Each hour is replayed on
 * those stored closes and, when that does not match, on today's closes (a candle repaired before the hour
 * ran was already corrected in its look-back). An hour that matches neither is a difference when every close
 * it reads was stored (verifiable), and unverifiable otherwise: then a close corrected after the agent
 * acted (GeckoTerminal repair) cannot be ruled out, so it is reported apart and does not decide the status. Pure: the loader (lib/data/verify.ts) brings the data. Live agents are not replayed:
 * their fills are real transactions, each linked on chain.
 */
import { paramsLookback, runHour, type AgentParams, type AgentState, type Decision } from "../engine/engine.ts";

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
  /** Every hour the agent ran, oldest first, with what was recorded. Decisions carry co-pilot vetoes and the closes seen. */
  runs: { ts: number; equity: number; decisions?: Decision[] }[];
  trades: { ts: number; token: string; side: string }[];
  /**
   * The recorded state at the start of each hour, when it can be rebuilt exactly (spot, long only).
   * With it every hour is checked on its own: a price corrected in one hour does not carry into the next.
   * Without it the replay carries its own state from the first hour.
   */
  anchors?: ReadonlyMap<number, AgentState>;
};

type Difference = { at: number; detail: string };

/** One stretch of hours and how many of them part ways with the record. */
export type HourWindow = { hours: number; hoursDiffering: number; firstDifference: Difference | null; lastDifference: Difference | null };

export type VerifyResult = {
  /**
   * match: every verifiable hour matches. Unverifiable hours are reported apart (unverifiable) and decide
   * the status only when the agent has no verifiable hour.
   */
  status: "match" | "differs" | "no_history";
  /** hour_by_hour: each hour from the recorded state; cumulative: one replay from the first hour. */
  method: "hour_by_hour" | "cumulative";
  /** All hours replayed. */
  hours: number;
  /**
   * The first verifiable hour: every close its rules read (the hour and its look-back) was stored by the
   * agent's own decisions, which they do from 2026-11-14 on. Such hours are replayed on exactly the closes
   * the agent saw, so a candle corrected later cannot make them differ. null when no hour is verifiable.
   */
  verifiedSince: number | null;
  /** Verifiable hours (all hours when none is) whose trades or value differ from the record. */
  hoursDiffering: number;
  /** The first and last of those hours, in plain words. */
  firstDifference: Difference | null;
  lastDifference: Difference | null;
  /**
   * Hours whose look-back reads a close that was not stored (before 2026-11-14, or an hour the agent did not
   * run), replayed on today's closes. A difference there cannot be told apart from a close corrected after
   * the agent acted, so it is shown here, not counted above. null when there are none or no hour is verifiable.
   */
  unverifiable: HourWindow | null;
  /** Hours whose stored close differs from today's; the replay used the stored one. */
  priceCorrections: { hours: number; recent: (PriceRevision & { at: number })[] };
  trades: { replay: number; recorded: number; matched: number };
  value: { replay: number; recorded: number; gapPct: number };
};

export type PriceRevision = { token: string; then: number; now: number };

/**
 * Hourly closes that changed after the agent acted: the close each decision stored (from 2026-11-14 on)
 * against today's close for the same hour. null when the hour's decisions stored no prices (older hours), so the cause cannot be shown.
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
/** Price corrections listed in the result (the most recent ones). */
const RECENT_CORRECTIONS = 5;

const emptyWindow = (): HourWindow => ({ hours: 0, hoursDiffering: 0, firstDifference: null, lastDifference: null });

export function verifyAgent(input: VerifyInput): VerifyResult {
  const runs = [...input.runs].sort((a, b) => a.ts - b.ts);
  const method = input.anchors ? "hour_by_hour" : "cumulative";
  if (!runs.length) {
    return {
      status: "no_history",
      method,
      hours: 0,
      verifiedSince: null,
      hoursDiffering: 0,
      firstDifference: null,
      lastDifference: null,
      unverifiable: null,
      priceCorrections: { hours: 0, recent: [] },
      trades: { replay: 0, recorded: input.trades.length, matched: 0 },
      value: { replay: input.startCapital, recorded: input.startCapital, gapPct: 0 },
    };
  }

  // The closes the agent saw: today's closes with every close a decision stored put back in its hour.
  // Overlaid for all hours before replaying, so the rules' look-back reads the stored closes too.
  const seen: Record<string, (number | null)[]> = { ...input.series };
  const corrections: (PriceRevision & { at: number })[] = [];
  let correctedHours = 0;
  let overlaid = false;
  const stored = new Set<number>();
  for (const run of runs) {
    const index = Math.round((run.ts - input.startTs) / 3600);
    const revisions = index >= 0 ? priceRevisions(run.decisions ?? [], input.series, index) : null;
    if (revisions === null) continue;
    stored.add(index);
    for (const decision of run.decisions ?? []) {
      const closes = input.series[decision.token];
      if (typeof decision.price !== "number" || !closes) continue;
      if (seen[decision.token] === closes) {
        seen[decision.token] = [...closes];
        overlaid = true;
      }
      seen[decision.token][index] = decision.price;
    }
    if (revisions.length) {
      correctedHours += 1;
      corrections.push(...revisions.map((revision) => ({ ...revision, at: run.ts })));
    }
  }
  // Verifiable: the agent stored the close of this hour and of every hour of its rules' look-back.
  const lookback = paramsLookback(input.params);
  const verifiable = (index: number) => {
    for (let i = index - lookback; i <= index; i++) if (!stored.has(i)) return false;
    return true;
  };
  let verifiedSince: number | null = null;

  const recordedByHour = new Map<number, string[]>();
  for (const trade of input.trades) recordedByHour.set(trade.ts, [...(recordedByHour.get(trade.ts) ?? []), `${trade.token}:${trade.side}`]);

  let state: AgentState = { cash: input.startCapital, positions: {} };
  let replayTrades = 0;
  let matched = 0;
  let lastEquity = input.startCapital;
  const verified = emptyWindow();
  const before = emptyWindow();

  for (const run of runs) {
    const index = Math.round((run.ts - input.startTs) / 3600);
    if (index < 0) continue;
    const anchored = input.anchors?.get(run.ts);
    if (anchored) state = anchored;
    // The co-pilot's "passed" verdicts, exactly as recorded for this hour.
    const passed = (run.decisions ?? []).filter((decision) => decision.ai?.verdict === "passed");
    const veto = passed.length ? new Map(passed.map((decision) => [decision.token, decision.ai!.reasoning])) : undefined;
    const options = { funding: input.funding, ...(input.openInterest ? { openInterest: input.openInterest } : {}), ...(veto ? { veto } : {}) };
    const recordedKeys = [...(recordedByHour.get(run.ts) ?? [])].sort();
    // First on the closes as each decision stored them. A candle repaired before this hour ran was already
    // corrected in the look-back the agent read, so an hour that does not match is replayed once more on
    // today's closes: both are closes the agent really had, and either one matching is a match.
    let hour = runHour(state, input.params, seen, index, run.ts, options);
    let difference = compare(run, hour, recordedKeys);
    if (difference && overlaid) {
      const corrected = runHour(state, input.params, input.series, index, run.ts, options);
      if (!compare(run, corrected, recordedKeys)) {
        hour = corrected;
        difference = null;
      }
    }
    state = hour.state;
    lastEquity = hour.equity;

    const replayKeys = hour.fills.map((fill) => `${fill.token}:${fill.side}`).sort();
    replayTrades += replayKeys.length;
    const remaining = [...recordedKeys];
    for (const key of replayKeys) {
      const at = remaining.indexOf(key);
      if (at >= 0) {
        matched += 1;
        remaining.splice(at, 1);
      }
    }
    const isVerifiable = verifiable(index);
    if (isVerifiable) verifiedSince ??= run.ts;
    const window = isVerifiable ? verified : before;
    window.hours += 1;
    if (difference) {
      window.hoursDiffering += 1;
      window.firstDifference ??= difference;
      window.lastDifference = difference;
    }
  }

  // With no verifiable hour, the other hours are all there is, so they decide the status.
  const deciding = verifiedSince === null ? before : verified;
  const recorded = runs[runs.length - 1].equity;
  return {
    status: deciding.hoursDiffering ? "differs" : "match",
    method,
    hours: verified.hours + before.hours,
    verifiedSince,
    hoursDiffering: deciding.hoursDiffering,
    firstDifference: deciding.firstDifference,
    lastDifference: deciding.lastDifference,
    unverifiable: verifiedSince !== null && before.hours ? before : null,
    priceCorrections: { hours: correctedHours, recent: corrections.slice(-RECENT_CORRECTIONS) },
    trades: { replay: replayTrades, recorded: input.trades.length, matched },
    value: { replay: lastEquity, recorded, gapPct: recorded > 0 ? (lastEquity / recorded - 1) * 100 : 0 },
  };
}

/** How one replayed hour parts ways with the record (its trades, else its value), or null when it matches. */
function compare(run: { ts: number; equity: number }, hour: { fills: { token: string; side: string }[]; equity: number }, recordedKeys: string[]): Difference | null {
  const replayKeys = hour.fills.map((fill) => `${fill.token}:${fill.side}`).sort();
  const sameTrades = replayKeys.length === recordedKeys.length && replayKeys.every((key, i) => key === recordedKeys[i]);
  if (!sameTrades) return { at: run.ts, detail: `trades differ: replay ${list(replayKeys)}, recorded ${list(recordedKeys)}` };
  const gap = run.equity > 0 ? Math.abs(hour.equity / run.equity - 1) : 0;
  return gap > VALUE_TOLERANCE ? { at: run.ts, detail: `value differs: replay $${hour.equity.toFixed(2)}, recorded $${run.equity.toFixed(2)}` } : null;
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
