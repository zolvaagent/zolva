/**
 * Research only (read-only, never writes to the database): round 2 on alt perps, volatility sized trend
 * filter (2026-11-14). Round 1 (scripts/research-alt-trend.mts) failed on the 30% drop limit only, so this
 * round changes one thing: the position size comes from recent volatility instead of a fixed share.
 *
 * Everything below (grid, split, costs, pass rule) was committed before the first run.
 *
 * Same data, coins, split, costs and pass rule as round 1: Binance spot hourly closes for SOL, XRP, NEAR, ZEC,
 * training 2020-10-15 to 2023-12-31, test 2024-01-01 to now, 0.05% a fill, longs pay 10% a year funding,
 * shorts earn nothing.
 *
 * Grid (256 rules per coin): the round 1 axes (gate N = 7, 50, 100, 200 days; entry gate or breakout;
 * buffer 0 or 3%; stop none or 15%; long only or long + short), with the fixed size replaced by:
 *   target   annual volatility 20% or 40%. Size = min(100%, target / realised volatility), realised =
 *            standard deviation of the last 30 days of hourly returns x sqrt(8760).
 *   resize   at entry only, or once a day (00:00 UTC) when the wanted size is more than 25% away from the
 *            held size (cost paid on the change; the stop stays at the first entry price).
 * Selection and pass rule exactly as round 1: train-OK = positive in at least 2 of 2021/2022/2023 and training
 * drop under 30%, on at least 3 of 4 coins; lock the 3 with the best median training return. PASS on at least
 * 3 of 4 coins = positive in at least 4 of the 6 years 2021 to 2026, worst drop under 30%, positive test return.
 * Neither a 30 day volatility nor a gate longer than 7 days fits the engine today (it would need an engine
 * change by Development, engine and prototype together).
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-alt-volsize.mts
 */
import { BINANCE_FIRST_HOUR, BINANCE_SYMBOLS, binanceCloses, HOUR_MS } from "./binance-history.mts";

/** Checks only, never for selection: COINS=BTC,ETH (unseen coins), COST, FUNDING (a year, longs). */
const COINS = process.env.COINS ? process.env.COINS.split(",") : ["SOL", "XRP", "NEAR", "ZEC"];
const START = Date.UTC(2020, 9, 15);
const TRAIN_END = Date.UTC(2024, 0, 1);
const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
const COST = Number(process.env.COST ?? 0.0005);
const LONG_FUNDING_PER_HOUR = Number(process.env.FUNDING ?? 0.1) / (365 * 24);
const DRAWDOWN_LIMIT = 0.3;
const VOL_HOURS = 30 * 24;

type Rule = {
  gateDays: number;
  entry: "gate" | "breakout";
  buffer: number;
  stop: number | null;
  targetVol: number;
  resize: "entry" | "daily";
  shorts: boolean;
};
const name = (r: Rule) =>
  `sma${r.gateDays}d ${r.entry} buf${r.buffer * 100}% stop${r.stop ? r.stop * 100 + "%" : "-"} vol${r.targetVol * 100}% ${r.resize} ${r.shorts ? "long+short" : "long"}`;

const GRID: Rule[] = [];
for (const gateDays of [7, 50, 100, 200])
  for (const entry of ["gate", "breakout"] as const)
    for (const buffer of [0, 0.03])
      for (const stop of [null, 0.15])
        for (const targetVol of [0.2, 0.4])
          for (const resize of ["entry", "daily"] as const)
            for (const shorts of [false, true]) GRID.push({ gateDays, entry, buffer, stop, targetVol, resize, shorts });

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

/** Annualised volatility of hourly returns over the `window` hours up to i. */
function rollingVol(closes: number[], window: number): Float64Array {
  const out = new Float64Array(closes.length).fill(NaN);
  let sum = 0;
  let sumSq = 0;
  const ret = (i: number) => Math.log(closes[i] / closes[i - 1]);
  for (let i = 1; i < closes.length; i++) {
    const r = ret(i);
    sum += r;
    sumSq += r * r;
    if (i > window) {
      const old = ret(i - window);
      sum -= old;
      sumSq -= old * old;
    }
    if (i >= window) {
      const mean = sum / window;
      out[i] = Math.sqrt(Math.max(0, sumSq / window - mean * mean) * 8760);
    }
  }
  return out;
}

type Result = { equity: Float64Array; trades: number };

