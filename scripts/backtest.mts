/**
 * Backtests both strategies on the real candles in Supabase.
 *
 *   npm run backtest
 *
 * Runs the same 10 token sets as the Phase 0 check over three separate
 * 30 day windows (so one lucky month cannot hide a bad strategy), each with
 * and without the outlier filter, and prints averages next to buy and hold.
 * Read-only: it never writes to the database.
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { buyAndHold, simulate, type AgentParams } from "../lib/engine/engine.ts";
import { buildCloseSeries, HOUR_SECONDS, type CloseCandle } from "../lib/engine/series.ts";
import { LOOKBACK_HOURS, type StrategyKey } from "../lib/engine/strategies.ts";

const WINDOW_HOURS = 30 * 24;
const WINDOWS = 3;
const SETS = [["NVDA"], ["META", "AAPL", "GOOGL"], ["GME"], ["SPY", "QQQ"], ["CRCL", "RDDT"], ["PLTR"], ["MSTR"], ["TSLA", "AMZN"], ["MU", "TSM"], ["USO", "GLD"]];
const PARAMS: Omit<AgentParams, "strategy"> = { maxPositionPct: 33, stopLossPct: 8 };

function readDevVars(): Record<string, string> {
  const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
}

/** Forward-fill only, no outlier filter: what the engine would see without it. */
function rawSeries(candles: CloseCandle[], fromTime: number, toTime: number): (number | null)[] {
  const byTime = new Map(candles.map((candle) => [candle.time, candle.close]));
  const closes: (number | null)[] = [];
  let last: number | null = null;
  for (let time = fromTime; time <= toTime; time += HOUR_SECONDS) {
    last = byTime.get(time) ?? last;
    closes.push(last);
  }
  return closes;
}

async function main() {
  const vars = readDevVars();
  const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: tokens, error } = await db.from("tokens").select("address, symbol");
  if (error) throw new Error(error.message);

  // Supabase returns at most 1000 rows per request: page through.
  const candlesBySymbol = new Map<string, CloseCandle[]>();
  for (const token of tokens) {
    const rows: CloseCandle[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: pageError } = await db
        .from("candles")
        .select("ts, close")
        .eq("token_address", token.address)
        .order("ts")
        .range(from, from + 999);
      if (pageError) throw new Error(pageError.message);
      rows.push(...data.map((row) => ({ time: Date.parse(row.ts) / 1000, close: Number(row.close) })));
      if (data.length < 1000) break;
    }
    candlesBySymbol.set(token.symbol, rows);
  }

  const latest = Math.max(...[...candlesBySymbol.values()].map((rows) => rows[rows.length - 1]?.time ?? 0));
  console.log(`Candles loaded. Latest hour ${new Date(latest * 1000).toISOString().slice(0, 16)}. Params: max ${PARAMS.maxPositionPct}%, stop ${PARAMS.stopLossPct}%.\n`);
  console.log("strategy        window          filter  sets  avg return  avg hold  beat hold  positive  avg trades  worst drop");

  for (const strategy of ["momentum", "mean_reversion"] as StrategyKey[]) {
    for (let w = 0; w < WINDOWS; w++) {
      const toTime = latest - w * WINDOW_HOURS * HOUR_SECONDS;
      const startTime = toTime - (WINDOW_HOURS - 1) * HOUR_SECONDS;
      const fromTime = startTime - LOOKBACK_HOURS * HOUR_SECONDS; // warm-up hours before the window

      for (const filtered of [true, false]) {
        const results = [];
        for (const set of SETS) {
          const series: Record<string, (number | null)[]> = {};
          for (const symbol of set) {
            const candles = candlesBySymbol.get(symbol) ?? [];
            series[symbol] = filtered ? buildCloseSeries(candles, fromTime, toTime).closes : rawSeries(candles, fromTime, toTime);
          }
          // Skip sets without a full window of history.
          if (Object.values(series).some((closes) => closes[0] == null)) continue;
          const run = simulate({ series, params: { strategy, ...PARAMS }, capital: 10_000, fromIndex: LOOKBACK_HOURS });
          const hold = buyAndHold(series, 10_000, LOOKBACK_HOURS);
          results.push({ ret: run.returnPct, hold: hold.returnPct, trades: run.fills.length, drop: run.maxDrawdownPct });
        }
        if (!results.length) continue;
        const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
        const label = `${new Date(startTime * 1000).toISOString().slice(5, 10)} to ${new Date(toTime * 1000).toISOString().slice(5, 10)}`;
        console.log(
          [
            strategy.padEnd(15),
            label.padEnd(15),
            (filtered ? "on" : "off").padEnd(6),
            String(results.length).padStart(5),
            `${avg(results.map((r) => r.ret)).toFixed(2)}%`.padStart(11),
            `${avg(results.map((r) => r.hold)).toFixed(2)}%`.padStart(9),
            `${results.filter((r) => r.ret > r.hold).length}/${results.length}`.padStart(10),
            `${results.filter((r) => r.ret > 0).length}/${results.length}`.padStart(9),
            avg(results.map((r) => r.trades)).toFixed(1).padStart(11),
            `${Math.max(...results.map((r) => r.drop)).toFixed(1)}%`.padStart(11),
          ].join(" "),
        );
      }
    }
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
