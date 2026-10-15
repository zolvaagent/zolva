import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { buyAndHold, COST_RATE, maxDrawdown, runHour, simulate, type AgentParams, type AgentState } from "./engine";
import { decide, LOOKBACK_HOURS } from "./strategies";

const momentum: AgentParams = { strategy: "momentum", maxPositionPct: 50, stopLossPct: 8 };
const meanReversion: AgentParams = { strategy: "mean_reversion", maxPositionPct: 50, stopLossPct: 8 };
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

  // Deterministic random walk with some trends and dips.
  function walk(seed: number, length: number): number[] {
    let state = seed;
    const random = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
    const prices = [100];
    for (let i = 1; i < length; i++) prices.push(prices[i - 1] * (1 + (random() - 0.5) * 0.03 + Math.sin(i / 40) * 0.002));
    return prices;
  }

  for (const strategy of ["momentum", "mean_reversion"] as const) {
    it(`matches trades and return for ${strategy}`, () => {
      const series = { AAA: walk(7, 600), BBB: walk(42, 600), CCC: walk(99, 600) };
      const params = strategy === "momentum" ? momentum : meanReversion;
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
