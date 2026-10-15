import { describe, expect, it } from "vitest";

import { hourlyReports, summarize, type ActivityHour, type ActivityTrade } from "./activity";

const H = 3600;
const trade = (ts: number, symbol: string, side: "buy" | "sell", quantity = 10, price = 100): ActivityTrade => ({
  ts,
  agentId: `a-${symbol}-${ts}`,
  agentName: "Agent",
  isHouse: true,
  strategy: "momentum",
  symbol,
  side,
  quantity,
  price,
  costUsd: 5,
  reason: "signal",
  reasoning: null,
});

const hours: ActivityHour[] = [
  { ts: 10 * H, checked: 15, buys: 2, sells: 0 },
  { ts: 11 * H, checked: 15, buys: 0, sells: 1 },
  { ts: 12 * H, checked: 14, buys: 0, sells: 0 },
];
const trades = [trade(10 * H, "NVDA", "buy"), trade(10 * H, "AMZN", "buy", 2, 250), trade(11 * H, "NVDA", "sell")];

describe("summarize", () => {
  it("totals checks, trades and paper volume since a time", () => {
    expect(summarize(hours, trades, 10 * H)).toEqual({ checks: 44, buys: 2, sells: 1, volumeUsd: 1000 + 500 + 1000, topSymbol: { symbol: "NVDA", trades: 2 } });
  });

  it("ignores older hours and trades", () => {
    const summary = summarize(hours, trades, 11 * H);
    expect(summary.checks).toBe(29);
    expect(summary.buys).toBe(0);
    expect(summary.sells).toBe(1);
  });

  it("has no top stock without trades", () => {
    expect(summarize(hours, [], 0).topSymbol).toBeNull();
  });
});

describe("hourlyReports", () => {
  it("lists hours newest first with their own trades", () => {
    const reports = hourlyReports(hours, trades);
    expect(reports.map((report) => report.ts)).toEqual([12 * H, 11 * H, 10 * H]);
    expect(reports[0].trades).toEqual([]);
    expect(reports[2].trades.map((item) => item.symbol)).toEqual(["NVDA", "AMZN"]);
  });
});
