import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { buyAndHold, COST_RATE, costRateFor, equityAt, maxDrawdown, paramsLookback, PERPS_COST_RATE, realisedVolatility, runHour, SHORT_BORROW_APR, simulate, type AgentParams, type AgentState } from "./engine";
import type { Rules } from "./rules";
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

  it("matches trades and return for a perps agent with funding", () => {
    const series: Record<string, number[]> = { AAA: walk(7, 600), BBB: walk(42, 600), CCC: walk(99, 600) };
    // Funding that changes sign over time, about 0.001% to 0.003% an hour.
    const funding = Object.fromEntries(Object.keys(series).map((token, t) => [token, series[token].map((_, i) => Math.sin(i / 17 + t) * 0.00003)]));
    const params: AgentParams = { strategy: "custom", rules: deepDip, maxPositionPct: 33, stopLossPct: 5, venue: "perps" };
    const ours = simulate({ series, params, capital: 10_000, fromIndex: 120, funding });
    const theirs = prototype.simulate({
      tokens: Object.entries(series).map(([symbol, closes]) => ({ symbol, closes, funding: funding[symbol] })),
      strategy: "custom",
      rules: deepDip,
      venue: "perps",
      capital: 10_000,
      maxPositionPct: 33,
      stopLossPct: 5,
      fromIndex: 120,
    });
    expect(ours.fills.length).toBeGreaterThan(0);
    expect(ours.fills.map((fill) => `${fill.index}:${fill.side}:${fill.token}`)).toEqual(
      theirs.trades.map((trade) => `${trade.index}:${trade.side}:${trade.symbol}`),
    );
    expect(ours.returnPct).toBeCloseTo(theirs.returnPct, 9);
  });
});

/** The deep dip rule that passed the perps search (docs/perps-research.md). */
const deepDip: Rules = {
  entry: { join: "all", conditions: [{ left: { kind: "zscore", hours: 96 }, op: "below", right: { kind: "value", value: -2.5 } }] },
  exit: { join: "any", conditions: [{ left: { kind: "zscore", hours: 96 }, op: "above", right: { kind: "value", value: 0.5 } }] },
  takeProfitPct: null,
  maxHoldHours: null,
};

