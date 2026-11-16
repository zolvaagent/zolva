/**
 * Research only (read-only, never writes to the database): round 4, market-flow filters (2026-11-16).
 * Owner asked whether "market-flow triggers (CVD, OI, funding) decide when to act" (Hyper-Alpha-Arena, via
 * @RoundtableSpace) can be tested. Funding is already in the base (round 3). This round adds CVD and open interest
 * as ENTRY filters on the round 3 rule and asks one question: does either make it better?
 *
 * Everything below was committed before the first run.
 *
 * Base (unchanged from round 3, 50 day gate): long when price > SMA(1,200 h) x 1.03, exit below the SMA; short
 * when price < SMA x 0.97 and 7 day funding >= 0, cover above the SMA or when funding turns negative ("f0");
 * 20% volatility target over 720 hours, daily resize when more than 25% off, 15% stop; 0.05% a fill; real funding.
 * Filters (entries only; exits unchanged), from data at or before the decision hour:
 *   cvd  CVD7 = sum over the last 168 hours of (2 x taker buy quote volume - quote volume) / sum of quote volume,
 *        Binance spot hourly klines. A long needs CVD7 > 0 (buyers more aggressive), a short needs CVD7 < 0.
 *   oi   OI7 = open interest (in coins, Binance USDT-M metrics, last 5 minute value of each hour) / the value
 *        168 hours earlier - 1. Any entry needs OI7 > 0 (new positions are opening in the trend's direction).
 *        Hours with no OI data block the filter's entries (none before 2021-12-01 on the alts).
 * Grid: side (long only, long + short f0) x cvd (off, on) x oi (off, on) = 8 rules, baselines included.
 * Scoring window 2022-01-01 to now, because OI starts 2021-12 on the alts: years 2022 to 2026.
 * PASS on a coin: positive in at least 4 of the 5 years, worst drop (2022 to now) under 30%, positive 2024 to now.
 * Decision rule, fixed: a filter is worth adding to the Vol Trend agents only if, for the same side, it passes on
 * at least as many of SOL XRP NEAR ZEC as the baseline, passes on BTC and ETH, AND improves the median (over the
 * 4 alts) of either the 2022-to-now return or the worst drop by at least 2 points without making the other worse
 * by more than 2 points. Otherwise the agents stay as they are.
 *
 *   FLOW_CACHE=... node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-flow.mts   (COINS=BTC,ETH for the check)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BINANCE_FIRST_HOUR, BINANCE_SYMBOLS, binanceCloses, HOUR_MS } from "./binance-history.mts";

const COINS = process.env.COINS ? process.env.COINS.split(",") : ["SOL", "XRP", "NEAR", "ZEC"];
const START = Date.UTC(2022, 0, 1);
const TEST_FROM = Date.UTC(2024, 0, 1);
const YEARS = [2022, 2023, 2024, 2025, 2026];
const FLOW = process.env.FLOW_CACHE ?? join(tmpdir(), "zolva-flow");
const COST = 0.0005;
const DRAWDOWN_LIMIT = 0.3;
const VOL_HOURS = 30 * 24;
const TARGET_VOL = 0.2;
const STOP = 0.15;
const CACHE = process.env.FUNDING_CACHE ?? join(tmpdir(), "zolva-binance-funding");

type Rule = { shorts: boolean; cvd: boolean; oi: boolean };
const name = (r: Rule) => `${r.shorts ? "long+short(f0)" : "long only"}${r.cvd ? " +cvd" : ""}${r.oi ? " +oi" : ""}`;
const GRID: Rule[] = [];
for (const shorts of [false, true]) for (const cvd of [false, true]) for (const oi of [false, true]) GRID.push({ shorts, cvd, oi });

/** [funding time ms, rate] since BINANCE_FIRST_HOUR, cached per symbol. */
async function fundingHistory(symbol: string, until: number): Promise<[number, number][]> {
  const file = join(CACHE, `${symbol}-funding.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const rows: [number, number][] = [];
  for (let from = BINANCE_FIRST_HOUR - 30 * 24 * HOUR_MS; from < until; ) {
    const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&startTime=${from}&endTime=${until}&limit=1000`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const page = (await response.json()) as { fundingTime: number; fundingRate: string }[];
    if (!page.length) break;
    for (const row of page) rows.push([row.fundingTime, Number(row.fundingRate)]);
    from = page[page.length - 1].fundingTime + 1;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(rows));
  return rows;
}

function rollingMean(values: number[], window: number): Float64Array {
  const out = new Float64Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}
