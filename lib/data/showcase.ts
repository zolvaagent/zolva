import "server-only";

import { HOUSE_AGENTS, type HouseAgent } from "@/lib/agents/house";
import type { Market } from "@/lib/data/market";
import { buyAndHold, simulate, type SimulationResult } from "@/lib/engine/engine";

export const BACKTEST_HOURS = 30 * 24;

export type Backtest = {
  config: HouseAgent;
  /** Start of the backtest's first hour, unix seconds. */
  startTs: number;
  result: SimulationResult;
  holdCurve: number[];
  holdReturnPct: number;
};

/**
 * 30 day backtests of the house agents' exact settings on real prices. The
 * landing page shows these, always labelled as backtests, until live paper
 * track records are long enough to show instead.
 */
export function houseBacktests(market: Market, capital = 10_000): Backtest[] {
  const bySymbol = new Map(market.tokens.map((token) => [token.symbol, token]));
  const fromIndex = market.hours - BACKTEST_HOURS;
  const results: Backtest[] = [];
  for (const config of HOUSE_AGENTS) {
    const tokens = config.symbols.map((symbol) => bySymbol.get(symbol));
    if (tokens.some((token) => !token || token.firstIndex === null || token.firstIndex > fromIndex - 80)) continue;
    const series = Object.fromEntries(tokens.map((token) => [token!.symbol, token!.closes]));
    const result = simulate({
      series,
      params: { strategy: config.strategy, rules: config.rules, maxPositionPct: config.maxPositionPct, stopLossPct: config.stopLossPct },
      capital,
      fromIndex,
      times: market.tokens[0].closes.map((_, i) => market.startTs + i * 3600),
    });
    const hold = buyAndHold(series, capital, fromIndex);
    results.push({ config, startTs: market.startTs + fromIndex * 3600, result, holdCurve: hold.curve, holdReturnPct: hold.returnPct });
  }
  return results;
}
