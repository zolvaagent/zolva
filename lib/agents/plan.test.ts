import { describe, expect, it } from "vitest";

import { simulate } from "../engine/engine";
import { holdEquity, liveEquity, MAX_CATCH_UP_HOURS, planAgentHours, type AgentRow } from "./plan";

const HOUR = 3600;
const START = 1_000 * HOUR;

function walk(length: number, seed = 11): number[] {
  let state = seed;
  const random = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const prices = [100];
  for (let i = 1; i < length; i++) prices.push(prices[i - 1] * (1 + (random() - 0.5) * 0.04));
  return prices;
}

const closes = { "0xa": walk(400) };
const agent = (overrides: Partial<AgentRow> = {}): AgentRow => ({
  id: "agent-1",
  strategy: "momentum",
  params: { max_position_pct: 50, stop_loss_pct: 8, start_prices: { "0xa": closes["0xa"][100] } },
  token_addresses: ["0xa"],
  start_capital: 1000,
  cash: 1000,
  last_run_ts: new Date((START + 100 * HOUR) * 1000).toISOString(),
  ...overrides,
});
const market = { startTs: START, closes };
const latestAt = (index: number) => START + index * HOUR;

describe("planAgentHours", () => {
  it("plans every hour since the last run, up to the latest", () => {
    const writes = planAgentHours(agent(), [], market, latestAt(110));
    expect(writes).toHaveLength(10);
    expect(writes[0].ts).toBe(new Date(latestAt(101) * 1000).toISOString());
  });

  it("plans nothing when already up to date", () => {
    expect(planAgentHours(agent(), [], market, latestAt(100))).toEqual([]);
  });

  it("runs only the latest hour for an agent that never ran", () => {
    expect(planAgentHours(agent({ last_run_ts: null }), [], market, latestAt(150))).toHaveLength(1);
  });

  it("caps a long catch-up at one week", () => {
    const writes = planAgentHours(agent({ last_run_ts: new Date(START * 1000).toISOString() }), [], market, latestAt(399));
    expect(writes).toHaveLength(MAX_CATCH_UP_HOURS);
  });

  it("produces the same trades as a backtest over the same hours", () => {
    // 150 hours: within the catch-up cap, so both cover exactly the same hours.
    const writes = planAgentHours(agent(), [], market, latestAt(250));
    const backtest = simulate({
      series: closes,
      params: { strategy: "momentum", maxPositionPct: 50, stopLossPct: 8 },
      capital: 1000,
      fromIndex: 101,
      toIndex: 250,
      times: closes["0xa"].map((_, i) => START + i * HOUR),
    });
    expect(backtest.fills.length).toBeGreaterThan(0);
    expect(writes.flatMap((write) => write.trades.map((trade) => trade.side))).toEqual(backtest.fills.map((fill) => fill.side));
    expect(writes[writes.length - 1].equity).toBeCloseTo(backtest.finalEquity, 9);
  });

  it("continues from stored positions and records when they were opened", () => {
    const opened = new Date(latestAt(90) * 1000).toISOString();
    const writes = planAgentHours(agent({ cash: 0 }), [{ token_address: "0xa", quantity: 10, avg_entry_price: 100, opened_at: opened }], market, latestAt(101));
    const stillOpen = writes[0].positions[0];
    if (stillOpen) expect(stillOpen.opened_at).toBe(opened);
    else expect(writes[0].trades[0].side).toBe("sell");
  });
});

describe("holdEquity", () => {
  it("tracks the tokens from their launch price, minus one cost", () => {
    const row = agent();
    const index = 200;
    const expected = 1000 * 0.995 * (closes["0xa"][index] / closes["0xa"][100]);
    expect(holdEquity(row, closes, index)).toBeCloseTo(expected);
  });
});

describe("liveEquity", () => {
  it("values only what is held: cash plus positions at the hour's close", () => {
    const position = { token_address: "0xa", quantity: 2, avg_entry_price: 1, opened_at: null };
    expect(liveEquity(10, [], closes, 200)).toBe(10);
    expect(liveEquity(10, [position], closes, 200)).toBeCloseTo(10 + 2 * (closes["0xa"][200] as number));
  });

  it("falls back to the entry price when the close is missing", () => {
    const position = { token_address: "0xmissing", quantity: 3, avg_entry_price: 5, opened_at: null };
    expect(liveEquity(1, [position], closes, 200)).toBe(16);
  });
});
