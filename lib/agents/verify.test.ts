import { describe, expect, it } from "vitest";

import { runHour, type AgentParams, type AgentState, type Decision } from "../engine/engine";
import { anchorsFromRecord, priceRevisions, verifyAgent, type VerifyInput } from "./verify";

function walk(seed: number, length: number): number[] {
  let state = seed;
  const random = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const prices = [100];
  for (let i = 1; i < length; i++) prices.push(prices[i - 1] * (1 + (random() - 0.5) * 0.03 + Math.sin(i / 40) * 0.002));
  return prices;
}

const START = 1_790_000_000 - (1_790_000_000 % 3600);
const momentum: AgentParams = { strategy: "momentum", maxPositionPct: 50, stopLossPct: 8 };
const series = { "0xaaa": walk(7, 600), "0xbbb": walk(42, 600) };

/** What the hourly runner would have recorded, over the given hours, with optional vetoes. */
function record(params: AgentParams, hours: number[], vetoAt?: (index: number, decisions: Decision[]) => Map<string, string> | undefined) {
  let state: AgentState = { cash: 1000, positions: {} };
  const runs: VerifyInput["runs"] = [];
  const trades: VerifyInput["trades"] = [];
  for (const index of hours) {
    const ts = START + index * 3600;
    const probe = runHour(state, params, series, index, ts);
    const veto = vetoAt?.(index, probe.decisions);
    const hour = veto ? runHour(state, params, series, index, ts, { veto }) : probe;
    state = hour.state;
    const decisions = veto ? hour.decisions.map((d) => (veto.has(d.token) ? { ...d, ai: { model: "m", verdict: "passed" as const, reasoning: veto.get(d.token)! } } : d)) : hour.decisions;
    runs.push({ ts, equity: hour.equity, decisions });
    trades.push(...hour.fills.map((fill) => ({ ts, token: fill.token, side: fill.side })));
  }
  return { runs, trades };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const input = (recorded: ReturnType<typeof record>, params = momentum): VerifyInput => ({ params, startCapital: 1000, series, funding: {}, startTs: START, ...recorded });

describe("verifyAgent", () => {
  it("matches an honest record exactly, trade for trade", () => {
    const recorded = record(momentum, range(60, 599));
    expect(recorded.trades.length).toBeGreaterThan(5);
    const result = verifyAgent(input(recorded));
    expect(result).toMatchObject({ status: "match", hours: 540, firstDifference: null, trades: { replay: recorded.trades.length, recorded: recorded.trades.length, matched: recorded.trades.length } });
    expect(result.value.gapPct).toBe(0);
  });

  it("replays only the hours the agent ran (a paused week is skipped, not replayed)", () => {
    const hours = [...range(60, 200), ...range(370, 599)];
    expect(verifyAgent(input(record(momentum, hours)))).toMatchObject({ status: "match", hours: hours.length });
  });

  it("names the first hour a trade was changed", () => {
    const recorded = record(momentum, range(60, 599));
    const tampered = { ...recorded, trades: recorded.trades.map((trade, i) => (i === 2 ? { ...trade, side: trade.side === "buy" ? "sell" : "buy" } : trade)) };
    const result = verifyAgent(input(tampered));
    expect(result.status).toBe("differs");
    expect(result.firstDifference).toMatchObject({ at: recorded.trades[2].ts, detail: expect.stringMatching(/^trades differ/) });
  });

  it("names the first hour the value was changed", () => {
    const recorded = record(momentum, range(60, 599));
    const runs = recorded.runs.map((run, i) => (i === 100 ? { ...run, equity: run.equity * 1.01 } : run));
    expect(verifyAgent(input({ ...recorded, runs })).firstDifference).toMatchObject({ at: recorded.runs[100].ts, detail: expect.stringMatching(/^value differs/) });
  });

  it("replays the AI co-pilot's vetoes from the stored decisions", () => {
    // The co-pilot passes on every buy signal in the first 200 hours.
    const recorded = record(momentum, range(60, 400), (index, decisions) => {
      if (index > 200) return undefined;
      const buys = decisions.filter((d) => d.action === "buy");
      return buys.length ? new Map(buys.map((d) => [d.token, "Earnings tomorrow."])) : undefined;
    });
    expect(verifyAgent(input(recorded)).status).toBe("match");
    // Without the stored verdicts the replay would trade those hours.
    const stripped = { ...recorded, runs: recorded.runs.map(({ ts, equity }) => ({ ts, equity })) };
    expect(verifyAgent(input(stripped)).status).toBe("differs");
  });

  it("says so when the agent has not run yet", () => {
    expect(verifyAgent(input({ runs: [], trades: [] })).status).toBe("no_history");
  });
});

describe("priceRevisions", () => {
  it("lists closes that changed after the agent acted, and says when it cannot tell", () => {
    const decisions = [
      { token: "0xaaa", action: "hold", reasoning: "x", price: 100 },
      { token: "0xbbb", action: "hold", reasoning: "x", price: series["0xbbb"][10] },
    ] as Decision[];
    expect(priceRevisions(decisions, { "0xaaa": Array(11).fill(101), "0xbbb": series["0xbbb"] }, 10)).toEqual([{ token: "0xaaa", then: 100, now: 101 }]);
    expect(priceRevisions([{ token: "0xaaa", action: "hold", reasoning: "x" }], series, 10)).toBeNull();
  });
});

describe("hour by hour from the recorded state", () => {
  /** The runner's record with the extra fields anchorsFromRecord needs. */
  function fullRecord(hours: number[]) {
    let state: AgentState = { cash: 1000, positions: {} };
    const runs: { ts: number; equity: number; cash: number }[] = [];
    const trades: { ts: number; token: string; side: string; quantity: number; price: number; costUsd: number }[] = [];
    for (const index of hours) {
      const ts = START + index * 3600;
      const hour = runHour(state, momentum, series, index, ts);
      state = hour.state;
      runs.push({ ts, equity: hour.equity, cash: hour.state.cash });
      trades.push(...hour.fills.map((fill) => ({ ts, token: fill.token, side: fill.side, quantity: fill.quantity, price: fill.price, costUsd: fill.costUsd })));
    }
    return { runs, trades };
  }

  it("rebuilds every hour's starting state and matches an honest record", () => {
    const { runs, trades } = fullRecord(range(60, 599));
    const anchors = anchorsFromRecord(1000, runs, trades);
    expect(verifyAgent({ ...input({ runs, trades }), anchors })).toMatchObject({ status: "match", method: "hour_by_hour", hoursDiffering: 0 });
  });

  it("keeps a price corrected in one hour to that hour: later hours still match", () => {
    const { runs, trades } = fullRecord(range(60, 599));
    // The close of one hour (with no trade around it) changes after the agent acted.
    const quiet = runs.findIndex((run, i) => i > 50 && !trades.some((t) => Math.abs(t.ts - run.ts) <= 3 * 3600)) + 60;
    const corrected = { ...series, "0xaaa": series["0xaaa"].map((close, i) => (i === quiet ? close * 1.001 : close)) };
    const anchors = anchorsFromRecord(1000, runs, trades);
    const result = verifyAgent({ ...input({ runs, trades }), series: corrected, anchors });
    expect(result.method).toBe("hour_by_hour");
    expect(result.hoursDiffering).toBeGreaterThan(0);
    expect(result.hoursDiffering).toBeLessThanOrEqual(3);
    expect(result.lastDifference!.at).toBeLessThan(START + (quiet + 50) * 3600);
    // Every recorded trade still matches.
    expect(result.trades.matched).toBe(trades.length);
  });
});
