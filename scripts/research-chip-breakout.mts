/**
 * Research only (read-only, never writes to the database): stress test of the published "Chip Breakout"
 * agent (be4b8f92, NVDA MU TSM, custom rules) on long price history (2026-11-13, owner's request).
 *
 * The rules are copied from the agent as it runs and frozen here; they go through the real engine
 * (`simulate` -> `runHour`), with the spot cost per fill (0.5%), 33% max per token and the 8% stop.
 *   entry: price crosses above the 72 hour high
 *   exit:  price below the 48 hour average minus 2%, or take profit 12%
 *
 * Three data sets, all on a 24/7 hourly grid like the live agent (missing hours forward filled):
 *   daily   Yahoo daily adjusted closes 2016-11 to now, each close held for 24 hours. A coarse proxy: the
 *           rules then see 3 daily closes as "72 hours" and the stop and take profit only fire at the close.
 *   hourly  Yahoo 60 minute bars with pre and post market, the last 730 days (Yahoo's limit).
 *   chain   the token closes Zolva stored (candles table), July 2026 on, split at the agent's start.
 *
 * Yahoo's public chart endpoint needs no key; downloads are cached in YAHOO_CACHE (default: OS temp).
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-chip-breakout.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { simulate, type AgentParams } from "../lib/engine/engine.ts";
import type { Rules } from "../lib/engine/rules.ts";

const HOUR_MS = 3_600_000;
const WARMUP = 168;
const CAPITAL = 10_000;
const CACHE = process.env.YAHOO_CACHE ?? join(tmpdir(), "zolva-yahoo-cache");
const SYMBOLS = ["NVDA", "MU", "TSM"];
/** Token addresses of the agent's markets (tokens table allowlist, checked 2026-11-13). */
const ADDRESSES: Record<string, string> = {
  NVDA: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec",
  MU: "0xff080c8ce2e5feadaca0da81314ae59d232d4afd",
  TSM: "0x58ffe4a942d3885baa22d7520691f611ef09e7aa",
};
/** Agent start (2026-10-15 09:24 UTC): chain hours before it are out of sample for the live record. */
const AGENT_START = Date.UTC(2026, 9, 15, 10);

const RULES = {
  entry: { join: "all", conditions: [{ op: "crossesAbove", left: { kind: "price" }, right: { kind: "high", hours: 72 } }] },
  exit: { join: "any", conditions: [{ op: "below", left: { kind: "price" }, right: { kind: "sma", hours: 48, offsetPct: -2 } }] },
  maxHoldHours: null,
  takeProfitPct: 12,
} as unknown as Rules;
const PARAMS: AgentParams = { strategy: "custom", rules: RULES, maxPositionPct: 33, stopLossPct: 8 };

type Bars = [number, number][]; // [time ms, close]

/** The parts of Yahoo's chart response this script reads. */
type YahooChart = {
  chart: {
    result: {
      timestamp: number[];
      indicators: { quote: { close: (number | null)[] }[]; adjclose?: { adjclose: (number | null)[] }[] };
    }[];
  };
};

async function yahoo(symbol: string, query: string, key: string): Promise<Bars> {
  const file = join(CACHE, `${symbol}-${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?${query}`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const body = (await response.json()) as YahooChart;
  const result = body.chart.result[0];
  const closes: (number | null)[] = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote[0].close;
  const bars: Bars = [];
  result.timestamp.forEach((seconds: number, i: number) => {
    if (closes[i] != null) bars.push([seconds * 1000, closes[i] as number]);
  });
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(bars));
  return bars;
}

/** Bars on an hourly grid; `availableAt` is when a bar's close is known. Forward fill, null before the first bar. */
function toGrid(bars: Bars, hours: number[], availableAt: (time: number) => number): (number | null)[] {
  const sorted = bars.map(([time, close]) => [availableAt(time), close] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: (number | null)[] = [];
  let j = 0;
  let last: number | null = null;
  for (const hour of hours) {
    while (j < sorted.length && sorted[j][0] <= hour) last = sorted[j++][1];
    out.push(last);
  }
  return out;
}

function hourRange(from: number, to: number): number[] {
  const hours: number[] = [];
  for (let hour = Math.ceil(from / HOUR_MS) * HOUR_MS; hour <= to; hour += HOUR_MS) hours.push(hour);
  return hours;
}

const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

function drawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    worst = Math.max(worst, (peak - value) / peak);
  }
  return worst * 100;
}

