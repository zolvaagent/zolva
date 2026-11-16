import { describe, expect, it } from "vitest";

import { equityAt, simulate, type AgentParams } from "../engine/engine.ts";
import { RULE_TEMPLATES } from "../engine/rules.ts";

import { buildLedger, type LedgerInput } from "./ledger.ts";

/** A seeded random walk around 100. */
function walk(seed: number, length: number, step = 0.02): number[] {
  let state = seed;
  let price = 100;
  return Array.from({ length }, () => {
    state = (state * 16807) % 2147483647;
    price *= 1 + (state / 2147483647 - 0.5) * step;
    return price;
  });
}

const HOUR = 3600;
const START = 1_700_006_400; // 00:00 UTC, so daily resizes happen

/**
 * Runs the real engine, then hands the ledger exactly what Zolva records: the fills as trades,
 * the cash after every hour, the final positions and the last prices.
 */
function recorded(params: AgentParams, series: Record<string, number[]>, funding?: Record<string, number[]>) {
  const capital = 10_000;
  const times = series[Object.keys(series)[0]].map((_, i) => START + i * HOUR);
  const result = simulate({ series, params, capital, fromIndex: 200, times, ...(funding ? { funding } : {}) });
  const last = times.length - 1;
  const prices = Object.fromEntries(Object.entries(series).map(([token, closes]) => [token, closes[last]]));
  const input: LedgerInput = {
    startCapital: capital,
    trades: result.fills.map((fill) => ({ ts: times[fill.index], token: fill.token, symbol: fill.token, side: fill.side, quantity: fill.quantity, price: fill.price, costUsd: fill.costUsd, reason: fill.reason, txHash: null })),
    runs: result.runs.map((run) => ({ ts: times[run.index], cash: run.cash })),
    cash: result.state.cash,
    positions: Object.entries(result.state.positions).map(([token, position]) => ({
      token,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      side: position.side === "short" ? "short" : "long",
      margin: position.margin ?? null,
    })),
    prices,
    ...(funding
      ? { funding: Object.fromEntries(Object.entries(funding).map(([token, rates]) => [token, rates.map((rate, i) => ({ ts: times[i], close: series[token][i], rate }))])) }
      : {}),
    ...(params.leverage ? { leverage: params.leverage } : {}),
  };
  return { input, result, equity: equityAt(result.state, prices) };
}

function expectBalanced(input: LedgerInput, equity: number) {
  const ledger = buildLedger(input);
  const { totals } = ledger;
  expect(totals.balances).toBe(true);
  expect(totals.ledgerCash).toBeCloseTo(input.cash, 6);
  expect(totals.valueNow).toBeCloseTo(equity, 6);
  expect(totals.startCapital + totals.realisedPnl + totals.unrealisedPnl).toBeCloseTo(totals.valueNow, 6);
  expect(totals.quantityMismatches).toEqual([]);
  return ledger;
}

const series = { AAA: walk(7, 900), BBB: walk(42, 900), CCC: walk(99, 900) };
const funding = Object.fromEntries(Object.keys(series).map((token, t) => [token, series[token as keyof typeof series].map((_, i) => Math.sin(i / 17 + t) * 0.00004)]));

describe("buildLedger", () => {
  it("balances a spot agent, with costs and realised P&L on each sell", () => {
    const { input, result, equity } = recorded({ strategy: "momentum", maxPositionPct: 33, stopLossPct: 8 }, series);
    const ledger = expectBalanced(input, equity);
    expect(ledger.rows).toHaveLength(result.fills.length);
    expect(ledger.totals.costs).toBeCloseTo(result.fills.reduce((sum, fill) => sum + fill.costUsd, 0), 9);
    expect(ledger.totals.funding).toBeNull();
    for (const row of ledger.rows) expect(row.realisedPnl === null).toBe(row.side === "buy");
    // The first buy pays its notional, cost included.
    const first = ledger.rows[0];
    expect(first.cashFlow).toBeCloseTo(-(first.quantity * first.price + first.costUsd), 9);
  });

  it("balances volatility sizing with partial resize sells", () => {
    const params: AgentParams = { strategy: "custom", rules: RULE_TEMPLATES.momentum, maxPositionPct: 50, stopLossPct: 15, sizing: { kind: "volTarget", targetPct: 20, hours: 72 } };
    const { input, result, equity } = recorded(params, series);
    expect(result.fills.some((fill) => fill.reason === "resize" && fill.side === "sell")).toBe(true);
    const ledger = expectBalanced(input, equity);
    expect(ledger.rows.filter((row) => row.reason === "resize" && row.side === "sell").every((row) => row.realisedPnl !== null && row.heldAfter > 0)).toBe(true);
  });

  it("balances perps with funding, longs and shorts, and reports the funding", () => {
    const { input, result, equity } = recorded({ strategy: "dip_fade", maxPositionPct: 50, stopLossPct: 10, venue: "perps" }, { ...series, DDD: walk(5, 900), EEE: walk(1234, 900) }, {
      ...funding,
      DDD: walk(5, 900).map((_, i) => 0.00003 * Math.cos(i / 11)),
      EEE: walk(1234, 900).map(() => 0.00002),
    });
    expect(result.fills.some((fill) => fill.side === "short")).toBe(true);
    const ledger = expectBalanced(input, equity);
    expect(ledger.totals.funding).not.toBeNull();
    expect(ledger.totals.funding).not.toBe(0);
  });

  it("balances a leveraged short", () => {
    const fall = walk(3, 900, 0.03).map((price, i) => price * (1 - i / 3000));
    const { input, result, equity } = recorded({ strategy: "bounce_short", maxPositionPct: 100, stopLossPct: 10, venue: "perps", leverage: 3 }, { AAA: fall, BBB: walk(8, 900), CCC: walk(11, 900) }, funding);
    expect(result.fills.some((fill) => fill.side === "short")).toBe(true);
    expectBalanced(input, equity);
  });

  it("flags a ledger that does not match the recorded cash", () => {
    const { input } = recorded({ strategy: "momentum", maxPositionPct: 33, stopLossPct: 8 }, series);
    const ledger = buildLedger({ ...input, trades: input.trades.slice(1) });
    expect(ledger.totals.balances).toBe(false);
  });
});
