/**
 * Research only (read-only, never writes to the database): trend filter round on alt perps (2026-11-14).
 * Goal: rules for new Lab perps agents on markets other than BTC and ETH (owner's request), judged by a pass
 * rule fixed BEFORE running (docs/perps-research.md, end of "Hold-out on 2020-2026 spot data").
 *
 * Everything below (grid, split, costs, pass rule) was committed before the first run.
 *
 * Data: Binance spot hourly closes (scripts/binance-history.mts) for the alts that are the same asset as a
 * Lighter perp and have long history: SOL, XRP, NEAR, ZEC. HYPE and LIT are too young for a 6 year test.
 * Window 2020-10-15 to now. Training 2020-10-15 to 2023-12-31 (scored years 2021, 2022, 2023);
 * test 2024-01-01 to now (2024, 2025, 2026 so far). Each coin is its own one-market agent.
 *
 * Grid (128 rules per coin):
 *   gate     N days: 7, 50, 100, 200. Trend is up when price > SMA(N days) x (1 + buffer), down when
 *            price < SMA x (1 - buffer). Only N = 7 fits the engine today (rules look back at most 168 hours).
 *   entry    "gate": long when up. "breakout": long when up AND price crosses above the D high
 *            (D = 20 days, or 72 hours when N = 7); exit also below the D/2 low.
 *   buffer   0, 3%
 *   stop     none, 15% below entry (above entry for a short)
 *   size     100%, 50% of equity
 *   side     long only, long + short (mirror: short when down, or on a D low break; cover when not down)
 * Costs: 0.05% per fill on notional (Lighter cost kept by the engine). Funding: longs pay 10% a year while
 * open, shorts earn nothing (conservative: bull years charge longs). Decisions at each hourly close.
 *
 * Selection on training only: a rule is train-OK on a coin if positive in at least 2 of 2021/2022/2023 and the
 * worst drop over training is under 30%. Rules train-OK on at least 3 of the 4 coins survive; the 3 survivors
 * with the best median training return are locked.
 * Pass rule for a locked rule, fixed in advance, on at least 3 of the 4 coins: positive in at least 4 of the
 * 6 years 2021 to 2026, worst drop over the whole window under 30%, and a positive return over the test period.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-alt-trend.mts
 */
import { BINANCE_FIRST_HOUR, BINANCE_SYMBOLS, binanceCloses, HOUR_MS } from "./binance-history.mts";

const COINS = ["SOL", "XRP", "NEAR", "ZEC"];
const START = Date.UTC(2020, 9, 15);
const TRAIN_END = Date.UTC(2024, 0, 1);
const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
const COST = 0.0005;
const LONG_FUNDING_PER_HOUR = 0.1 / (365 * 24);
const DRAWDOWN_LIMIT = 0.3;

type Rule = {
  gateDays: number;
  entry: "gate" | "breakout";
  buffer: number;
  stop: number | null;
  size: number;
  shorts: boolean;
};
const name = (r: Rule) =>
  `sma${r.gateDays}d ${r.entry} buf${r.buffer * 100}% stop${r.stop ? r.stop * 100 + "%" : "-"} size${r.size * 100}% ${r.shorts ? "long+short" : "long"}`;

const GRID: Rule[] = [];
for (const gateDays of [7, 50, 100, 200])
  for (const entry of ["gate", "breakout"] as const)
    for (const buffer of [0, 0.03])
      for (const stop of [null, 0.15])
        for (const size of [1, 0.5])
          for (const shorts of [false, true]) GRID.push({ gateDays, entry, buffer, stop, size, shorts });

/** Rolling mean / max / min helpers over closes, value at i uses closes up to i (mean) or before i (max/min). */
function rollingMean(closes: number[], window: number): Float64Array {
  const out = new Float64Array(closes.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= window) sum -= closes[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}
/** Highest (or lowest) close of the `window` hours before i, monotonic deque. */
function rollingExtreme(closes: number[], window: number, max: boolean): Float64Array {
  const out = new Float64Array(closes.length).fill(NaN);
  const deque: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    while (deque.length && deque[0] < i - window) deque.shift();
    if (i >= window) out[i] = closes[deque[0]];
    // add i after computing, so out[i] only sees closes before i
    while (deque.length && (max ? closes[deque[deque.length - 1]] <= closes[i] : closes[deque[deque.length - 1]] >= closes[i])) deque.pop();
    deque.push(i);
  }
  return out;
}

type Result = { equity: Float64Array; trades: number };