describe("perps", () => {
  const perps: AgentParams = { strategy: "mean_reversion", maxPositionPct: 50, stopLossPct: 8, venue: "perps" };
  const noisyThenDip = [...Array.from({ length: 48 }, (_, i) => 100 + (i % 2 ? 1 : -1)), 95];

  it("pays PERPS_COST_RATE instead of COST_RATE", () => {
    const hour = runHour({ cash: 1000, positions: {} }, perps, { AAA: noisyThenDip }, 48);
    expect(hour.fills[0].costUsd).toBeCloseTo(500 * PERPS_COST_RATE, 9);
    expect(costRateFor("perps")).toBe(PERPS_COST_RATE);
    expect(costRateFor(undefined)).toBe(COST_RATE);
  });

  it("takes funding from a long's quantity and pays it to a short's entry, never from cash", () => {
    const state: AgentState = { cash: 0, positions: { AAA: { quantity: 10, entryPrice: 100 }, BBB: { quantity: 10, entryPrice: 100, side: "short" } } };
    const series = { AAA: flat(49), BBB: flat(49) };
    const hour = runHour(state, { ...perps, strategy: "momentum" }, series, 48, 48 * 3600, { funding: { AAA: [...flat(48, 0), 0.001], BBB: [...flat(48, 0), 0.001] } });
    expect(hour.state.cash).toBe(0);
    expect(hour.state.positions.AAA.quantity).toBeCloseTo(9.99, 9); // the long paid 10 x 100 x 0.1% = $1
    expect(hour.equity).toBeCloseTo(2000, 9); // the short received the same $1
  });

  it("charges no borrow on perps shorts and no funding on DEX agents", () => {
    const short: AgentState = { cash: 0, positions: { AAA: { quantity: 10, entryPrice: 100, side: "short" } } };
    const perpsHour = runHour(short, { ...perps, strategy: "spike_fade" }, { AAA: flat(49) }, 48);
    expect(perpsHour.equity).toBeCloseTo(1000, 9);
    const dexHour = runHour({ cash: 0, positions: { AAA: { quantity: 10, entryPrice: 100 } } }, { ...perps, venue: "dex" }, { AAA: flat(49) }, 48, 48 * 3600, {
      funding: { AAA: flat(49, 0.01) },
    });
    expect(dexHour.state.positions.AAA.quantity).toBe(10);
  });
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

  it("pays borrow from the short itself, so an all-in short never takes cash below zero", () => {
    // Regression (2026-11-07): Lab · Crypto Spike Fade shorted with all its cash, the hourly
    // borrow made cash negative, and the database refused every hour after that.
    let state: AgentState = { cash: 0, positions: { AAA: { quantity: 10, entryPrice: 100, side: "short" } } };
    // A flat price: z stays 0, so the short neither covers nor stops and pays borrow every hour.
    const series = { AAA: Array.from({ length: 200 }, () => 100) };
    for (let index = 48; index < 200; index++) {
      const hour = runHour(state, spikeFade, series, index);
      expect(hour.state.cash).toBeGreaterThanOrEqual(0);
      state = hour.state;
    }
    // 152 hours of borrow at about $100 of tokens, 10% a year, came out of the short's value.
    expect(state.cash).toBe(0);
    expect(state.positions.AAA.entryPrice).toBeLessThan(100);
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

describe("dip + fade", () => {
  const dipFade: AgentParams = { strategy: "dip_fade", maxPositionPct: 50, stopLossPct: 10, venue: "perps" };
  // A flat, noisy week around 100 (so the trend filter allows both sides), then the given move.
  // Moves stay under 4%: the week starts at 101, so a bigger drop would count as a 7 day fall of over 5%.
  const calmThen = (move: number, base = 100) => [...Array.from({ length: 169 }, (_, i) => base + (i % 2 ? 1 : -1)), base * (1 + move)];

  it("opens one long and one short in the same hour", () => {
    const series = { AAA: calmThen(-0.04), BBB: calmThen(0.04), CCC: calmThen(-0.03), DDD: calmThen(0) };
    const hour = runHour({ cash: 1000, positions: {} }, dipFade, series, 169);
    expect(hour.fills.map((fill) => `${fill.side}:${fill.token}`).sort()).toEqual(["buy:AAA", "short:BBB"]);
    expect(hour.decisions.find((decision) => decision.token === "CCC")?.reasoning).toContain("Another market dipped deeper");
    expect(hour.state.positions.BBB.side).toBe("short");
    expect(hour.state.cash).toBeCloseTo(0, 6); // 50% each side
  });

  it("keeps one long at a time but still shorts while long", () => {
    const series = { AAA: calmThen(-0.04), BBB: calmThen(0.04), CCC: calmThen(0) };
    const held: AgentState = { cash: 500, positions: { CCC: { quantity: 5, entryPrice: 100 } } };
    const hour = runHour(held, dipFade, series, 169);
    expect(hour.fills.map((fill) => `${fill.side}:${fill.token}`)).toEqual(["short:BBB"]);
    expect(hour.decisions.find((decision) => decision.token === "AAA")?.reasoning).toContain("one long at a time");
  });

  it("will not short a market up more than 5% over 7 days, nor buy one down more than 5%", () => {
    // A steady 10% rise over the week, then a spike; a steady 10% fall, then a dip.
    const rising = [...Array.from({ length: 169 }, (_, i) => 100 * (1 + (0.1 * i) / 168) + (i % 2 ? 0.2 : -0.2)), 116];
    const falling = [...Array.from({ length: 169 }, (_, i) => 100 * (1 - (0.1 * i) / 168) + (i % 2 ? 0.2 : -0.2)), 84];
    expect(decide("dip_fade", rising, false).action).toBe("hold");
    expect(decide("dip_fade", rising, false).reasoning).toContain("no short against the trend");
    expect(decide("dip_fade", falling, false).action).toBe("hold");
    expect(decide("dip_fade", falling, false).reasoning).toContain("no long against the trend");
  });

  it("closes a short when the price falls back and a long when it recovers", () => {
    const noisy = Array.from({ length: 169 }, (_, i) => 100 + (i % 2 ? 1 : -1));
    expect(decide("dip_fade", [...noisy, 98], true, "short").action).toBe("cover");
    expect(decide("dip_fade", [...noisy, 101], true, "long").action).toBe("sell");
  });

  it("matches the prototype engine on perps with funding", () => {
    const prototype = createRequire(import.meta.url)("../../prototype/engine.js") as {
      simulate: (options: object) => { returnPct: number; trades: { index: number; side: string; symbol: string }[] };
    };
    const series: Record<string, number[]> = { AAA: walk(7, 900), BBB: walk(42, 900), CCC: walk(99, 900), DDD: walk(5, 900), EEE: walk(1234, 900) };
    const funding = Object.fromEntries(Object.keys(series).map((token, t) => [token, series[token].map((_, i) => Math.sin(i / 17 + t) * 0.00003)]));
    const ours = simulate({ series, params: dipFade, capital: 10_000, fromIndex: 200, funding });
    const theirs = prototype.simulate({
      tokens: Object.entries(series).map(([symbol, closes]) => ({ symbol, closes, funding: funding[symbol] })),
      strategy: "dip_fade",
      venue: "perps",
      capital: 10_000,
      maxPositionPct: 50,
      stopLossPct: 10,
      fromIndex: 200,
    });
    expect(ours.fills.some((fill) => fill.side === "short")).toBe(true);
    expect(ours.fills.some((fill) => fill.side === "buy")).toBe(true);
    expect(ours.fills.map((fill) => `${fill.index}:${fill.side}:${fill.token}`)).toEqual(theirs.trades.map((trade) => `${trade.index}:${trade.side}:${trade.symbol}`));
    expect(ours.returnPct).toBeCloseTo(theirs.returnPct, 9);
  });
});

describe("bounce short", () => {
  const bounceShort: AgentParams = { strategy: "bounce_short", maxPositionPct: 100, stopLossPct: 10, venue: "perps" };
  // A noisy fall of `fallPct` (0.10 = 10%) over 7 days, then a last close `bounce` above the low.
  // Hand-checked z scores and 24h moves: (0.10, 2.0) z 0.96, 7d -7.6%, 24h +1.1%; (0.07, 1.2) z 0.70, 7d -5.4%;
  // (0.10, 2.4) is the same bounce but +1.6% in 24h; (0.10, 0.5) z -0.80; (0.02, 0.6) only -1.0% over 7 days.
  const fallThenBounce = (fallPct: number, bounce: number) => {
    const fall = Array.from({ length: 168 }, (_, i) => 100 * (1 - (fallPct * i) / 167) + (i % 2 ? 0.2 : -0.2));
    return [...fall, fall[167] + bounce];
  };

  it("shorts the market with the deepest 7 day fall, with all of the agent", () => {
    const series = { AAA: fallThenBounce(0.1, 2.0), BBB: fallThenBounce(0.07, 1.2), CCC: fallThenBounce(0.02, 0.6) };
    const hour = runHour({ cash: 1000, positions: {} }, bounceShort, series, 168);
    expect(hour.fills.map((fill) => `${fill.side}:${fill.token}`)).toEqual(["short:AAA"]);
    expect(hour.state.positions.AAA.side).toBe("short");
    expect(hour.state.positions.AAA.quantity).toBeCloseTo((1000 * (1 - PERPS_COST_RATE)) / series.AAA[168]);
    expect(hour.state.cash).toBeCloseTo(0, 6);
    expect(hour.decisions.find((decision) => decision.token === "BBB")?.reasoning).toContain("Another market fell further");
    expect(hour.decisions.find((decision) => decision.token === "AAA")?.reasoning).toContain("Shorting the bounce");
  });

  it("does not short a reversal rally, a market without a downtrend, or one that has not bounced", () => {
    const reversal = decide("bounce_short", fallThenBounce(0.1, 2.4), false);
    expect(reversal.action).toBe("hold");
    expect(reversal.reasoning).toContain("possible reversal");
    const flat = decide("bounce_short", fallThenBounce(0.02, 0.6), false);
    expect(flat.action).toBe("hold");
    expect(flat.reasoning).toContain("no downtrend to short");
    const lower = decide("bounce_short", fallThenBounce(0.1, 0.5), false);
    expect(lower.action).toBe("hold");
    expect(lower.reasoning).toContain("Waiting for a bounce");
  });

  it("stays short while the price is above the average and covers when it falls back", () => {
    expect(decide("bounce_short", fallThenBounce(0.1, 2.0), true).action).toBe("hold");
    expect(decide("bounce_short", fallThenBounce(0.1, 0.5), true).action).toBe("cover");
  });

  it("matches the prototype engine on perps with funding, and only shorts one market at a time", () => {
    const prototype = createRequire(import.meta.url)("../../prototype/engine.js") as {
      simulate: (options: object) => { returnPct: number; trades: { index: number; side: string; symbol: string }[] };
    };
    const series: Record<string, number[]> = { AAA: walk(7, 1500), BBB: walk(42, 1500), CCC: walk(99, 1500), DDD: walk(5, 1500), EEE: walk(1234, 1500) };
    const funding = Object.fromEntries(Object.keys(series).map((token, t) => [token, series[token].map((_, i) => Math.sin(i / 17 + t) * 0.00003)]));
    const ours = simulate({ series, params: bounceShort, capital: 10_000, fromIndex: 200, funding });
    const theirs = prototype.simulate({
      tokens: Object.entries(series).map(([symbol, closes]) => ({ symbol, closes, funding: funding[symbol] })),
      strategy: "bounce_short",
      venue: "perps",
      capital: 10_000,
      maxPositionPct: 100,
      stopLossPct: 10,
      fromIndex: 200,
    });
    expect(ours.fills.some((fill) => fill.side === "short")).toBe(true);
    expect(ours.fills.every((fill) => fill.side === "short" || fill.side === "cover")).toBe(true);
    let open = 0;
    for (const fill of ours.fills) {
      open += fill.side === "short" ? 1 : -1;
      expect(open).toBeLessThanOrEqual(1);
    }
    expect(ours.fills.map((fill) => `${fill.index}:${fill.side}:${fill.token}`)).toEqual(theirs.trades.map((trade) => `${trade.index}:${trade.side}:${trade.symbol}`));
    expect(ours.returnPct).toBeCloseTo(theirs.returnPct, 9);
  });
});

describe("leveraged bounce short", () => {
  const at = (leverage: number, stopLossPct = 5): AgentParams => ({ strategy: "bounce_short", maxPositionPct: 100, stopLossPct, venue: "perps", leverage });
  // The same hand-checked series as "bounce short" above: a noisy 10% fall, then a bounce of `bounce`.
  const fallThenBounce = (fallPct: number, bounce: number) => {
    const fall = Array.from({ length: 168 }, (_, i) => 100 * (1 - (fallPct * i) / 167) + (i % 2 ? 0.2 : -0.2));
    return [...fall, fall[167] + bounce];
  };

  it("opens leverage x the margin, charges the cost on the whole position, and values it on the margin", () => {
    const series = { AAA: fallThenBounce(0.1, 2.0) };
    const hour = runHour({ cash: 1000, positions: {} }, at(3), series, 168);
    const price = series.AAA[168];
    const position = hour.state.positions.AAA;
    expect(position.side).toBe("short");
    expect(position.quantity).toBeCloseTo((1000 * 3) / price);
    expect(position.margin).toBeCloseTo(1000 - 3000 * PERPS_COST_RATE);
    expect(hour.state.cash).toBeCloseTo(0, 6);
    expect(hour.fills[0].costUsd).toBeCloseTo(3000 * PERPS_COST_RATE);
    expect(hour.equity).toBeCloseTo(1000 - 3000 * PERPS_COST_RATE);
  });

  it("gains and loses 3x the price move on the margin", () => {
    const short: AgentState = { cash: 0, positions: { AAA: { quantity: 30, entryPrice: 100, side: "short", margin: 1000 } } };
    expect(equityAt(short, { AAA: 90 })).toBeCloseTo(1000 + 30 * 10); // price -10%: +30% of the margin
    expect(equityAt(short, { AAA: 105 })).toBeCloseTo(1000 - 30 * 5); // price +5%: -15% of the margin
    expect(equityAt(short, { AAA: 140 })).toBe(0); // never below zero
  });

  it("stops out at the stop distance and pays back margin plus the loss", () => {
    const short: AgentState = { cash: 0, positions: { AAA: { quantity: 30, entryPrice: 100, side: "short", margin: 1000 } } };
    const series = { AAA: [...Array.from({ length: 169 }, () => 100), 105.5] };
    const hour = runHour(short, at(3), series, 169);
    expect(hour.fills.map((fill) => `${fill.side}:${fill.reason}`)).toEqual(["cover:stop_loss"]);
    expect(hour.decisions[0].reasoning).toContain("Stop loss hit");
    expect(hour.state.cash).toBeCloseTo(1000 - 30 * 5.5 - 30 * 105.5 * PERPS_COST_RATE);
  });

  it("liquidates before a wide stop when the loss reaches 95% of the margin", () => {
    // 10x: 95% of the margin is a 9.5% rise, which comes before a 20% stop.
    const short: AgentState = { cash: 0, positions: { AAA: { quantity: 100, entryPrice: 100, side: "short", margin: 1000 } } };
    const series = { AAA: [...Array.from({ length: 169 }, () => 100), 109.6] };
    const hour = runHour(short, at(10, 20), series, 169);
    expect(hour.decisions[0].reasoning).toContain("Liquidated");
    expect(hour.state.positions).toEqual({});
    expect(hour.state.cash).toBeGreaterThanOrEqual(0);
    expect(hour.state.cash).toBeLessThan(60);
  });

  it("ignores leverage for any other strategy or venue", () => {
    const series = { AAA: [...Array.from({ length: 49 }, (_, i) => 100 + (i % 2 ? 0.5 : -0.5)), 106] };
    const spike: AgentParams = { strategy: "spike_fade", maxPositionPct: 100, stopLossPct: 10, venue: "perps", leverage: 5 };
    const hour = runHour({ cash: 1000, positions: {} }, spike, series, 49);
    expect(hour.state.positions.AAA.margin).toBeUndefined();
    expect(hour.state.positions.AAA.quantity).toBeCloseTo((1000 * (1 - PERPS_COST_RATE)) / 106);
  });

  it("matches the prototype engine at 3x and 10x, with funding", () => {
    const prototype = createRequire(import.meta.url)("../../prototype/engine.js") as {
      simulate: (options: object) => { returnPct: number; trades: { index: number; side: string; symbol: string }[] };
    };
    const series: Record<string, number[]> = { AAA: walk(7, 1500), BBB: walk(42, 1500), CCC: walk(99, 1500), DDD: walk(5, 1500), EEE: walk(1234, 1500) };
    const funding = Object.fromEntries(Object.keys(series).map((token, t) => [token, series[token].map((_, i) => Math.sin(i / 17 + t) * 0.00003)]));
    for (const [leverage, stopLossPct] of [[3, 5], [10, 20]]) {
      const ours = simulate({ series, params: at(leverage, stopLossPct), capital: 10_000, fromIndex: 200, funding });
      const theirs = prototype.simulate({
        tokens: Object.entries(series).map(([symbol, closes]) => ({ symbol, closes, funding: funding[symbol] })),
        strategy: "bounce_short",
        venue: "perps",
        leverage,
        capital: 10_000,
        maxPositionPct: 100,
        stopLossPct,
        fromIndex: 200,
      });
      expect(ours.fills.some((fill) => fill.side === "short")).toBe(true);
      expect(ours.fills.map((fill) => `${fill.index}:${fill.side}:${fill.token}`)).toEqual(theirs.trades.map((trade) => `${trade.index}:${trade.side}:${trade.symbol}`));
      expect(ours.returnPct).toBeCloseTo(theirs.returnPct, 9);
      expect(ours.runs.every((run) => run.cash >= 0)).toBe(true);
    }
  });
});

describe("volatility sizing", () => {
  // Trend rule like the alt perps Lab agents, on shorter windows so the tests stay fast.
  const trend: Rules = {
    entry: { join: "all", conditions: [{ left: { kind: "price" }, op: "above", right: { kind: "sma", hours: 120, offsetPct: 3 } }] },
    exit: { join: "any", conditions: [{ left: { kind: "price" }, op: "below", right: { kind: "sma", hours: 120 } }] },
    takeProfitPct: null,
    maxHoldHours: null,
  };
  const sized: AgentParams = { strategy: "custom", rules: trend, maxPositionPct: 100, stopLossPct: 15, venue: "perps", sizing: { kind: "volTarget", targetPct: 20, hours: 72 } };

  it("annualises the population standard deviation of hourly log returns", () => {
    const closes = [100, 101, 99, 102, 100];
    const returns = closes.slice(1).map((close, i) => Math.log(close / closes[i]));
    const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / returns.length;
    expect(realisedVolatility(closes, 4)).toBeCloseTo(Math.sqrt(variance * 8760), 12);
    expect(realisedVolatility(flat(10), 9)).toBe(0);
  });

  it("needs the longer of the rule and volatility windows", () => {
    expect(paramsLookback(sized)).toBe(121);
    expect(paramsLookback({ ...sized, sizing: { kind: "volTarget", targetPct: 20, hours: 720 } })).toBe(721);
    expect(paramsLookback({ ...sized, sizing: undefined })).toBe(121);
  });

  it("buys equity x target / volatility, capped by the max position share", () => {
    // Alternating +-1% moves: about 94% volatility a year, so a 20% target wants about 21% of equity.
    const choppy = Array.from({ length: 130 }, (_, i) => 100 * (i % 2 ? 1.01 : 1));
    const series = { AAA: [...choppy, 130] };
    const window = series.AAA.slice(-122);
    const share = 0.2 / realisedVolatility(window, 72);
    const hour = runHour({ cash: 1000, positions: {} }, sized, series, 130, 130 * 3600 + 1800);
    expect(hour.fills).toHaveLength(1);
    expect(hour.fills[0].quantity * 130 + hour.fills[0].costUsd).toBeCloseTo(1000 * share, 6);
    // A target far above the volatility is capped at maxPositionPct.
    const capped = runHour({ cash: 1000, positions: {} }, { ...sized, maxPositionPct: 40, sizing: { kind: "volTarget", targetPct: 500, hours: 72 } }, series, 130, 130 * 3600 + 1800);
    expect(capped.fills[0].quantity * 130 + capped.fills[0].costUsd).toBeCloseTo(400, 6);
  });

  it("resizes at 00:00 UTC only when more than 25% off, and keeps the first entry price", () => {
    const rising = Array.from({ length: 200 }, (_, i) => 100 * (1 + i * 0.002) * (i % 2 ? 1.004 : 1));
    const series = { AAA: rising };
    const index = 190;
    const price = rising[index];
    const window = rising.slice(index - 121, index + 1);
    const share = 0.2 / realisedVolatility(window, 72);
    // Holds twice the wanted size: sells down to it at midnight.
    const entryPrice = 90;
    const heavy = { cash: 1000 - (2 * share * 1000) + 0, positions: { AAA: { quantity: (2 * share * 1000) / price, entryPrice, openedAt: 0 } } };
    const midnight = runHour(heavy, sized, series, index, 86400 * 10);
    expect(midnight.fills).toHaveLength(1);
    expect(midnight.fills[0]).toMatchObject({ side: "sell", reason: "resize", entryPrice });
    expect(midnight.state.positions.AAA.entryPrice).toBe(entryPrice);
    expect(midnight.state.positions.AAA.quantity * price).toBeCloseTo(share * equityAt(heavy, { AAA: price }), 6);
    expect(midnight.decisions[0]).toMatchObject({ action: "sell", reasoning: expect.stringMatching(/Daily resize/) });
    // Same position, not midnight: nothing happens.
    expect(runHour(heavy, sized, series, index, 86400 * 10 + 3600).fills).toEqual([]);
    // Within the 25% band: nothing happens, even at midnight.
    const close = { cash: 1000 - 1.2 * share * 1000, positions: { AAA: { quantity: (1.2 * share * 1000) / price, entryPrice, openedAt: 0 } } };
    expect(runHour(close, sized, series, index, 86400 * 10).fills).toEqual([]);
    // Too small: buys up to the wanted size from cash.
    const light = { cash: 1000 - 0.5 * share * 1000, positions: { AAA: { quantity: (0.5 * share * 1000) / price, entryPrice, openedAt: 0 } } };
    const topUp = runHour(light, sized, series, index, 86400 * 10);
    expect(topUp.fills[0]).toMatchObject({ side: "buy", reason: "resize" });
    expect(topUp.state.positions.AAA.entryPrice).toBe(entryPrice);
  });

  it("does not count a resize as a round trip, and agents without sizing never resize", () => {
    const series = { AAA: walk(11, 1200), BBB: walk(3, 1200) };
    const result = simulate({ series, params: sized, capital: 10_000, fromIndex: 130 });
    const resizes = result.fills.filter((fill) => fill.reason === "resize");
    expect(resizes.length).toBeGreaterThan(0);
    const exits = result.fills.filter((fill) => (fill.side === "sell" || fill.side === "cover") && fill.reason !== "resize");
    expect(result.roundTrips).toBe(exits.length);
    expect(result.runs.every((run) => run.cash >= -1e-9)).toBe(true);
    const plain = simulate({ series, params: { ...sized, sizing: undefined }, capital: 10_000, fromIndex: 130 });
    expect(plain.fills.some((fill) => fill.reason === "resize")).toBe(false);
  });

  it("matches the prototype engine, with funding and real hour times", () => {
    const prototype = createRequire(import.meta.url)("../../prototype/engine.js") as {
      simulate: (options: object) => { returnPct: number; roundTrips: number; trades: { index: number; side: string; symbol: string; reason: string }[] };
    };
    const series: Record<string, number[]> = { AAA: walk(7, 1500), BBB: walk(42, 1500), CCC: walk(99, 1500) };
    const funding = Object.fromEntries(Object.keys(series).map((token, t) => [token, series[token].map((_, i) => Math.sin(i / 17 + t) * 0.00003)]));
    // Index 0 starts at 05:00 UTC, so midnight falls on index 19, 43, ...
    const times = series.AAA.map((_, i) => 1_700_000_000 - (1_700_000_000 % 86400) + 5 * 3600 + i * 3600);
    for (const targetPct of [20, 60]) {
      const params: AgentParams = { ...sized, sizing: { kind: "volTarget", targetPct, hours: 72 } };
      const ours = simulate({ series, params, capital: 10_000, fromIndex: 130, times, funding });
      const theirs = prototype.simulate({
        tokens: Object.entries(series).map(([symbol, closes]) => ({ symbol, closes, funding: funding[symbol] })),
        strategy: "custom",
        rules: trend,
        venue: "perps",
        sizing: params.sizing,
        times,
        capital: 10_000,
        maxPositionPct: 100,
        stopLossPct: 15,
        fromIndex: 130,
      });
      expect(ours.fills.some((fill) => fill.reason === "resize")).toBe(true);
      expect(ours.fills.map((fill) => `${fill.index}:${fill.side}:${fill.token}:${fill.reason}`)).toEqual(
        theirs.trades.map((trade) => `${trade.index}:${trade.side}:${trade.symbol}:${trade.reason}`),
      );
      expect(ours.returnPct).toBeCloseTo(theirs.returnPct, 9);
      expect(ours.roundTrips).toBe(theirs.roundTrips);
    }
  });
});

describe("Lab long + short rules with a funding filter", () => {
  // Variant C on short windows: long above SMA x 1.03, short below SMA x 0.97 while 7d funding >= 0.
  const longShort: Rules = {
    entry: { join: "all", conditions: [{ left: { kind: "price" }, op: "above", right: { kind: "sma", hours: 120, offsetPct: 3 } }] },
    exit: { join: "any", conditions: [{ left: { kind: "price" }, op: "below", right: { kind: "sma", hours: 120 } }] },
    shortEntry: {
      join: "all",
      conditions: [
        { left: { kind: "price" }, op: "below", right: { kind: "sma", hours: 120, offsetPct: -3 } },
        { left: { kind: "funding7d", hours: 168 }, op: "above", right: { kind: "value", value: -0.000001 } },
      ],
    },
    shortExit: {
      join: "any",
      conditions: [
        { left: { kind: "price" }, op: "above", right: { kind: "sma", hours: 120 } },
        { left: { kind: "funding7d", hours: 168 }, op: "below", right: { kind: "value", value: 0 } },
      ],
    },
    takeProfitPct: null,
    maxHoldHours: null,
  };
  const params: AgentParams = { strategy: "custom", rules: longShort, maxPositionPct: 100, stopLossPct: 15, venue: "perps", sizing: { kind: "volTarget", targetPct: 20, hours: 72 } };
  const falling = Array.from({ length: 200 }, (_, i) => 100 * (1 - i * 0.002) * (i % 2 ? 1.004 : 1));

  it("annualises the last 168 hourly funding rates", () => {
    const funding = Array<number>(200).fill(0.00001);
    expect(paramsLookback(params)).toBe(169);
    const hour = runHour({ cash: 1000, positions: {} }, params, { AAA: falling }, 199, 199 * 3600 + 1800, { funding: { AAA: funding } });
    expect(hour.decisions[0].shortChecks?.[1].left).toBeCloseTo((168 * 0.00001 * 365 * 100) / 7, 4);
  });

  it("shorts a downtrend while funding is not negative, sized by volatility, and waits while it is negative", () => {
    const positive = { AAA: Array<number>(200).fill(0.00001) };
    const hour = runHour({ cash: 1000, positions: {} }, params, { AAA: falling }, 199, 199 * 3600 + 1800, { funding: positive });
    expect(hour.fills).toHaveLength(1);
    expect(hour.fills[0]).toMatchObject({ side: "short", reason: "signal" });
    const share = 0.2 / realisedVolatility(falling.slice(0, 200), 72);
    expect(hour.fills[0].quantity * falling[199] + hour.fills[0].costUsd).toBeCloseTo(1000 * Math.min(1, share), 6);
    const negative = { AAA: Array<number>(200).fill(-0.00001) };
    expect(runHour({ cash: 1000, positions: {} }, params, { AAA: falling }, 199, 199 * 3600 + 1800, { funding: negative }).fills).toEqual([]);
  });

  it("covers once funding turns negative", () => {
    const short = { cash: 900, positions: { AAA: { quantity: 1, entryPrice: 70, openedAt: 0, side: "short" as const } } };
    const negative = { AAA: Array<number>(200).fill(-0.00001) };
    const hour = runHour(short, params, { AAA: falling }, 199, 199 * 3600 + 1800, { funding: negative });
    expect(hour.fills[0]).toMatchObject({ side: "cover", reason: "signal" });
  });

  it("resizes a short at midnight: the entry moves to the price, the stop stays at the first entry", () => {
    const price = falling[199];
    const positive = { AAA: Array<number>(200).fill(0.00001) };
    // Holding twice the wanted size.
    const share = 0.2 / realisedVolatility(falling.slice(0, 200), 72);
    const quantity = (2 * share * 1000) / price;
    const heavy = { cash: 1000 - quantity * 70, positions: { AAA: { quantity, entryPrice: 70, openedAt: 0, side: "short" as const } } };
    const hour = runHour(heavy, params, { AAA: falling }, 199, 86400 * 10, { funding: positive });
    // Funding moves a short's entry a little each hour (it is paid from the position).
    expect(hour.fills[0]).toMatchObject({ side: "cover", reason: "resize", entryPrice: expect.closeTo(70, 2) });
    const after = hour.state.positions.AAA;
    expect(after).toMatchObject({ side: "short", entryPrice: price, stopPrice: expect.closeTo(70, 2) });
    expect(hour.state.cash).toBeGreaterThanOrEqual(0);
    // Only the cost of the change (and this hour's small funding payment) leaves the equity.
    expect(hour.equity).toBeCloseTo(equityAt(heavy, { AAA: price }) - hour.fills[0].costUsd, 1);
    // The stop is measured from the first entry: 70 x 1.15 = 80.5, so 80 holds and 81 covers.
    const stopped = runHour({ cash: 500, positions: { AAA: { ...after } } }, params, { AAA: [...falling.slice(0, 199), 81] }, 199, 199 * 3600 + 1800, { funding: positive });
    expect(stopped.fills[0]).toMatchObject({ side: "cover", reason: "stop_loss" });
    const held = runHour({ cash: 500, positions: { AAA: { ...after } } }, params, { AAA: [...falling.slice(0, 199), 80] }, 199, 199 * 3600 + 1800, { funding: positive });
    expect(held.fills.some((fill) => fill.reason === "stop_loss")).toBe(false);
  });

  it("matches the prototype engine, longs and shorts, with funding and real hour times", () => {
    const prototype = createRequire(import.meta.url)("../../prototype/engine.js") as {
      simulate: (options: object) => { returnPct: number; roundTrips: number; trades: { index: number; side: string; symbol: string; reason: string }[] };
    };
    const series: Record<string, number[]> = { AAA: walk(7, 1500), BBB: walk(42, 1500), CCC: walk(99, 1500) };
    const funding = Object.fromEntries(Object.keys(series).map((token, t) => [token, series[token].map((_, i) => Math.sin(i / 90 + t) * 0.00003)]));
    const times = series.AAA.map((_, i) => 1_700_000_000 - (1_700_000_000 % 86400) + 5 * 3600 + i * 3600);
    const ours = simulate({ series, params, capital: 10_000, fromIndex: 170, times, funding });
    const theirs = prototype.simulate({
      tokens: Object.entries(series).map(([symbol, closes]) => ({ symbol, closes, funding: funding[symbol] })),
      strategy: "custom",
      rules: longShort,
      venue: "perps",
      sizing: params.sizing,
      times,
      capital: 10_000,
      maxPositionPct: 100,
      stopLossPct: 15,
      fromIndex: 170,
    });
    expect(ours.fills.some((fill) => fill.side === "short" && fill.reason === "signal")).toBe(true);
    expect(ours.fills.some((fill) => (fill.side === "short" || fill.side === "cover") && fill.reason === "resize")).toBe(true);
    expect(ours.fills.map((fill) => `${fill.index}:${fill.side}:${fill.token}:${fill.reason}`)).toEqual(
      theirs.trades.map((trade) => `${trade.index}:${trade.side}:${trade.symbol}:${trade.reason}`),
    );
    expect(ours.returnPct).toBeCloseTo(theirs.returnPct, 9);
    expect(ours.runs.every((run) => run.cash >= -1e-9)).toBe(true);
  });
});
