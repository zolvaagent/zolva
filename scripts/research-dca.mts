/**
 * Research only (read-only, no database): is a DCA template worth offering? (2026-11-16, owner picked the idea
 * from the OpenTrade review.) Fixed before running, no parameters searched:
 *
 *   DCA       the capital is split into 52 equal weekly buys (every 7 days from the window start), 0.5% cost
 *             per buy (spot DEX), never sells; cash not yet invested earns nothing.
 *   Lump sum  everything bought at the window start, 0.5% cost, held.
 *   Windows   every 12 month window starting on the 1st of each month (rolling), plus calendar years.
 *   Markets   BTC, ETH, SOL (Binance daily closes from the hourly cache) and SPY, QQQ, NVDA, AAPL, TSLA (Yahoo
 *             daily adjusted closes). Spot markets Zolva lists; past prices of the underlying, not the tokens.
 * Reported per market: median return of each method, share of windows where DCA beats lump sum, median and
 * worst drop of the portfolio value (cash + holdings) inside a window.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-dca.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BINANCE_SYMBOLS, binanceCloses, HOUR_MS } from "./binance-history.mts";

const DAY_MS = 24 * HOUR_MS;
const COST = 0.005;
const BUYS = 52;
const YAHOO_CACHE = process.env.YAHOO_CACHE ?? join(tmpdir(), "zolva-yahoo-cache");
const CRYPTO = ["BTC", "ETH", "SOL"];
const STOCKS = ["SPY", "QQQ", "NVDA", "AAPL", "TSLA"];

type Daily = { day: number; close: number }[];

async function yahooDaily(symbol: string): Promise<Daily> {
  const file = join(YAHOO_CACHE, `${symbol}-1d-10y.json`);
  if (!existsSync(file)) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=10y&interval=1d`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const body = (await response.json()) as {
      chart: { result: { timestamp: number[]; indicators: { quote: { close: (number | null)[] }[]; adjclose?: { adjclose: (number | null)[] }[] } }[] };
    };
    const result = body.chart.result[0];
    const closes = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote[0].close;
    const bars: [number, number][] = [];
    result.timestamp.forEach((seconds, i) => {
      if (closes[i] != null) bars.push([seconds * 1000, closes[i] as number]);
    });
    mkdirSync(YAHOO_CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(bars));
  }
  const bars: [number, number][] = JSON.parse(readFileSync(file, "utf8"));
  return bars.map(([time, close]) => ({ day: Math.floor(time / DAY_MS) * DAY_MS, close }));
}

async function cryptoDaily(coin: string): Promise<Daily> {
  const rows = await binanceCloses(BINANCE_SYMBOLS[coin], Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
  const byDay = new Map<number, number>();
  for (const [time, close] of rows) byDay.set(Math.floor(time / DAY_MS) * DAY_MS, close); // last close of the day
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, close]) => ({ day, close }));
}

/** Value path of both methods over one window; returns final return and worst drop of each. */
function runWindow(prices: Daily, from: number, to: number) {
  const bars = prices.filter((bar) => bar.day >= from && bar.day < to);
  if (bars.length < 200) return null;
  const step = (to - from) / BUYS;
  // lump sum
  const lumpUnits = (1 - COST) / bars[0].close;
  // DCA
  let cash = 1;
  let units = 0;
  let nextBuy = from;
  let bought = 0;
  let peakD = 1;
  let worstD = 0;
  let peakL = 1;
  let worstL = 0;
  for (const bar of bars) {
    while (bought < BUYS && bar.day >= nextBuy) {
      const amount = 1 / BUYS;
      cash -= amount;
      units += (amount * (1 - COST)) / bar.close;
      bought++;
      nextBuy = from + bought * step;
    }
    const valueD = cash + units * bar.close;
    const valueL = lumpUnits * bar.close;
    peakD = Math.max(peakD, valueD);
    worstD = Math.max(worstD, (peakD - valueD) / peakD);
    peakL = Math.max(peakL, valueL);
    worstL = Math.max(worstL, (peakL - valueL) / peakL);
  }
  const last = bars[bars.length - 1].close;
  return { dca: cash + units * last - 1, lump: lumpUnits * last - 1, dropD: worstD, dropL: worstL };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const pct = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(0)}%`;

async function main() {
  const markets: Record<string, Daily> = {};
  for (const coin of CRYPTO) markets[coin] = await cryptoDaily(coin);
  for (const stock of STOCKS) markets[stock] = await yahooDaily(stock);

  console.log("Rolling 12 month windows (monthly starts). Returns on the whole capital; drop = worst fall of cash + holdings.\n");
  console.log("market  windows  DCA median  lump median  DCA beats lump  DCA drop med/worst  lump drop med/worst");
  for (const [name, prices] of Object.entries(markets)) {
    const first = new Date(prices[0].day);
    const results = [];
    for (let y = first.getUTCFullYear(), m = first.getUTCMonth() + 1; ; m++) {
      const from = Date.UTC(y, m, 1);
      const to = Date.UTC(y, m + 12, 1);
      if (to > prices[prices.length - 1].day + DAY_MS) break;
      const r = runWindow(prices, from, to);
      if (r) results.push(r);
    }
    const beats = results.filter((r) => r.dca > r.lump).length / results.length;
    console.log(
      `${name.padEnd(6)}  ${String(results.length).padStart(7)}  ${pct(median(results.map((r) => r.dca))).padStart(10)}  ${pct(median(results.map((r) => r.lump))).padStart(11)}  ${`${(beats * 100).toFixed(0)}%`.padStart(14)}  ${`${pct(median(results.map((r) => r.dropD)))} / ${pct(Math.max(...results.map((r) => r.dropD)))}`.padStart(18)}  ${`${pct(median(results.map((r) => r.dropL)))} / ${pct(Math.max(...results.map((r) => r.dropL)))}`.padStart(19)}`,
    );
  }

  console.log("\nCalendar years, DCA / lump sum:");
  const years = [2021, 2022, 2023, 2024, 2025];
  console.log(`market  ${years.map((y) => String(y).padStart(13)).join("")}`);
  for (const [name, prices] of Object.entries(markets)) {
    const cells = years.map((y) => {
      const r = runWindow(prices, Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1));
      return (r ? `${pct(r.dca)} / ${pct(r.lump)}` : "-").padStart(13);
    });
    console.log(`${name.padEnd(6)}  ${cells.join("")}`);
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
