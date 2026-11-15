import { describe, expect, it } from "vitest";

import { simulate, type AgentParams } from "../engine/engine";
import type { Market, MarketToken } from "../data/market";

import { LOOKBACK_HOURS } from "../engine/strategies";

import { checkRobustness, otherMarketSets } from "./robustness";

/** A seeded random walk around 100. */
function walk(seed: number, length: number): number[] {
  let state = seed;
  let price = 100;
  return Array.from({ length }, () => {
    state = (state * 16807) % 2147483647;
    price *= 1 + ((state / 2147483647) - 0.5) * 0.02;
    return price;
  });
}

const HOURS = 24 * 100;
// 2026-07-01 00:00 UTC, so the window spans July to early October.
const START = Date.UTC(2026, 6, 1) / 1000;

function token(address: string, symbol: string, seed: number, firstIndex = 0, extra: Partial<MarketToken> = {}): MarketToken {
  const closes = walk(seed, HOURS).map((close, index) => (index < firstIndex ? null : close));
  return { address, symbol, name: symbol, assetClass: "stock", firstIndex, closes, venue: "uniswap", ...extra };
}

const market: Market = {
  startTs: START,
  hours: HOURS,
  tokens: [
    token("0xa", "AAA", 7),
    token("0xb", "BBB", 42, 24 * 10),
    token("0xc", "CCC", 99, 24 * 5),
    token("0xd", "DDD", 5, 24 * 80),
    token("0xe", "ETH", 1234, 0, { assetClass: "crypto" }),
    token("0xp", "BTC-PERP", 77, 0, { venue: "lighter", funding: [] }),
  ],
};

const momentum: AgentParams = { strategy: "momentum", maxPositionPct: 33, stopLossPct: 8 };

describe("checkRobustness", () => {
  it("runs one continuous backtest over all the history and splits it into months", () => {
    const report = checkRobustness(market, ["0xa"], momentum);
    if (!report.ok) throw new Error(report.reason);
    const whole = simulate({ series: { "0xa": market.tokens[0].closes }, params: momentum, capital: 10_000, fromIndex: LOOKBACK_HOURS, toIndex: HOURS - 1, times: market.tokens[0].closes.map((_, i) => START + i * 3600) });
    expect(report.history.returnPct).toBeCloseTo(whole.returnPct, 9);
    expect(report.months.map((month) => month.month)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"].filter((_, i) => i < report.months.length));
    // The months chain into the whole run.
    const chained = report.months.reduce((total, month) => total * (1 + month.returnPct / 100), 1);
    expect((chained - 1) * 100).toBeCloseTo(report.history.returnPct, 6);
    expect(report.summary[0]).toMatch(/^Positive in \d+ of \d+ months; beat holding in \d+\.$/);
  });

  it("costs more at double costs on the same trades", () => {
    const report = checkRobustness(market, ["0xa"], momentum);
    if (!report.ok) throw new Error(report.reason);
    expect(report.history.trades).toBeGreaterThan(0);
    expect(report.doubleCosts.returnPct).toBeLessThan(report.history.returnPct);
  });

  it("tests other markets of the same kind, longest history first, never the picked ones", () => {
    const sets = otherMarketSets(market, [market.tokens[0]]);
    expect(sets.map((set) => set.map((one) => one.symbol))).toEqual([["CCC"], ["BBB"]]);
    const report = checkRobustness(market, ["0xa"], momentum);
    if (!report.ok) throw new Error(report.reason);
    expect(report.otherMarkets.map((other) => other.symbols)).toEqual([["CCC"], ["BBB"]]);
    // Crypto and perps markets only swap for their own kind: ETH has no other crypto here.
    expect(otherMarketSets(market, [market.tokens[4]])).toEqual([]);
  });

  it("says when there is not enough history, and refuses unknown or wrong-venue markets", () => {
    const short = checkRobustness(market, ["0xd"], momentum);
    expect(short.ok).toBe(false);
    expect(checkRobustness(market, ["0xzz"], momentum).ok).toBe(false);
    expect(checkRobustness(market, ["0xp"], momentum).ok).toBe(false);
    expect(checkRobustness(market, ["0xp"], { ...momentum, venue: "perps" }).ok).toBe(true);
  });

  it("warns that a few months are a weak test", () => {
    const report = checkRobustness(market, ["0xa"], momentum);
    if (!report.ok) throw new Error(report.reason);
    expect(report.summary.at(-1)).toContain("a weak test");
  });
});
