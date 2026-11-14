/**
 * Research only (read-only, never writes to the database): round 3, funding as an input (2026-11-14).
 * Base = the two rules that passed round 2 (scripts/research-alt-volsize.mts), unchanged:
 *   A  "gate":     long when price > SMA(50 days) x 1.03, exit below SMA(50 days)
 *   B  "breakout": long when price crosses the 72 hour high while price > SMA(7 days) x 1.03, exit below the
 *                  36 hour low or when the gate turns
 *   both: 20% volatility target (30 day realised), daily resize when more than 25% off, 15% stop.
 * New in this round, fixed before the first run:
 *   - REAL funding replaces the 10% a year assumption: Binance USDT-margined perp funding every 8 hours
 *     (fapi /fundingRate, free, no key). A long pays the rate x notional, a short receives it (negative: reverse).
 *   - Funding filters, from the 7 day average funding f7 (annualised: sum of the last 168 hours x 365 / 7):
 *       longCap   none, 30%, 50%: no new long and exit a long while f7 > cap (crowded longs)
 *       shorts    none (long only); "any": short when the trend is down (price < SMA x 0.97, or the 72 hour low
 *                 break for B), cover when it is not; "f0": same but only while f7 >= 0; "f10": only while
 *                 f7 >= 10% (shorts are paid and longs are crowded, not a short squeeze setup)
 *   2 bases x 3 longCap x 4 shorts = 24 rules per coin.
 * Same coins, split, cost (0.05% a fill) and pass rule as rounds 1 and 2. Selection on SOL XRP NEAR ZEC
 * training (2020-10-15 to 2023): train-OK = positive in 2 of 3 years and drop under 30%, on 3 of 4 coins;
 * lock the 3 best by median training return. PASS on 3 of 4: positive in 4 of 6 years (2021 to 2026), worst
 * drop under 30%, positive test (2024 to now). BTC and ETH are a check only (COINS=BTC,ETH).
 * Questions this answers: does real funding change round 2's verdict; does a funding filter fix the alt
 * long + short drop that failed round 2; does a crowded-long cap help.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-alt-funding.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BINANCE_FIRST_HOUR, BINANCE_SYMBOLS, binanceCloses, HOUR_MS } from "./binance-history.mts";

const COINS = process.env.COINS ? process.env.COINS.split(",") : ["SOL", "XRP", "NEAR", "ZEC"];
const START = Date.UTC(2020, 9, 15);
const TRAIN_END = Date.UTC(2024, 0, 1);
const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
const COST = 0.0005;
const DRAWDOWN_LIMIT = 0.3;
const VOL_HOURS = 30 * 24;
const TARGET_VOL = 0.2;
const STOP = 0.15;
const CACHE = process.env.FUNDING_CACHE ?? join(tmpdir(), "zolva-binance-funding");

type Rule = { base: "gate" | "breakout"; longCap: number | null; shorts: "none" | "any" | "f0" | "f10" };
const name = (r: Rule) => `${r.base} longCap${r.longCap == null ? "-" : r.longCap * 100 + "%"} shorts:${r.shorts}`;
const GRID: Rule[] = [];
for (const base of ["gate", "breakout"] as const)
  for (const longCap of [null, 0.3, 0.5])
    for (const shorts of ["none", "any", "f0", "f10"] as const) GRID.push({ base, longCap, shorts });

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

type Market = { closes: number[]; funding: number[]; firstReal: number };

function run(rule: Rule, market: Market): { equity: Float64Array; trades: number } {
  const { closes, funding, firstReal } = market;
  const gateHours = rule.base === "gate" ? 50 * 24 : 7 * 24;
  const sma = rollingMean(closes, gateHours);
  const high = rollingExtreme(closes, 72, true);
  const low = rollingExtreme(closes, 72, false);
  const low36 = rollingExtreme(closes, 36, false);
  const high36 = rollingExtreme(closes, 36, true);
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
      const crowded = rule.longCap != null && f7[i] > rule.longCap;
      const shortAllowed = rule.shorts === "any" || (rule.shorts === "f0" && f7[i] >= 0) || (rule.shorts === "f10" && f7[i] >= 0.1);
      const crossedUp = closes[i - 1] <= high[i - 1] && price > high[i];
      const crossedDown = closes[i - 1] >= low[i - 1] && price < low[i];
      if (side === 1) {
        const exit = rule.base === "gate" ? price < sma[i] : !up || price < low36[i];
        if (price <= stopRef * (1 - STOP) || exit || crowded) {
          cash += quantity * price * (1 - COST);
          side = 0;
          quantity = 0;
        }
      } else if (side === -1) {
        const exit = rule.base === "gate" ? price > sma[i] : !down || price > high36[i];
        if (price >= stopRef * (1 + STOP) || exit || !shortAllowed) {
          cash += margin + quantity * (entry - price) - quantity * price * COST;
          side = 0;
          quantity = 0;
          margin = 0;
        }
      }
      if (side === 0) {
        const goLong = up && !crowded && (rule.base === "gate" || crossedUp);
        const goShort = rule.shorts !== "none" && shortAllowed && down && (rule.base === "gate" || crossedDown);
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
    markets[coin] = { closes, funding: hours.map((hour) => byHour.get(hour) ?? 0), firstReal };
    const f = [...byHour.entries()].filter(([h]) => h >= START);
    const yearly = YEARS.map((y) => f.filter(([h]) => new Date(h).getUTCFullYear() === y).reduce((s, [, r]) => s + r, 0));
    console.log(`${coin.padEnd(5)} funding paid by longs per year ${yearly.map((v) => pct(v).padStart(6)).join("")}`);
  }

  type Coin = { years: number[]; trainRet: number; trainDrop: number; wholeDrop: number; testRet: number; last30: number; trades: number };
  const rows = GRID.map((rule) => {
    const perCoin: Record<string, Coin> = {};
    for (const coin of COINS) {
      const { equity, trades } = run(rule, markets[coin]);
      const train = stats(equity, hours, START, TRAIN_END);
      perCoin[coin] = {
        years: YEARS.map((y) => stats(equity, hours, Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1)).ret),
        trainRet: train.ret,
        trainDrop: train.drop,
        wholeDrop: stats(equity, hours, START, now + HOUR_MS).drop,
        testRet: stats(equity, hours, TRAIN_END, now + HOUR_MS).ret,
        last30: stats(equity, hours, now - 30 * 24 * HOUR_MS, now + HOUR_MS).ret,
        trades,
      };
    }
    return { rule, perCoin };
  });

  const trainOk = (c: Coin) => c.years.slice(0, 3).filter((r) => r > 0).length >= 2 && c.trainDrop < DRAWDOWN_LIMIT;
  const passes = (c: Coin) => c.years.filter((r) => r > 0).length >= 4 && c.wholeDrop < DRAWDOWN_LIMIT && c.testRet > 0;
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];
  const need = Math.min(3, COINS.length);
  const survivors = rows.filter((row) => COINS.filter((coin) => trainOk(row.perCoin[coin])).length >= need);
  survivors.sort((a, b) => median(COINS.map((c) => b.perCoin[c].trainRet)) - median(COINS.map((c) => a.perCoin[c].trainRet)));
  const locked = new Set(survivors.slice(0, 3));

  console.log(`\n${GRID.length} rules x ${COINS.length} coins, train-OK on >= ${need}: ${survivors.length}. All rules (locked marked *):`);
  for (const row of rows) {
    const passed = COINS.filter((coin) => passes(row.perCoin[coin]));
    console.log(`\n${locked.has(row) ? "*" : " "} ${name(row.rule)}  -> passes on ${passed.length}/${COINS.length}${locked.has(row) ? (passed.length >= need ? "  PASS" : "  FAIL") : ""}`);
    for (const coin of COINS) {
      const c = row.perCoin[coin];
      console.log(`    ${coin.padEnd(5)} ${c.years.map((r) => pct(r).padStart(6)).join("")}  drop ${pct(c.wholeDrop).padStart(4)}  test ${pct(c.testRet).padStart(5)}  last30d ${pct(c.last30).padStart(4)}  trades ${c.trades}`);
    }
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
