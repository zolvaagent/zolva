/**
 * Research only (read-only, never writes): would shorting have paid? Tests short
 * signals on the markets that can be borrowed on Morpho (docs/shorting-research.md),
 * alone and next to the dip hunter's long side, over the same three windows as
 * scripts/research-down-market.mts.
 *
 *   Trend short:  short when the price is 3% below its 48h average and down 3% in 24h
 *                 (momentum turned upside down); cover when it is back above the average.
 *   Spike fade:   short when the price is unusually far above its 48h average (z > 2.5);
 *                 cover when z is back to -0.5 or lower (mean reversion turned upside down).
 *   Dip + fade:   the dip hunter's long (deepest dip, z < -2.5) and the spike fade short,
 *                 one slot each.
 *
 * Every position: one slot of the agent, a 10% stop loss (for a short: price 10% above
 * entry), the cost per trade on open and close, and a borrow rate on shorts.
 *
 *   RESEARCH_COST=0.003 BORROW_APR=0.10 node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-shorting.mts
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { buildCloseSeries, HOUR_SECONDS, type CloseCandle } from "../lib/engine/series.ts";

const WARMUP_HOURS = 168;
const COST_RATE = Number(process.env.RESEARCH_COST ?? 0.005);
/** Yearly borrow rate on shorts; Morpho's rates were near 0% on 2026-11-03, 10% is a cautious default. */
const BORROW_APR = Number(process.env.BORROW_APR ?? 0.1);
const STOP = 0.1;
/** Borrowable on Morpho with real liquidity (docs/shorting-research.md). */
const SHORTABLE = ["NVDA", "SPY", "SPCX", "MSTR", "QQQ", "TSLA", "GME", "PLTR"];

type Side = "long" | "short";
type Position = { side: Side; quantity: number; entry: number };
type Strategy = "trend_short" | "spike_fade" | "dip_and_fade";