function run(rule: Rule, closes: number[], firstReal: number, cache: Map<string, Float64Array>): Result {
  const key = (k: string, f: () => Float64Array) => cache.get(k) ?? (cache.set(k, f()), cache.get(k)!);
  const sma = key(`sma${rule.gateDays}`, () => rollingMean(closes, rule.gateDays * 24));
  const d = rule.gateDays === 7 ? 72 : 20 * 24;
  const high = key(`hi${d}`, () => rollingExtreme(closes, d, true));
  const low = key(`lo${d}`, () => rollingExtreme(closes, d, false));
  const halfHigh = key(`hi${d / 2}`, () => rollingExtreme(closes, d / 2, true));
  const halfLow = key(`lo${d / 2}`, () => rollingExtreme(closes, d / 2, false));

  const equity = new Float64Array(closes.length).fill(1);
  let cash = 1;
  let side: 0 | 1 | -1 = 0;
  let quantity = 0; // coins (positive), long or short
  let entry = 0;
  let margin = 0; // cash set aside for a short
  let trades = 0;
  const value = (price: number) => (side === 1 ? cash + quantity * price : side === -1 ? cash + margin + quantity * (entry - price) : cash);

  for (let i = 1; i < closes.length; i++) {
    const price = closes[i];
    // funding on the hour just held
    if (side === 1) cash -= quantity * price * LONG_FUNDING_PER_HOUR;
    // Indicators count only once their whole window is real data (not the back-filled start).
    const ready = i - firstReal >= rule.gateDays * 24 && i - firstReal > d && !Number.isNaN(sma[i]) && !Number.isNaN(high[i]);
    if (ready) {
      const up = price > sma[i] * (1 + rule.buffer);
      const down = price < sma[i] * (1 - rule.buffer);
      const crossedUp = closes[i - 1] <= high[i - 1] && price > high[i];
      const crossedDown = closes[i - 1] >= low[i - 1] && price < low[i];
      // exits
      if (side === 1) {
        const stopHit = rule.stop != null && price <= entry * (1 - rule.stop);
        const exit = rule.entry === "gate" ? !up && (rule.buffer === 0 || down || price < sma[i]) : !up || price < halfLow[i];
        if (stopHit || exit) {
          cash += quantity * price * (1 - COST);
          side = 0;
          quantity = 0;
        }
      } else if (side === -1) {
        const stopHit = rule.stop != null && price >= entry * (1 + rule.stop);
        const exit = rule.entry === "gate" ? !down && (rule.buffer === 0 || up || price > sma[i]) : !down || price > halfHigh[i];
        if (stopHit || exit) {
          cash += margin + quantity * (entry - price) - quantity * price * COST;
          side = 0;
          quantity = 0;
          margin = 0;
        }
      }
      // entries (not in the same hour as an exit of the same side is fine; flat only)
      if (side === 0) {
        const goLong = up && (rule.entry === "gate" || crossedUp);
        const goShort = rule.shorts && down && (rule.entry === "gate" || crossedDown);
        if (goLong || goShort) {
          const notional = cash * rule.size;
          quantity = notional / price;
          cash -= notional * COST;
          entry = price;
          trades++;
          if (goLong) {
            cash -= notional;
            side = 1;
          } else {
            cash -= notional;
            margin = notional;
            side = -1;
          }
        }
      }
    }
    equity[i] = value(price);
  }
  return { equity, trades };
}