function run(rule: Rule, closes: number[], firstReal: number, hours0: number, cache: Map<string, Float64Array>): Result {
  const key = (k: string, f: () => Float64Array) => cache.get(k) ?? (cache.set(k, f()), cache.get(k)!);
  const sma = key(`sma${rule.gateDays}`, () => rollingMean(closes, rule.gateDays * 24));
  const d = rule.gateDays === 7 ? 72 : 20 * 24;
  const high = key(`hi${d}`, () => rollingExtreme(closes, d, true));
  const low = key(`lo${d}`, () => rollingExtreme(closes, d, false));
  const halfHigh = key(`hi${d / 2}`, () => rollingExtreme(closes, d / 2, true));
  const halfLow = key(`lo${d / 2}`, () => rollingExtreme(closes, d / 2, false));
  const vol = key("vol720", () => rollingVol(closes, VOL_HOURS));
  const wanted = (i: number) => Math.min(1, rule.targetVol / vol[i]);

  const equity = new Float64Array(closes.length).fill(1);
  let cash = 1;
  let side: 0 | 1 | -1 = 0;
  let quantity = 0; // coins (positive), long or short
  let entry = 0; // entry price of the open position (P&L basis for a short)
  let stopRef = 0; // first entry price, for the stop
  let margin = 0; // cash set aside for a short
  let trades = 0;
  const value = (price: number) => (side === 1 ? cash + quantity * price : side === -1 ? cash + margin + quantity * (entry - price) : cash);

  for (let i = 1; i < closes.length; i++) {
    const price = closes[i];
    // funding on the hour just held
    if (side === 1) cash -= quantity * price * LONG_FUNDING_PER_HOUR;
    // Indicators count only once their whole window is real data (not the back-filled start).
    const ready =
      i - firstReal >= rule.gateDays * 24 && i - firstReal > d && i - firstReal > VOL_HOURS && !Number.isNaN(sma[i]) && !Number.isNaN(high[i]) && vol[i] > 0;
    if (ready) {
      const up = price > sma[i] * (1 + rule.buffer);
      const down = price < sma[i] * (1 - rule.buffer);
      const crossedUp = closes[i - 1] <= high[i - 1] && price > high[i];
      const crossedDown = closes[i - 1] >= low[i - 1] && price < low[i];
      // exits
      if (side === 1) {
        const stopHit = rule.stop != null && price <= stopRef * (1 - rule.stop);
        const exit = rule.entry === "gate" ? !up && (rule.buffer === 0 || down || price < sma[i]) : !up || price < halfLow[i];
        if (stopHit || exit) {
          cash += quantity * price * (1 - COST);
          side = 0;
          quantity = 0;
        }
      } else if (side === -1) {
        const stopHit = rule.stop != null && price >= stopRef * (1 + rule.stop);
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
          const notional = cash * wanted(i);
          quantity = notional / price;
          cash -= notional * COST;
          entry = price;
          stopRef = price;
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
      // daily resize of an open position toward the volatility target
      if (side !== 0 && rule.resize === "daily" && Math.floor(hours0 / HOUR_MS + i) % 24 === 0) {
        const total = value(price);
        const target = total * wanted(i);
        const held = quantity * price;
        if (Math.abs(held - target) > 0.25 * target) {
          const newQuantity = target / price;
          if (side === 1) {
            cash -= (newQuantity - quantity) * price;
          } else {
            // close the short at this price and reopen at the new size (stop stays at stopRef)
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
      const { equity, trades } = run(rule, closes[coin], firstReal[coin], hours[0], cache);
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

  // SHOW="<rule name>" prints that rule on the chosen coins (checks only, e.g. COINS=BTC,ETH).
  for (const row of rows.filter((r) => process.env.SHOW && name(r.rule) === process.env.SHOW)) {
    console.log(`  show ${name(row.rule)}`);
    for (const coin of COINS) {
      const c = row.perCoin[coin];
      console.log(`    ${coin.padEnd(5)} years ${c.years.map((r) => pct(r).padStart(6)).join("")}  worst drop ${pct(c.wholeDrop)}  test ${pct(c.testRet)}  trades ${c.trades}`);
    }
  }

  // Diagnostics (not used to pick): which training gate binds, and a few reference rules.
  const posOk = (c: Row["perCoin"][string]) => c.years.slice(0, 3).filter((r) => r > 0).length >= 2;
  for (const coin of COINS) {
    const cs = rows.map((row) => row.perCoin[coin]);
    console.log(`  diag ${coin.padEnd(5)} train positive>=2/3: ${cs.filter(posOk).length}, train drop<30%: ${cs.filter((c) => c.trainDrop < DRAWDOWN_LIMIT).length}, both: ${cs.filter(trainOk).length}, min train drop ${pct(Math.min(...cs.map((c) => c.trainDrop)))}`);
  }
  for (const row of rows.filter((r) => r.rule.buffer === 0.03 && r.rule.stop === null && r.rule.entry === "gate" && !r.rule.shorts && r.rule.resize === "daily")) {
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