/** One continuous run, then returns per period from the equity curve (state carries across periods). */
function report(label: string, series: Record<string, (number | null)[]>, hours: number[], periods: { name: string; from: number; to: number }[]) {
  const run = simulate({ series, params: PARAMS, capital: CAPITAL, fromIndex: WARMUP, times: hours.map((hour) => hour / 1000) });
  const equity = run.runs.map((r) => r.equity);
  const time = run.runs.map((r) => hours[r.index]);
  // Equal-weight hold, rebalanced at each period start (so each period's hold is comparable).
  const holdIndex = (from: number, to: number) => {
    const i0 = hours.findIndex((hour) => hour >= from);
    const i1 = hours.findLastIndex((hour) => hour < to);
    const moves = SYMBOLS.map((symbol) => (series[symbol][i1] as number) / (series[symbol][i0] as number) - 1);
    return (moves.reduce((sum, move) => sum + move, 0) / moves.length) * 100;
  };
  const buys = run.fills.filter((fill) => fill.side === "buy").length;
  console.log(`\n${label}: ${new Date(time[0]).toISOString().slice(0, 10)} to ${new Date(time[time.length - 1]).toISOString().slice(0, 10)}`);
  console.log(`  whole: ${pct(run.returnPct)}, worst drop ${run.maxDrawdownPct.toFixed(1)}%, ${buys} buys, ${run.roundTrips} round trips, won ${run.winRatePct?.toFixed(0) ?? "-"}%`);
  console.log("  period        agent    hold   vs hold  worst drop  buys");
  for (const period of periods) {
    const idx = time.map((t, i) => [t, i] as const).filter(([t]) => t >= period.from && t < period.to).map(([, i]) => i);
    if (idx.length < 24) continue;
    const start = idx[0] > 0 ? equity[idx[0] - 1] : CAPITAL;
    const ret = (equity[idx[idx.length - 1]] / start - 1) * 100;
    const hold = holdIndex(period.from, period.to);
    const periodBuys = run.fills.filter((fill) => fill.side === "buy" && hours[fill.index] >= period.from && hours[fill.index] < period.to).length;
    console.log(
      `  ${period.name.padEnd(11)} ${pct(ret).padStart(8)} ${pct(hold).padStart(7)} ${((ret - hold >= 0 ? "+" : "") + (ret - hold).toFixed(1)).padStart(8)}  ${drawdown([start, ...idx.map((i) => equity[i])]).toFixed(1).padStart(9)}%  ${String(periodBuys).padStart(4)}`,
    );
  }
}

const years = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, k) => ({ name: String(from + k), from: Date.UTC(from + k, 0, 1), to: Date.UTC(from + k + 1, 0, 1) }));

function readDevVars(): Record<string, string> {
  const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
}

async function main() {
  const now = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;

  // 1. Daily closes, 10 years. A daily bar's close is known at about 21:00 UTC of its day.
  const daily: Record<string, Bars> = {};
  for (const symbol of SYMBOLS) daily[symbol] = await yahoo(symbol, "range=10y&interval=1d", "1d-10y");
  const dailyFrom = Math.max(...SYMBOLS.map((symbol) => daily[symbol][0][0]));
  const dailyHours = hourRange(dailyFrom + 24 * HOUR_MS, now);
  const closeAt = (time: number) => Math.floor(time / (24 * HOUR_MS)) * 24 * HOUR_MS + 21 * HOUR_MS;
  const dailySeries = Object.fromEntries(SYMBOLS.map((symbol) => [symbol, toGrid(daily[symbol], dailyHours, closeAt)]));
  report("DAILY proxy (Yahoo daily closes held 24h)", dailySeries, dailyHours, years(2017, 2026));

  // 2. Hourly bars with extended hours, last 730 days. A bar's close is known one hour after its start.
  const hourly: Record<string, Bars> = {};
  for (const symbol of SYMBOLS) hourly[symbol] = await yahoo(symbol, "range=730d&interval=60m&includePrePost=true", "60m-730d");
  const hourlyFrom = Math.max(...SYMBOLS.map((symbol) => hourly[symbol][0][0]));
  const hourlyHours = hourRange(hourlyFrom + HOUR_MS, now);
  const hourlySeries = Object.fromEntries(SYMBOLS.map((symbol) => [symbol, toGrid(hourly[symbol], hourlyHours, (time) => time + HOUR_MS)]));
  const halves = [
    ...years(2024, 2026),
    { name: "since agent", from: AGENT_START, to: now + HOUR_MS },
  ];
  report("HOURLY (Yahoo 60m incl. pre/post market)", hourlySeries, hourlyHours, halves);

  // 3. The token closes Zolva stored on chain (what the live agent trades on).
  const vars = readDevVars();
  const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const chain: Record<string, Bars> = {};
  for (const symbol of SYMBOLS) {
    const rows: Bars = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("candles").select("ts, close").eq("token_address", ADDRESSES[symbol]).order("ts").range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...data.map((row) => [Date.parse(row.ts), Number(row.close)] as [number, number]));
      if (data.length < 1000) break;
    }
    chain[symbol] = rows;
  }
  const chainFrom = Math.max(...SYMBOLS.map((symbol) => chain[symbol][0][0]));
  const chainHours = hourRange(chainFrom, now);
  const chainSeries = Object.fromEntries(SYMBOLS.map((symbol) => [symbol, toGrid(chain[symbol], chainHours, (time) => time)]));
  report("CHAIN (Zolva candles)", chainSeries, chainHours, [
    { name: "before agent", from: 0, to: AGENT_START },
    { name: "since agent", from: AGENT_START, to: now + HOUR_MS },
  ]);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
