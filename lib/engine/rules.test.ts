import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { runHour, simulate, type AgentParams } from "./engine";
import { checkCondition, describeCondition, indicatorValue, parseRules, RULE_TEMPLATES, rulesLookback, type Rules } from "./rules";
import { decide } from "./strategies";

const flat = (length: number, price = 100) => Array<number>(length).fill(price);

describe("indicatorValue", () => {
  const window = [10, 11, 12, 13, 14, 15];

  it("computes averages, highs and lows of the previous hours", () => {
    expect(indicatorValue({ kind: "sma", hours: 3 }, window)).toBe(14);
    // high/low look at the hours before the current one, so a breakout can exceed them
    expect(indicatorValue({ kind: "high", hours: 3 }, window)).toBe(14);
    expect(indicatorValue({ kind: "low", hours: 3 }, window)).toBe(12);
  });

  it("computes change in percent", () => {
    expect(indicatorValue({ kind: "change", hours: 5 }, window)).toBeCloseTo(50);
  });

  it("computes RSI from up and down moves", () => {
    expect(indicatorValue({ kind: "rsi", hours: 5 }, window)).toBe(100);
    expect(indicatorValue({ kind: "rsi", hours: 2 }, [10, 12, 11])).toBeCloseTo(100 - 100 / (1 + 2 / 1));
  });
});

describe("conditions", () => {
  it("detects a cross only on the hour it happens", () => {
    const condition = { left: { kind: "price" as const }, op: "crossesAbove" as const, right: { kind: "sma" as const, hours: 3 } };
    expect(checkCondition(condition, [10, 10, 10, 9, 12]).met).toBe(true);
    expect(checkCondition(condition, [10, 10, 9, 12, 13]).met).toBe(false);
  });

  it("applies an offset to a price line", () => {
    const condition = { left: { kind: "price" as const }, op: "below" as const, right: { kind: "sma" as const, hours: 2, offsetPct: -3 } };
    expect(checkCondition(condition, [100, 100, 94]).met).toBe(true); // 2h average of 100 and 94 is 97, minus 3% = 94.09
    expect(checkCondition(condition, [100, 100, 99]).met).toBe(false);
  });

  it("describes conditions in plain words with units", () => {
    const text = describeCondition(RULE_TEMPLATES.momentum.entry.conditions[1], 1.234);
    expect(text).toBe("24h change +1.2% above +3.0%");
  });
});

describe("rulesLookback", () => {
  it("needs the longest period plus one, and one more for crosses", () => {
    expect(rulesLookback(RULE_TEMPLATES.momentum)).toBe(49);
    expect(rulesLookback(RULE_TEMPLATES.breakout)).toBe(74);
  });
});

describe("parseRules", () => {
  it("accepts the templates", () => {
    for (const rules of Object.values(RULE_TEMPLATES)) expect(parseRules(rules).errors).toEqual([]);
  });

  it("requires a buy rule and a way to sell", () => {
    const { errors } = parseRules({ entry: { join: "all", conditions: [] }, exit: { join: "any", conditions: [] } });
    expect(errors).toContain("Add at least one buy rule.");
    expect(errors.join(" ")).toMatch(/only sells on its stop loss/);
  });

  it("rejects unknown indicators, periods and mixed units", () => {
    const bad = (condition: unknown) => parseRules({ entry: { join: "all", conditions: [condition] }, exit: { join: "any", conditions: [] }, takeProfitPct: 5 }).errors;
    expect(bad({ left: { kind: "magic" }, op: "above", right: { kind: "value", value: 1 } })).not.toEqual([]);
    expect(bad({ left: { kind: "sma", hours: 13 }, op: "above", right: { kind: "price" } })).not.toEqual([]);
    expect(bad({ left: { kind: "price" }, op: "above", right: { kind: "value", value: 100 } })).not.toEqual([]);
    expect(bad({ left: { kind: "rsi", hours: 14 }, op: "above", right: { kind: "sma", hours: 24 } })).not.toEqual([]);
  });

  it("caps conditions and range checks take profit", () => {
    const condition = RULE_TEMPLATES.mean_reversion.entry.conditions[0];
    expect(parseRules({ entry: { join: "all", conditions: [condition, condition, condition, condition] }, exit: RULE_TEMPLATES.mean_reversion.exit }).errors.join(" ")).toMatch(/at most 3/);
    expect(parseRules({ ...RULE_TEMPLATES.momentum, takeProfitPct: 0 }).errors.join(" ")).toMatch(/Take profit/);
  });
});