function stats(equity: Float64Array, hours: number[], from: number, to: number) {
  const i0 = hours.findIndex((hour) => hour >= from);
  let i1 = hours.findLastIndex((hour) => hour < to);
  if (i0 < 0 || i1 < i0) return null;
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
  // Hours from Binance's first common hour (2020-08-12). A gate only trades once its whole window is real
  // data, so the 100 and 200 day gates start in cash in early 2021 (NEAR's data starts 2020-10-14).
  for (let hour = BINANCE_FIRST_HOUR; hour < now; hour += HOUR_MS) hours.push(hour);
  const closes: Record<string, number[]> = {};
  const firstReal: Record<string, number> = {};
  for (const coin of COINS) {
    const loaded = await loadCoin(coin, hours, now);
    closes[coin] = loaded.closes;
    firstReal[coin] = loaded.firstReal;
  }

  const holdYear = (coin: string, year: number) => {
    const s = stats(Float64Array.from(closes[coin]), hours, Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1));
    return s?.ret ?? 0;
  };

  type Row = { rule: Rule; perCoin: Record<string, { years: number[]; trainDrop: number; trainRet: number; wholeDrop: number; testRet: number; trades: number }> };
  const rows: Row[] = [];
  for (const rule of GRID) {
    const row: Row = { rule, perCoin: {} };
    for (const coin of COINS) {
      const cache = caches.get(coin) ?? (caches.set(coin, new Map()), caches.get(coin)!);
      const { equity, trades } = run(rule, closes[coin], firstReal[coin], cache);
      const years = YEARS.map((year) => stats(equity, hours, Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1))?.ret ?? 0);
      const train = stats(equity, hours, START, TRAIN_END)!;
      const whole = stats(equity, hours, START, now + HOUR_MS)!;
      const test = stats(equity, hours, TRAIN_END, now + HOUR_MS)!;
      row.perCoin[coin] = { years, trainDrop: train.drop, trainRet: train.ret, wholeDrop: whole.drop, testRet: test.ret, trades };
    }
    rows.push(row);
  }

  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];
  const trainOk = (c: Row["perCoin"][string]) => c.years.slice(0, 3).filter((r) => r > 0).length >= 2 && c.trainDrop < DRAWDOWN_LIMIT;
  const survivors = rows.filter((row) => COINS.filter((coin) => trainOk(row.perCoin[coin])).length >= 3);
  survivors.sort((a, b) => median(COINS.map((c) => b.perCoin[c].trainRet)) - median(COINS.map((c) => a.perCoin[c].trainRet)));
  const locked = survivors.slice(0, 3);

  console.log(`Hold by year (${YEARS.join(" / ")}):`);
  for (const coin of COINS) console.log(`  ${coin.padEnd(5)} ${YEARS.map((y) => pct(holdYear(coin, y)).padStart(7)).join("")}`);
  console.log(`\n${GRID.length} rules x ${COINS.length} coins. Train-OK on >= 3 coins: ${survivors.length}.`);
  const engineable = rows.filter((row) => row.rule.gateDays === 7);
  console.log(`  of which 7 day gate (fits the engine today): ${survivors.filter((row) => row.rule.gateDays === 7).length} of ${engineable.length}`);

  const passes = (c: Row["perCoin"][string]) => c.years.filter((r) => r > 0).length >= 4 && c.wholeDrop < DRAWDOWN_LIMIT && c.testRet > 0;
  console.log("\nLocked on training (best median training return), then judged on the pass rule:");
  for (const row of locked) {
    const passed = COINS.filter((coin) => passes(row.perCoin[coin]));
    console.log(`\n  ${name(row.rule)}  -> ${passed.length >= 3 ? "PASS" : "FAIL"} (${passed.length}/4 coins: ${passed.join(" ") || "none"})`);
    for (const coin of COINS) {
      const c = row.perCoin[coin];
      console.log(
        `    ${coin.padEnd(5)} years ${c.years.map((r) => pct(r).padStart(6)).join("")}  worst drop ${pct(c.wholeDrop).padStart(5)}  test ${pct(c.testRet).padStart(6)}  trades ${c.trades}`,
      );
    }
  }

  // Diagnostics (not used to pick): which training gate binds, and a few reference rules.
  const posOk = (c: Row["perCoin"][string]) => c.years.slice(0, 3).filter((r) => r > 0).length >= 2;
  for (const coin of COINS) {
    const cs = rows.map((row) => row.perCoin[coin]);
    console.log(`  diag ${coin.padEnd(5)} train positive>=2/3: ${cs.filter(posOk).length}, train drop<30%: ${cs.filter((c) => c.trainDrop < DRAWDOWN_LIMIT).length}, both: ${cs.filter(trainOk).length}, min train drop ${pct(Math.min(...cs.map((c) => c.trainDrop)))}`);
  }
  for (const row of rows.filter((r) => r.rule.buffer === 0.03 && r.rule.stop === null && r.rule.entry === "gate" && !r.rule.shorts)) {
    console.log(`  ref ${name(row.rule)}`);
    for (const coin of COINS) {
      const c = row.perCoin[coin];
      console.log(`    ${coin.padEnd(5)} years ${c.years.map((r) => pct(r).padStart(6)).join("")}  train drop ${pct(c.trainDrop)}  whole drop ${pct(c.wholeDrop)}  trades ${c.trades}`);
    }
  }

  // Context only (not used to pick): how many of all 128 rules would pass, and the best 7 day gate rule.
  const allPass = rows.filter((row) => COINS.filter((coin) => passes(row.perCoin[coin])).length >= 3);
  console.log(`\nContext, not a selection: rules passing on >= 3 coins over the whole window: ${allPass.length} of ${rows.length}`);
  for (const row of allPass.slice(0, 10)) console.log(`  ${name(row.rule)}`);
}

const caches = new Map<string, Map<string, Float64Array>>();

/** Closes on the hour grid, forward filled; hours before the coin's first bar are back-filled and marked. */
async function loadCoin(coin: string, hours: number[], now: number): Promise<{ closes: number[]; firstReal: number }> {
  const rows = await binanceCloses(BINANCE_SYMBOLS[coin], now);
  const closeAt = new Map<number, number>(rows);
  let last = rows[0][1];
  const firstReal = Math.max(0, hours.findIndex((hour) => hour >= rows[0][0]));
  return { closes: hours.map((hour) => (last = closeAt.get(hour) ?? last)), firstReal };
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
