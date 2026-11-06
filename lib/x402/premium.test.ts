import { describe, expect, it } from "vitest";

import { parseBacktestRequest, runBacktest, scanMarkets, type MarketData } from "./premium";

const HOURS = 24 * 32;

/** A smooth wave plus a trend, so strategies trade and indicators move. */
function wave(base: number, amplitude: number, trend: number, period = 30): number[] {
  return Array.from({ length: HOURS }, (_, i) => base * (1 + trend * (i / HOURS)) + amplitude * Math.sin((2 * Math.PI * i) / period));
}

const dipping = wave(100, 2, 0);
// The last hours fall hard: a deep dip at the latest close.
for (let i = HOURS - 4; i < HOURS; i++) dipping[i] = 100 - (i - (HOURS - 5)) * 4;

const market: MarketData = {
  startTs: 1_790_000_000 - ((1_790_000_000 % 3600) || 0),
  hours: HOURS,
  tokens: [
    { address: "0xaaa", symbol: "NVDA", name: "NVIDIA", assetClass: "stock", closes: wave(180, 4, 0.1) },
    { address: "0xbbb", symbol: "TSLA", name: "Tesla", assetClass: "stock", closes: dipping },
    { address: "0xccc", symbol: "ETH", name: "Ether", assetClass: "crypto", closes: wave(2300, 40, -0.05) },
    // Too new to scan: only a day of prices.
    { address: "0xddd", symbol: "NEW", name: "Newcomer", assetClass: "stock", closes: [...Array(HOURS - 24).fill(null), ...Array(24).fill(10)] },
  ],
};

describe("scanMarkets", () => {
  it("lists every market with enough history, deepest dip first", () => {
    const scan = scanMarkets(market);
    expect(scan.markets.map((row) => row.symbol)).not.toContain("NEW");
    expect(scan.markets[0].symbol).toBe("TSLA");
    expect(scan.markets[0].zscore48h).toBeLessThan(-2.5);
    expect(scan.markets[0].trend24h).toBe("below");
    for (const row of scan.markets) {
      expect(row.rsi14h).toBeGreaterThanOrEqual(0);
      expect(row.rsi14h).toBeLessThanOrEqual(100);
    }
    expect(scan.asOf).toBe(new Date((market.startTs + (HOURS - 1) * 3600) * 1000).toISOString());
  });
});

describe("parseBacktestRequest", () => {
  it("accepts symbols or addresses from the allowlist and fills defaults", () => {
    const parsed = parseBacktestRequest({ strategy: "momentum", markets: ["nvda", "0xccc"] }, market);
    expect(parsed.errors).toEqual([]);
    expect(parsed.request).toEqual({ strategy: "momentum", rules: null, tokens: ["0xaaa", "0xccc"], capital: 10_000, maxPositionPct: 33, stopLossPct: 8, days: 30 });
  });

  it("refuses unknown markets, too many markets and out of range settings", () => {
    expect(parseBacktestRequest({ strategy: "momentum", markets: ["0x1234"] }, market).errors.join(" ")).toMatch(/Unknown market/);
    expect(parseBacktestRequest({ strategy: "momentum", markets: ["NVDA", "TSLA", "ETH", "NEW"] }, market).errors.join(" ")).toMatch(/1 to 3/);
    expect(parseBacktestRequest({ strategy: "yolo", markets: ["NVDA"] }, market).errors.join(" ")).toMatch(/strategy/);
    expect(parseBacktestRequest({ strategy: "momentum", markets: ["NVDA"], stopLossPct: 90, days: 2.5 }, market).errors).toHaveLength(2);
  });

  it("checks custom rules with the Studio's parser", () => {
    expect(parseBacktestRequest({ strategy: "custom", markets: ["NVDA"], rules: { entry: {} } }, market).errors.join(" ")).toMatch(/rules:/);
  });
});

describe("runBacktest", () => {
  it("replays the requested days and compares with holding", () => {
    const parsed = parseBacktestRequest({ strategy: "mean_reversion", markets: ["NVDA", "ETH"], days: 14 }, market);
    const report = runBacktest(parsed.request!, market);
    expect(report.settings.markets).toEqual(["NVDA", "ETH"]);
    expect(Date.parse(report.to) - Date.parse(report.from)).toBe((14 * 24 - 1) * 3600 * 1000);
    expect(report.result.edgePts).toBeCloseTo(report.result.returnPct - report.result.holdReturnPct, 1);
    for (const trade of report.trades) {
      expect(["NVDA", "ETH"]).toContain(trade.market);
      expect(typeof trade.reasoning).toBe("string");
    }
    expect(report.equity.at(-1)![1]).toBeCloseTo(report.result.finalEquity, 1);
  });
});
