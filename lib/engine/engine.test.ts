import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { buyAndHold, COST_RATE, maxDrawdown, runHour, SHORT_BORROW_APR, simulate, type AgentParams, type AgentState } from "./engine";
import { decide, LOOKBACK_HOURS } from "./strategies";

const momentum: AgentParams = { strategy: "momentum", maxPositionPct: 50, stopLossPct: 8 };
const meanReversion: AgentParams = { strategy: "mean_reversion", maxPositionPct: 50, stopLossPct: 8 };
const dipHunter: AgentParams = { strategy: "dip_hunter", maxPositionPct: 100, stopLossPct: 10 };
const spikeFade: AgentParams = { strategy: "spike_fade", maxPositionPct: 100, stopLossPct: 10 };

// Deterministic random walk with some trends and dips.
function walk(seed: number, length: number): number[] {
  let state = seed;
  const random = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const prices = [100];
  for (let i = 1; i < length; i++) prices.push(prices[i - 1] * (1 + (random() - 0.5) * 0.03 + Math.sin(i / 40) * 0.002));
  return prices;
}
const flat = (length: number, price = 100) => Array<number>(length).fill(price);

describe("strategies", () => {
  it("momentum buys a strong uptrend and waits otherwise", () => {
    const rising = [...flat(40), ...Array.from({ length: 9 }, (_, i) => 100 + (i + 1) * 0.8)]; // ends +7.2% vs 24h ago
    expect(decide("momentum", rising, false).action).toBe("buy");
    expect(decide("momentum", flat(49), false).action).toBe("hold");
  });

  it("momentum sells once the price is 3% below the 48h average", () => {
    expect(decide("momentum", [...flat(48), 96.5], true).action).toBe("sell");
    expect(decide("momentum", [...flat(48), 97.5], true).action).toBe("hold");
  });

  it("mean reversion buys an unusual dip and sells the rebound", () => {
    const noisy = Array.from({ length: 48 }, (_, i) => 100 + (i % 2 ? 1 : -1));
    expect(decide("mean_reversion", [...noisy, 95], false).action).toBe("buy");
    expect(decide("mean_reversion", [...noisy, 101], true).action).toBe("sell");
    expect(decide("mean_reversion", [...noisy, 99.5], true).action).toBe("hold");
  });

  it("explains every decision", () => {
    const signal = decide("mean_reversion", flat(49), false);
    expect(signal.reasoning).toMatch(/normal range/);
    expect(signal.indicators).toHaveProperty("zScore");
  });
});

describe("runHour", () => {
  const rising = [...flat(40), ...Array.from({ length: 9 }, (_, i) => 100 + (i + 1) * 0.8)];

  it("holds until there are 48 hours of history", () => {
    const hour = runHour({ cash: 1000, positions: {} }, momentum, { NVDA: flat(10) }, 9);
    expect(hour.decisions[0]).toMatchObject({ action: "hold", reasoning: expect.stringMatching(/history/) });
    expect(hour.fills).toEqual([]);
  });

  it("buys min(cash, equity x max %) and pays the cost", () => {
    const hour = runHour({ cash: 1000, positions: {} }, momentum, { NVDA: rising }, LOOKBACK_HOURS);
    const [fill] = hour.fills;
    expect(fill.side).toBe("buy");
    expect(fill.costUsd).toBeCloseTo(500 * COST_RATE);
    expect(hour.state.cash).toBeCloseTo(500);
    // Entry price includes the cost, so it sits above the market price.
    expect(hour.state.positions.NVDA.entryPrice).toBeGreaterThan(rising[LOOKBACK_HOURS]);
    // Equity right after a buy is down by exactly the cost.
    expect(hour.equity).toBeCloseTo(1000 - 500 * COST_RATE);
  });

  it("sells everything when the stop loss is hit", () => {
    const state: AgentState = { cash: 0, positions: { NVDA: { quantity: 10, entryPrice: 100 } } };
    const hour = runHour(state, momentum, { NVDA: [...flat(48), 91] }, LOOKBACK_HOURS);
    expect(hour.fills[0]).toMatchObject({ side: "sell", reason: "stop_loss", quantity: 10 });
    expect(hour.state.positions).toEqual({});
    expect(hour.state.cash).toBeCloseTo(10 * 91 * (1 - COST_RATE));
    expect(hour.decisions[0].reasoning).toMatch(/Stop loss hit: -9\.0%/);
  });

  it("holds a buy signal when there is no cash", () => {
    const state: AgentState = { cash: 0, positions: { AAPL: { quantity: 10, entryPrice: 100 } } };
    const hour = runHour(state, momentum, { AAPL: flat(49), NVDA: rising }, LOOKBACK_HOURS);
    expect(hour.decisions.find((decision) => decision.token === "NVDA")?.reasoning).toMatch(/no cash/);
  });

  it("never mutates the state it was given", () => {
    const state: AgentState = { cash: 1000, positions: {} };
    runHour(state, momentum, { NVDA: rising }, LOOKBACK_HOURS);
    expect(state).toEqual({ cash: 1000, positions: {} });
  });
});