describe("custom agents in the engine", () => {
  const custom = (rules: Rules): AgentParams => ({ strategy: "custom", rules, maxPositionPct: 50, stopLossPct: 20 });
  const buyAlways: Rules = {
    entry: { join: "all", conditions: [{ left: { kind: "change", hours: 1 }, op: "above", right: { kind: "value", value: -100 } }] },
    exit: { join: "any", conditions: [] },
    takeProfitPct: 5,
    maxHoldHours: 3,
  };

  it("sells on take profit", () => {
    const state = { cash: 0, positions: { A: { quantity: 1, entryPrice: 100, openedAt: 0 } } };
    const hour = runHour(state, custom(buyAlways), { A: [...flat(2), 106] }, 2, 7200);
    expect(hour.fills[0]).toMatchObject({ side: "sell", reason: "take_profit" });
  });

  it("sells after the max holding time", () => {
    const state = { cash: 0, positions: { A: { quantity: 1, entryPrice: 100, openedAt: 0 } } };
    const hour = runHour(state, custom(buyAlways), { A: flat(4) }, 3, 3 * 3600);
    expect(hour.fills[0]).toMatchObject({ side: "sell", reason: "max_hold" });
  });

  it("the momentum template trades exactly like the momentum preset", () => {
    let seed = 3;
    const random = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
    const closes = [100];
    for (let i = 1; i < 500; i++) closes.push(closes[i - 1] * (1 + (random() - 0.5) * 0.04));
    const preset = simulate({ series: { A: closes }, params: { strategy: "momentum", maxPositionPct: 50, stopLossPct: 8 }, capital: 1000, fromIndex: 60 });
    const template = simulate({ series: { A: closes }, params: { ...custom(RULE_TEMPLATES.momentum), stopLossPct: 8 }, capital: 1000, fromIndex: 60 });
    expect(template.fills.map((fill) => `${fill.index}:${fill.side}`)).toEqual(preset.fills.map((fill) => `${fill.index}:${fill.side}`));
    expect(decide("momentum", closes.slice(0, 49), false).action).toBeDefined();
  });
});

describe("parity with the prototype rule engine", () => {
  const prototype = createRequire(import.meta.url)("../../prototype/engine.js") as {
    simulate: (options: object) => { returnPct: number; trades: { index: number; side: string; symbol: string; reason: string }[] };
  };

  function walk(seed: number, length: number): number[] {
    let state = seed;
    const random = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
    const prices = [100];
    for (let i = 1; i < length; i++) prices.push(prices[i - 1] * (1 + (random() - 0.5) * 0.03 + Math.sin(i / 30) * 0.003));
    return prices;
  }

  for (const [name, rules] of Object.entries(RULE_TEMPLATES)) {
    it(`matches the prototype for the ${name} template`, () => {
      const series = { AAA: walk(5, 700), BBB: walk(77, 700) };
      const params: AgentParams = { strategy: "custom", rules, maxPositionPct: 40, stopLossPct: 6 };
      const ours = simulate({ series, params, capital: 10_000, fromIndex: 100 });
      const theirs = prototype.simulate({
        tokens: Object.entries(series).map(([symbol, closes]) => ({ symbol, closes })),
        strategy: "custom",
        rules,
        capital: 10_000,
        maxPositionPct: 40,
        stopLossPct: 6,
        fromIndex: 100,
      });
      expect(ours.fills.length).toBeGreaterThan(0);
      expect(ours.fills.map((fill) => `${fill.index}:${fill.side}:${fill.token}:${fill.reason}`)).toEqual(
        theirs.trades.map((trade) => `${trade.index}:${trade.side}:${trade.symbol}:${trade.reason}`),
      );
      expect(ours.returnPct).toBeCloseTo(theirs.returnPct, 9);
    });
  }
});