/** Highest (or lowest) close of the `window` hours before i. */
function rollingExtreme(closes: number[], window: number, max: boolean): Float64Array {
  const out = new Float64Array(closes.length).fill(NaN);
  const deque: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    while (deque.length && deque[0] < i - window) deque.shift();
    if (i >= window) out[i] = closes[deque[0]];
    while (deque.length && (max ? closes[deque[deque.length - 1]] <= closes[i] : closes[deque[deque.length - 1]] >= closes[i])) deque.pop();
    deque.push(i);
  }
  return out;
}
/** Annualised volatility of hourly log returns over the `window` hours up to i. */
function rollingVol(closes: number[], window: number): Float64Array {
  const returns = closes.map((close, i) => (i ? Math.log(close / closes[i - 1]) : 0));
  const mean = rollingMean(returns, window);
  const meanSq = rollingMean(returns.map((r) => r * r), window);
  return mean.map((m, i) => Math.sqrt(Math.max(0, meanSq[i] - m * m) * 8760));
}

type Market = { closes: number[]; funding: number[]; firstReal: number; cvd7: Float64Array; oi7: Float64Array };

function run(rule: Rule, market: Market): { equity: Float64Array; trades: number } {
  const { closes, funding, firstReal, cvd7, oi7 } = market;
  const gateHours = 50 * 24;
  const sma = rollingMean(closes, gateHours);
  const vol = rollingVol(closes, VOL_HOURS);
  const f7 = rollingMean(funding, 168).map((m) => m * 168 * (365 / 7));
  const wanted = (i: number) => Math.min(1, TARGET_VOL / vol[i]);

  const equity = new Float64Array(closes.length).fill(1);
  let cash = 1;
  let side: 0 | 1 | -1 = 0;
  let quantity = 0;
  let entry = 0;
  let stopRef = 0;
  let margin = 0;
  let trades = 0;
  const value = (price: number) => (side === 1 ? cash + quantity * price : side === -1 ? cash + margin + quantity * (entry - price) : cash);

  for (let i = 1; i < closes.length; i++) {
    const price = closes[i];
    // real funding paid at this hour on the position held into it
    if (funding[i] !== 0 && side !== 0) cash -= side * quantity * price * funding[i];
    const ready = i - firstReal > Math.max(gateHours, VOL_HOURS, 168) && vol[i] > 0;
    if (ready) {
      const up = price > sma[i] * 1.03;
      const down = price < sma[i] * 0.97;
      const shortAllowed = rule.shorts && f7[i] >= 0;
      // flow filters (entries only); NaN (no data) blocks the filter's entries
      const oiOk = !rule.oi || oi7[i] > 0;
      const cvdLong = !rule.cvd || cvd7[i] > 0;
      const cvdShort = !rule.cvd || cvd7[i] < 0;
      if (side === 1) {
        const exit = price < sma[i];
        if (price <= stopRef * (1 - STOP) || exit) {
          cash += quantity * price * (1 - COST);
          side = 0;
          quantity = 0;
        }
      } else if (side === -1) {
        const exit = price > sma[i];
        if (price >= stopRef * (1 + STOP) || exit || !shortAllowed) {
          cash += margin + quantity * (entry - price) - quantity * price * COST;
          side = 0;
          quantity = 0;
          margin = 0;
        }
      }
      if (side === 0) {
        const goLong = up && oiOk && cvdLong;
        const goShort = shortAllowed && down && oiOk && cvdShort;
        if (goLong || goShort) {
          const notional = cash * wanted(i);
          quantity = notional / price;
          cash -= notional * (1 + COST);
          entry = price;
          stopRef = price;
          trades++;
          side = goLong ? 1 : -1;
          if (goShort) margin = notional;
        }
      }
      // daily resize toward the volatility target (stop keeps the first entry)
      if (side !== 0 && Math.floor(i % 24) === 0) {
        const target = value(price) * wanted(i);
        if (Math.abs(quantity * price - target) > 0.25 * target) {
          const newQuantity = target / price;
          if (side === 1) cash -= (newQuantity - quantity) * price;
          else {
            cash += margin + quantity * (entry - price);
            margin = newQuantity * price;
            cash -= margin;
            entry = price;
          }
          cash -= Math.abs(newQuantity - quantity) * price * COST;
          quantity = newQuantity;
        }
      }
    }
    equity[i] = value(price);
  }
  return { equity, trades };
}

function stats(equity: ArrayLike<number>, hours: number[], from: number, to: number) {
  const i0 = hours.findIndex((hour) => hour >= from);
  const i1 = hours.findLastIndex((hour) => hour < to);
  if (i0 < 0 || i1 < i0) return { ret: 0, drop: 0 };
  const start = i0 > 0 ? equity[i0 - 1] : equity[i0];
  let peak = start;
  let worst = 0;
  for (let i = i0; i <= i1; i++) {
    peak = Math.max(peak, equity[i]);
    worst = Math.max(worst, (peak - equity[i]) / peak);
  }
  return { ret: equity[i1] / start - 1, drop: worst };
}