describe("simulate", () => {
  it("keeps cash on a flat market and reports zero drawdown", () => {
    const result = simulate({ series: { NVDA: flat(100) }, params: momentum, capital: 1000, fromIndex: LOOKBACK_HOURS });
    expect(result.finalEquity).toBe(1000);
    expect(result.maxDrawdownPct).toBe(0);
    expect(result.winRatePct).toBeNull();
  });

  it("buys and holds the same token through an uptrend", () => {
    const series = { NVDA: [...flat(40), ...Array.from({ length: 60 }, (_, i) => 100 * 1.004 ** (i + 1))] };
    const result = simulate({ series, params: momentum, capital: 1000, fromIndex: LOOKBACK_HOURS });
    expect(result.fills[0].side).toBe("buy");
    expect(result.returnPct).toBeGreaterThan(0);
  });
});

describe("buyAndHold and maxDrawdown", () => {
  it("compounds from the start price and pays the cost once", () => {
    const { returnPct } = buyAndHold({ A: [100, 110] }, 1000, 0);
    expect(returnPct).toBeCloseTo((1.1 * (1 - COST_RATE) - 1) * 100);
  });

  it("measures the deepest fall from a peak", () => {
    expect(maxDrawdown([100, 120, 90, 130, 117])).toBeCloseTo(0.25);
  });
});

/**
 * The prototype (prototype/engine.js) is what the user approved in the
 * design review. The TypeScript engine must trade exactly like it.
 */
describe("parity with the prototype engine", () => {
  const prototype = createRequire(import.meta.url)("../../prototype/engine.js") as {
    simulate: (options: object) => { returnPct: number; trades: { index: number; side: string; symbol: string }[] };
  };

  for (const strategy of ["momentum", "mean_reversion", "dip_hunter", "spike_fade"] as const) {
    it(`matches trades and return for ${strategy}`, () => {
      const series: Record<string, number[]> =
        strategy === "dip_hunter" || strategy === "spike_fade"
          ? { AAA: walk(7, 600), BBB: walk(42, 600), CCC: walk(99, 600), DDD: walk(5, 600), EEE: walk(1234, 600) }
          : { AAA: walk(7, 600), BBB: walk(42, 600), CCC: walk(99, 600) };
      const params = { momentum, mean_reversion: meanReversion, dip_hunter: dipHunter, spike_fade: spikeFade }[strategy];
      const ours = simulate({ series, params, capital: 10_000, fromIndex: 60 });
      const theirs = prototype.simulate({
        tokens: Object.entries(series).map(([symbol, closes]) => ({ symbol, closes })),
        strategy,
        capital: 10_000,
        maxPositionPct: params.maxPositionPct,
        stopLossPct: params.stopLossPct,
        fromIndex: 60,
      });
      expect(ours.fills.length).toBeGreaterThan(0);
      expect(ours.fills.map((fill) => `${fill.index}:${fill.side}:${fill.token}`)).toEqual(
        theirs.trades.map((trade) => `${trade.index}:${trade.side}:${trade.symbol}`),
      );
      expect(ours.returnPct).toBeCloseTo(theirs.returnPct, 9);
    });
  }
});

describe("dip hunter", () => {
  // 49 calm hours around 100, then the given drop in the last hour.
  const calmThenDrop = (drop: number) => [...Array.from({ length: 49 }, (_, i) => 100 + (i % 2 ? 0.5 : -0.5)), 100 * (1 - drop)];

  it("buys only the deepest dip when several markets dip in the same hour", () => {
    const series = { AAA: calmThenDrop(0.03), BBB: calmThenDrop(0.06), CCC: calmThenDrop(0) };
    const hour = runHour({ cash: 1000, positions: {} }, dipHunter, series, 49);
    expect(hour.fills.map((fill) => `${fill.side}:${fill.token}`)).toEqual(["buy:BBB"]);
    expect(hour.decisions.find((decision) => decision.token === "AAA")?.reasoning).toContain("Another market dipped deeper");
  });

  it("does not buy a second market while it holds one", () => {
    const series = { AAA: calmThenDrop(0.06), BBB: calmThenDrop(0) };
    const held = { cash: 0, positions: { BBB: { quantity: 10, entryPrice: 100 } } };
    const hour = runHour(held, dipHunter, series, 49);
    expect(hour.fills).toEqual([]);
    expect(hour.decisions.find((decision) => decision.token === "AAA")?.reasoning).toContain("one position at a time");
  });

  it("never holds two positions over a long run", () => {
    const series = { AAA: walk(7, 600), BBB: walk(42, 600), CCC: walk(99, 600), DDD: walk(5, 600) };
    const run = simulate({ series, params: dipHunter, capital: 10_000, fromIndex: 60 });
    expect(run.fills.length).toBeGreaterThan(2);
    expect(run.runs.every((hour) => hour.decisions.filter((decision) => decision.action === "buy").length <= 1)).toBe(true);
    let open = 0;
    for (const fill of run.fills) {
      open += fill.side === "buy" ? 1 : -1;
      expect(open).toBeLessThanOrEqual(1);
    }
  });
});