function readDevVars(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function stats(closes: number[], index: number) {
  const window = closes.slice(index - 47, index + 1);
  const average = mean(window);
  const deviation = Math.sqrt(mean(window.map((value) => (value - average) ** 2)));
  const price = closes[index];
  return { price, average, z: deviation > 0 ? (price - average) / deviation : 0, change24h: price / closes[index - 24] - 1 };
}

function simulate(series: Record<string, number[]>, strategy: Strategy, capital: number) {
  const symbols = Object.keys(series);
  const hours = series[symbols[0]].length;
  const slots = strategy === "dip_and_fade" ? 2 : 1;
  let cash = capital;
  const positions = new Map<string, Position>();
  let trades = 0;
  let shorts = 0;
  let peak = capital;
  let maxDrop = 0;

  // A short is valued as the collateral it locked plus its gain: quantity x (entry - price).
  const valueOf = (position: Position, price: number) =>
    position.side === "long" ? position.quantity * price : position.quantity * position.entry + position.quantity * (position.entry - price);
  const equityAt = (index: number) => cash + [...positions].reduce((sum, [symbol, position]) => sum + valueOf(position, series[symbol][index]), 0);

  const close = (symbol: string, index: number) => {
    const position = positions.get(symbol)!;
    const price = series[symbol][index];
    cash += valueOf(position, price) - position.quantity * price * COST_RATE;
    positions.delete(symbol);
    trades += 1;
  };
  const open = (symbol: string, index: number, side: Side) => {
    const amount = Math.min(cash, equityAt(index) / slots);
    if (amount < capital * 0.01) return;
    const price = series[symbol][index];
    cash -= amount;
    positions.set(symbol, { side, quantity: (amount * (1 - COST_RATE)) / price, entry: price });
    trades += 1;
    if (side === "short") shorts += 1;
  };

  for (let index = WARMUP_HOURS; index < hours; index++) {
    // Borrow interest on open shorts, charged hourly against cash.
    for (const [symbol, position] of positions) {
      if (position.side === "short") cash -= (position.quantity * series[symbol][index] * BORROW_APR) / (365 * 24);
    }
    // Stops and exits.
    for (const [symbol, position] of [...positions]) {
      const { price, average, z } = stats(series[symbol], index);
      const stopped = position.side === "long" ? price <= position.entry * (1 - STOP) : price >= position.entry * (1 + STOP);
      const exit =
        position.side === "long"
          ? z >= 0.5
          : strategy === "trend_short"
            ? price > average
            : z <= -0.5;
      if (stopped || exit) close(symbol, index);
    }
    // Entries: at most one position per side; the strongest signal wins.
    const free = symbols.filter((symbol) => !positions.has(symbol)).map((symbol) => ({ symbol, ...stats(series[symbol], index) }));
    const holds = (side: Side) => [...positions.values()].some((position) => position.side === side);
    if (strategy === "trend_short" && !holds("short")) {
      const pick = free.filter((row) => row.price < row.average * 0.97 && row.change24h < -0.03).sort((a, b) => a.change24h - b.change24h)[0];
      if (pick) open(pick.symbol, index, "short");
    }
    if ((strategy === "spike_fade" || strategy === "dip_and_fade") && !holds("short")) {
      const pick = free.filter((row) => row.z > 2.5).sort((a, b) => b.z - a.z)[0];
      if (pick) open(pick.symbol, index, "short");
    }
    if (strategy === "dip_and_fade" && !holds("long")) {
      const pick = free.filter((row) => row.z < -2.5 && !positions.has(row.symbol)).sort((a, b) => a.z - b.z)[0];
      if (pick) open(pick.symbol, index, "long");
    }
    const equity = equityAt(index);
    peak = Math.max(peak, equity);
    maxDrop = Math.max(maxDrop, 1 - equity / peak);
  }
  return { returnPct: (equityAt(hours - 1) / capital - 1) * 100, trades, shorts, maxDropPct: maxDrop * 100 };
}

async function main() {
  const vars = readDevVars();
  const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: tokens, error } = await db.from("tokens").select("address, symbol").in("symbol", SHORTABLE);
  if (error) throw new Error(error.message);

  const candles = new Map<string, CloseCandle[]>();
  for (const token of tokens) {
    const rows: CloseCandle[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: pageError } = await db.from("candles").select("ts, close").eq("token_address", token.address).order("ts").range(from, from + 999);
      if (pageError) throw new Error(pageError.message);
      rows.push(...data.map((row) => ({ time: Date.parse(row.ts) / 1000, close: Number(row.close) })));
      if (data.length < 1000) break;
    }
    candles.set(token.symbol, rows);
  }
  console.log(`cost per trade ${(COST_RATE * 100).toFixed(2)}%, borrow ${(BORROW_APR * 100).toFixed(0)}% a year, stop ${STOP * 100}%`);
  console.log("history:", [...candles].map(([symbol, rows]) => `${symbol} ${Math.round(rows.length / 24)}d`).join(", "));
  const latest = Math.max(...[...candles.values()].map((rows) => rows[rows.length - 1]?.time ?? 0));

  const windows = [
    { label: "last 30d", endDaysAgo: 0, days: 30 },
    { label: "30d before", endDaysAgo: 30, days: 30 },
    { label: "last 60d", endDaysAgo: 0, days: 60 },
  ];
  for (const window of windows) {
    const toTime = latest - window.endDaysAgo * 24 * HOUR_SECONDS;
    const fromTime = toTime - (window.days * 24 + WARMUP_HOURS - 1) * HOUR_SECONDS;
    const series: Record<string, number[]> = {};
    for (const [symbol, rows] of candles) {
      const closes = buildCloseSeries(rows, fromTime, toTime).closes;
      if (closes.every((close) => close != null)) series[symbol] = closes as number[];
    }
    const symbols = Object.keys(series);
    const last = series[symbols[0]].length - 1;
    const hold = mean(symbols.map((symbol) => ((1 - COST_RATE) * series[symbol][last]) / series[symbol][WARMUP_HOURS] - 1)) * 100;
    console.log(`\n== ${window.label}, ${symbols.length} markets (${symbols.join(" ")}): holding ${hold.toFixed(1)}%`);
    for (const strategy of ["trend_short", "spike_fade", "dip_and_fade"] as Strategy[]) {
      const run = simulate(series, strategy, 10_000);
      console.log(`   ${strategy.padEnd(14)} ${`${run.returnPct.toFixed(1)}%`.padStart(7)}  trades ${String(run.trades).padStart(3)} (shorts opened ${run.shorts})  worst drop ${run.maxDropPct.toFixed(1)}%`);
    }
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