const pct = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(0)}%`;

async function main() {
  const now = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const hours: number[] = [];
  for (let hour = BINANCE_FIRST_HOUR; hour < now; hour += HOUR_MS) hours.push(hour);
  const markets: Record<string, Market> = {};
  for (const coin of COINS) {
    const rows = await binanceCloses(BINANCE_SYMBOLS[coin], now);
    const closeAt = new Map<number, number>(rows);
    let last = rows[0][1];
    const closes = hours.map((hour) => (last = closeAt.get(hour) ?? last));
    const firstReal = Math.max(0, hours.findIndex((hour) => hour >= rows[0][0]));
    // Funding events land on the hour they are paid (fundingTime rounded down to the hour).
    const byHour = new Map<number, number>();
    for (const [time, rate] of await fundingHistory(BINANCE_SYMBOLS[coin], now)) {
      const hour = Math.floor(time / HOUR_MS) * HOUR_MS;
      byHour.set(hour, (byHour.get(hour) ?? 0) + rate);
    }
    // CVD7 from spot klines: [hour, quote volume, taker buy quote volume]
    const cvdRows: [number, number, number][] = JSON.parse(readFileSync(join(FLOW, `${coin}-cvd.json`), "utf8"));
    const cvdAt = new Map(cvdRows.map(([h, q, b]) => [h, [q, b] as const]));
    const delta = hours.map((h) => {
      const v = cvdAt.get(h);
      return v ? 2 * v[1] - v[0] : 0;
    });
    const quote = hours.map((h) => cvdAt.get(h)?.[0] ?? 0);
    const dSum = rollingMean(delta, 168);
    const qSum = rollingMean(quote, 168);
    const cvd7 = dSum.map((d, i) => (qSum[i] > 0 ? d / qSum[i] : NaN));
    // OI7 from futures metrics: [hour, open interest in coins]; missing hours stay NaN
    const oiRows: [number, number][] = JSON.parse(readFileSync(join(FLOW, `${coin}-oi.json`), "utf8"));
    const oiAt = new Map(oiRows);
    const oi7 = Float64Array.from(hours, (h) => {
      const now7 = oiAt.get(h);
      const before = oiAt.get(h - 168 * HOUR_MS);
      return now7 != null && before != null && before > 0 ? now7 / before - 1 : NaN;
    });
    markets[coin] = { closes, funding: hours.map((hour) => byHour.get(hour) ?? 0), firstReal, cvd7, oi7 };
    const firstOi = oiRows.length ? new Date(oiRows[0][0]).toISOString().slice(0, 10) : "none";
    const cvdShare = YEARS.map((y) => {
      const idx = hours.map((h, i) => [h, i] as const).filter(([h]) => new Date(h).getUTCFullYear() === y);
      return idx.filter(([, i]) => cvd7[i] > 0).length / Math.max(1, idx.length);
    });
    console.log(`${coin.padEnd(5)} OI from ${firstOi}; share of hours with CVD7 > 0 by year ${cvdShare.map((v) => (v * 100).toFixed(0).padStart(4) + "%").join("")}`);
  }

  type Coin = { years: number[]; ret: number; drop: number; testRet: number; last30: number; trades: number };
  const rows = GRID.map((rule) => {
    const perCoin: Record<string, Coin> = {};
    for (const coin of COINS) {
      const { equity, trades } = run(rule, markets[coin]);
      const whole = stats(equity, hours, START, now + HOUR_MS);
      perCoin[coin] = {
        years: YEARS.map((y) => stats(equity, hours, Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1)).ret),
        ret: whole.ret,
        drop: whole.drop,
        testRet: stats(equity, hours, TEST_FROM, now + HOUR_MS).ret,
        last30: stats(equity, hours, now - 30 * 24 * HOUR_MS, now + HOUR_MS).ret,
        trades,
      };
    }
    return { rule, perCoin };
  });

  const passes = (c: Coin) => c.years.filter((r) => r > 0).length >= 4 && c.drop < DRAWDOWN_LIMIT && c.testRet > 0;
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  };
  console.log(`
Scoring 2022-01-01 to now. Years ${YEARS.join(" / ")}.`);
  for (const row of rows) {
    const passed = COINS.filter((coin) => passes(row.perCoin[coin]));
    const medRet = median(COINS.map((c) => row.perCoin[c].ret));
    const medDrop = median(COINS.map((c) => row.perCoin[c].drop));
    console.log(`
${name(row.rule)}  -> passes on ${passed.length}/${COINS.length} (${passed.join(" ") || "none"})  median return ${pct(medRet)}  median drop ${pct(medDrop)}`);
    for (const coin of COINS) {
      const c = row.perCoin[coin];
      console.log(`    ${coin.padEnd(5)} ${c.years.map((r) => pct(r).padStart(6)).join("")}  whole ${pct(c.ret).padStart(5)}  drop ${pct(c.drop).padStart(4)}  test ${pct(c.testRet).padStart(5)}  last30d ${pct(c.last30).padStart(4)}  entries ${c.trades}`);
    }
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