describe("spike fade (shorts)", () => {
  // 49 calm hours around 100, then the given jump in the last hour.
  const calmThenJump = (jump: number) => [...Array.from({ length: 49 }, (_, i) => 100 + (i % 2 ? 0.5 : -0.5)), 100 * (1 + jump)];

  it("shorts only the strongest spike, at the close, paying the cost", () => {
    const series = { AAA: calmThenJump(0.03), BBB: calmThenJump(0.06), CCC: calmThenJump(0) };
    const hour = runHour({ cash: 1000, positions: {} }, spikeFade, series, 49);
    expect(hour.fills.map((fill) => `${fill.side}:${fill.token}`)).toEqual(["short:BBB"]);
    const short = hour.state.positions.BBB;
    expect(short.side).toBe("short");
    expect(short.entryPrice).toBe(106);
    expect(short.quantity).toBeCloseTo((1000 * (1 - COST_RATE)) / 106);
    expect(hour.equity).toBeCloseTo(1000 * (1 - COST_RATE));
    expect(hour.decisions.find((decision) => decision.token === "AAA")?.reasoning).toContain("Another market spiked higher");
  });

  it("gains when the price falls and covers on the way back down", () => {
    const short: AgentState = { cash: 0, positions: { AAA: { quantity: 10, entryPrice: 100, side: "short" } } };
    // Calm, then a fall well below the average: z under -0.5 covers.
    const series = { AAA: [...Array.from({ length: 49 }, (_, i) => 100 + (i % 2 ? 0.5 : -0.5)), 90] };
    const hour = runHour(short, spikeFade, series, 49);
    const borrow = (10 * 90 * SHORT_BORROW_APR) / (365 * 24);
    expect(hour.fills.map((fill) => `${fill.side}:${fill.reason}`)).toEqual(["cover:signal"]);
    // Locked 1000, gained 10 x 10 = 100, paid 0.5% of 900 and an hour of borrow.
    expect(hour.state.cash).toBeCloseTo(1100 - 900 * COST_RATE - borrow);
    expect(hour.state.positions).toEqual({});
  });

  it("stops out when the price rises past the stop", () => {
    const short: AgentState = { cash: 0, positions: { AAA: { quantity: 10, entryPrice: 100, side: "short" } } };
    const series = { AAA: [...Array.from({ length: 49 }, () => 100), 111] };
    const hour = runHour(short, spikeFade, series, 49);
    expect(hour.fills.map((fill) => `${fill.side}:${fill.reason}`)).toEqual(["cover:stop_loss"]);
    expect(hour.decisions[0].reasoning).toContain("Stop loss hit: +11.0% above the short entry");
    expect(hour.state.cash).toBeLessThan(900);
  });

  it("values an open short as locked cash plus gain, and charges borrow each hour", () => {
    const short: AgentState = { cash: 0, positions: { AAA: { quantity: 10, entryPrice: 100, side: "short" } } };
    const series = { AAA: [...Array.from({ length: 49 }, (_, i) => 100 + (i % 2 ? 0.5 : -0.5)), 100.3] };
    const hour = runHour(short, spikeFade, series, 49);
    expect(hour.fills).toEqual([]);
    expect(hour.equity).toBeCloseTo(10 * (200 - 100.3) - (10 * 100.3 * SHORT_BORROW_APR) / (365 * 24));
  });

  it("never holds two positions over a long run, and only shorts", () => {
    const series = { AAA: walk(7, 600), BBB: walk(42, 600), CCC: walk(99, 600), DDD: walk(5, 600) };
    const run = simulate({ series, params: spikeFade, capital: 10_000, fromIndex: 60 });
    expect(run.fills.length).toBeGreaterThan(2);
    expect(run.fills.every((fill) => fill.side === "short" || fill.side === "cover")).toBe(true);
    let open = 0;
    for (const fill of run.fills) {
      open += fill.side === "short" ? 1 : -1;
      expect(open).toBeLessThanOrEqual(1);
    }
  });
});
