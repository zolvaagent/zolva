/**
 * Research only (read-only, public data, no database): short-term "scalp" rules on perps, with leverage (round 2;
 * round 1 was docs/scalping-research.md, 1 minute pool prices over 14 days, no edge)
 * (2026-11-25, owner: "actually we need to scalping maybe. a bit aggresive strategy, not hold too long" and
 * "also can use leverage"). Venue in mind: Lighter perps (no trading fee), so the cost is slippage only.
 *
 * Everything below (data, rules, grid, fills, costs, split, pass rule) was fixed before the first run.
 *
 * Data: Binance USDT-margined perp 1 minute klines (data.binance.vision monthly files, free), folded into 5 minute
 *   bars (open, high, low, close, volume, quote volume). 2022-01 to the last full month.
 *   Fit coins (selection): SOL, XRP. Unseen check only: COINS=BTC,ETH.
 * Signals on a 5 minute close; entries fill at the next bar's open. Stops and targets fill inside a bar at their
 *   level when the bar's high/low reaches it (at the open if the bar opens beyond it); when a bar reaches both,
 *   the stop counts first. One position at a time per coin.
 * Rules (16):
 *   MR   Bollinger(20 bars, k): long when close < lower band, short when close > upper band (or long only);
 *        exit at the 20 bar average, stop s from entry, time stop 48 bars (4 h).
 *        k 2 or 2.5 x s 1% or 2% x long only / long + short = 8.
 *   BO   Range breakout: long when close > highest high of the previous N bars, short when close < lowest low;
 *        stop s from entry, target 2s. N 12 (1 h) or 48 (4 h) x s 0.5% or 1% = 4.
 *   RSI2 RSI(2) on closes with a 200 bar average as trend filter: long when RSI2 < a and close > average; short
 *        (long + short variant) when RSI2 > 100 - a and close < average; exit when RSI2 crosses 70 (30 for shorts),
 *        stop 2%, time stop 48 bars. a 5 or 10 x long only / long + short = 4.
 * Leverage: position notional = equity x LEV, LEV 1, 2, 3. Liquidation when the account value at a bar's worst
 *   price falls to 5% of the notional: the position closes there.
 * Costs: 0.03% a fill (slippage; Lighter charges no fee). Check: COST=0.0006. Funding is ignored (holds are hours).
 * Split and pass rule: training 2022-2023, test 2024 to now. train-OK = positive in both 2022 and 2023 with a
 *   training drop under 30%, on both fit coins; lock the 3 train-OK rule x leverage pairs with the best median
 *   training return. A locked pair PASSES on a coin when: positive in at least 4 of the 5 years 2022-2026, worst
 *   drop under 30%, positive test return. PASS = both fit coins. Then reported on BTC/ETH and at 2x costs.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-scalp-lev.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

const COINS = process.env.COINS ? process.env.COINS.split(",") : ["SOL", "XRP"];
const COST = Number(process.env.COST ?? 0.0003);
const CACHE = process.env.SCALP_CACHE ?? join(tmpdir(), "zolva-scalp");
const FIRST_MONTH = Date.UTC(2022, 0, 1);
const TRAIN_END = Date.UTC(2024, 0, 1);
const YEARS = [2022, 2023, 2024, 2025, 2026];
const MAINTENANCE = 0.05;
const BAR = 5 * 60_000;

type Bars = { t: Float64Array; o: Float64Array; h: Float64Array; l: Float64Array; c: Float64Array };

/** One single-file zip from data.binance.vision, as text. */
function unzip(zip: Buffer): string {
  const nameLength = zip.readUInt16LE(26);
  const extraLength = zip.readUInt16LE(28);
  const cd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const size = zip.readUInt32LE(cd + 20);
  const start = 30 + nameLength + extraLength;
  const body = zip.subarray(start, start + size);
  return (zip.readUInt16LE(8) === 8 ? inflateRawSync(body) : body).toString("utf8");
}

/** 5 minute bars for a coin, cached as JSON arrays. */
async function bars(coin: string): Promise<Bars> {
  const file = join(CACHE, `${coin}-5m.json`);
  if (!existsSync(file)) {
    const t: number[] = [], o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [];
    const now = new Date();
    for (let y = 2022, m = 0; Date.UTC(y, m + 1, 1) <= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1); m === 11 ? (y++, (m = 0)) : m++) {
      const month = `${y}-${String(m + 1).padStart(2, "0")}`;
      const url = `https://data.binance.vision/data/futures/um/monthly/klines/${coin}USDT/1m/${coin}USDT-1m-${month}.zip`;
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (response.status === 404) continue;
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const text = unzip(Buffer.from(await response.arrayBuffer()));
      for (const line of text.split(String.fromCharCode(10))) {
        const cols = line.split(",");
        if (!/^[0-9]+$/.test(cols[0] ?? "")) continue; // header or empty line
        const time = Number(cols[0]);
        const slot = Math.floor(time / BAR) * BAR;
        const [open, high, low, close] = [Number(cols[1]), Number(cols[2]), Number(cols[3]), Number(cols[4])];
        if (t.length && t[t.length - 1] === slot) {
          const k = t.length - 1;
          h[k] = Math.max(h[k], high);
          l[k] = Math.min(l[k], low);
          c[k] = close;
        } else {
          t.push(slot);
          o.push(open);
          h.push(high);
          l.push(low);
          c.push(close);
        }
      }
      console.log(`  ${coin} ${month}: ${t.length} bars`);
    }
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify({ t, o, h, l, c }));
  }
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<keyof Bars, number[]>;
  return { t: Float64Array.from(raw.t), o: Float64Array.from(raw.o), h: Float64Array.from(raw.h), l: Float64Array.from(raw.l), c: Float64Array.from(raw.c) };
}

type Rule =
  | { kind: "MR"; k: number; stop: number; shorts: boolean }
  | { kind: "BO"; n: number; stop: number }
  | { kind: "RSI2"; a: number; shorts: boolean };
const label = (r: Rule) =>
  r.kind === "MR" ? `MR k${r.k} stop${r.stop * 100}% ${r.shorts ? "L+S" : "long"}` : r.kind === "BO" ? `BO ${r.n * 5}m stop${r.stop * 100}% tgt${r.stop * 200}%` : `RSI2 a${r.a} ${r.shorts ? "L+S" : "long"}`;
const RULES: Rule[] = [];
for (const k of [2, 2.5]) for (const stop of [0.01, 0.02]) for (const shorts of [false, true]) RULES.push({ kind: "MR", k, stop, shorts });
for (const n of [12, 48]) for (const stop of [0.005, 0.01]) RULES.push({ kind: "BO", n, stop });
for (const a of [5, 10]) for (const shorts of [false, true]) RULES.push({ kind: "RSI2", a, shorts });
const LEVERAGES = [1, 2, 3];

function mean(values: Float64Array, window: number): Float64Array {
  const out = new Float64Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}
function deviation(values: Float64Array, window: number, avg: Float64Array): Float64Array {
  const out = new Float64Array(values.length).fill(NaN);
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    sumSq += values[i] * values[i];
    if (i >= window) sumSq -= values[i - window] * values[i - window];
    if (i >= window - 1) out[i] = Math.sqrt(Math.max(0, sumSq / window - avg[i] * avg[i]));
  }
  return out;
}
function rsi2(c: Float64Array): Float64Array {
  const out = new Float64Array(c.length).fill(NaN);
  let up = 0, down = 0;
  for (let i = 1; i < c.length; i++) {
    const change = c[i] - c[i - 1];
    // Wilder smoothing with period 2.
    up = (up * 1 + Math.max(0, change)) / 2;
    down = (down * 1 + Math.max(0, -change)) / 2;
    if (i >= 3) out[i] = down === 0 ? 100 : 100 - 100 / (1 + up / down);
  }
  return out;
}
function rollingHigh(h: Float64Array, n: number): Float64Array {
  const out = new Float64Array(h.length).fill(NaN);
  for (let i = n; i < h.length; i++) {
    let m = -Infinity;
    for (let j = i - n; j < i; j++) m = Math.max(m, h[j]);
    out[i] = m;
  }
  return out;
}
function rollingLow(l: Float64Array, n: number): Float64Array {
  const out = new Float64Array(l.length).fill(NaN);
  for (let i = n; i < l.length; i++) {
    let m = Infinity;
    for (let j = i - n; j < i; j++) m = Math.min(m, l[j]);
    out[i] = m;
  }
  return out;
}

type Indicators = { sma20: Float64Array; sd20: Float64Array; sma200: Float64Array; rsi: Float64Array; hi12: Float64Array; lo12: Float64Array; hi48: Float64Array; lo48: Float64Array };
function indicators(b: Bars): Indicators {
  const sma20 = mean(b.c, 20);
  return { sma20, sd20: deviation(b.c, 20, sma20), sma200: mean(b.c, 200), rsi: rsi2(b.c), hi12: rollingHigh(b.h, 12), lo12: rollingLow(b.l, 12), hi48: rollingHigh(b.h, 48), lo48: rollingLow(b.l, 48) };
}

type Result = { years: number[]; drop: number; trainReturn: number; trainDrop: number; testReturn: number; total: number; trades: number; liquidations: number; winRate: number };

function simulate(b: Bars, ind: Indicators, rule: Rule, lev: number): Result {
  const n = b.c.length;
  let equity = 1;
  let side = 0; // 1 long, -1 short
  let entry = 0, notional = 0, stopPx = 0, targetPx = NaN, opened = 0;
  let pending = 0; // signal to enter at the next open
  let trades = 0, wins = 0, liquidations = 0;
  const curve = new Float64Array(n);
  curve[0] = 1; // bug fix after the first run: the first bar was never written, so every 2022 return read -100%
  const close = (px: number) => {
    const pnl = side * (px / entry - 1) * notional - notional * COST;
    if (pnl > 0) wins++;
    equity = Math.max(0, equity + pnl);
    side = 0;
  };
  for (let i = 1; i < n; i++) {
    if (pending !== 0 && side === 0 && equity > 0) {
      side = pending;
      entry = b.o[i];
      notional = equity * lev;
      equity -= notional * COST;
      opened = i;
      trades++;
      const s = rule.kind === "RSI2" ? 0.02 : rule.stop;
      stopPx = entry * (1 - side * s);
      targetPx = rule.kind === "BO" ? entry * (1 + side * 2 * s) : NaN;
    }
    pending = 0;
    if (side !== 0) {
      // Liquidation first, at the bar's worst price.
      const worst = side === 1 ? b.l[i] : b.h[i];
      const value = equity + side * (worst / entry - 1) * notional;
      const liqPx = entry * (1 - side * ((equity - MAINTENANCE * notional) / notional));
      const stopHit = side === 1 ? b.l[i] <= stopPx : b.h[i] >= stopPx;
      if (value <= MAINTENANCE * notional && !(stopHit && (side === 1 ? stopPx > liqPx : stopPx < liqPx))) {
        close(side === 1 ? Math.min(b.o[i], liqPx) : Math.max(b.o[i], liqPx));
        liquidations++;
      } else if (stopHit) {
        close(side === 1 ? Math.min(b.o[i], stopPx) : Math.max(b.o[i], stopPx));
      } else if (rule.kind === "BO" && (side === 1 ? b.h[i] >= targetPx : b.l[i] <= targetPx)) {
        close(side === 1 ? Math.max(b.o[i], targetPx) : Math.min(b.o[i], targetPx));
      } else if (rule.kind === "MR" && (side === 1 ? b.c[i] >= ind.sma20[i] : b.c[i] <= ind.sma20[i])) {
        close(b.c[i]);
      } else if (rule.kind === "RSI2" && (side === 1 ? ind.rsi[i] > 70 : ind.rsi[i] < 30)) {
        close(b.c[i]);
      } else if (rule.kind !== "BO" && i - opened >= 48) {
        close(b.c[i]);
      }
    }
    if (side === 0 && b.t[i] >= FIRST_MONTH && i > 200) {
      if (rule.kind === "MR") {
        if (b.c[i] < ind.sma20[i] - rule.k * ind.sd20[i]) pending = 1;
        else if (rule.shorts && b.c[i] > ind.sma20[i] + rule.k * ind.sd20[i]) pending = -1;
      } else if (rule.kind === "BO") {
        const hi = rule.n === 12 ? ind.hi12 : ind.hi48;
        const lo = rule.n === 12 ? ind.lo12 : ind.lo48;
        if (b.c[i] > hi[i]) pending = 1;
        else if (b.c[i] < lo[i]) pending = -1;
      } else {
        if (ind.rsi[i] < rule.a && b.c[i] > ind.sma200[i]) pending = 1;
        else if (rule.shorts && ind.rsi[i] > 100 - rule.a && b.c[i] < ind.sma200[i]) pending = -1;
      }
    }
    curve[i] = side === 0 ? equity : Math.max(0, equity + side * (b.c[i] / entry - 1) * notional);
  }
  const at = (time: number) => {
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (b.t[mid] < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const first = at(FIRST_MONTH);
  const span = (from: number, to: number) => {
    let peak = curve[from] || 1;
    let worst = 0;
    for (let i = from; i <= to; i++) {
      peak = Math.max(peak, curve[i]);
      if (peak > 0) worst = Math.max(worst, 1 - curve[i] / peak);
    }
    return { ret: curve[from] > 0 ? curve[to] / curve[from] - 1 : -1, drop: worst };
  };
  const years = YEARS.map((y) => {
    const s = Math.max(first, at(Date.UTC(y, 0, 1)) - 1);
    const e = Math.min(n - 1, at(Date.UTC(y + 1, 0, 1)) - 1);
    return e > s ? span(s, e).ret : NaN;
  });
  const trainEnd = at(TRAIN_END) - 1;
  const whole = span(first, n - 1);
  const train = span(first, trainEnd);
  return { years, drop: whole.drop, trainReturn: train.ret, trainDrop: train.drop, testReturn: span(trainEnd, n - 1).ret, total: whole.ret, trades, liquidations, winRate: trades ? wins / trades : 0 };
}

const pct = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%` : "-").padStart(7);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];
const row = (coin: string, r: Result) =>
  `    ${coin.padEnd(4)}${r.years.map(pct).join("")}  drop ${pct(-r.drop)}  test ${pct(r.testReturn)}  total ${pct(r.total)}  trades ${r.trades}  win ${pct(r.winRate)}  liq ${r.liquidations}`;

async function main() {
  const data = new Map<string, { b: Bars; ind: Indicators }>();
  for (const coin of COINS) {
    const b = await bars(coin);
    data.set(coin, { b, ind: indicators(b) });
  }
  console.log(`Coins ${COINS.join(", ")}; cost ${COST * 100}% a fill; years ${YEARS.join(" ")}`);
  const results = RULES.flatMap((rule) => LEVERAGES.map((lev) => ({ rule, lev, by: new Map(COINS.map((c) => [c, simulate(data.get(c)!.b, data.get(c)!.ind, rule, lev)] as const)) })));

  if (process.env.SHOW) {
    for (const x of results.filter((r) => new RegExp(process.env.SHOW!).test(`${label(r.rule)} ${r.lev}x`))) {
      console.log(`\n${label(x.rule)} ${x.lev}x`);
      for (const [coin, r] of x.by) console.log(row(coin, r));
    }
    return;
  }
  console.log("\nAll rules (median over coins): train, train drop, test, worst drop, trades; train-OK coins");
  const scored = results.map((x) => {
    const rs = [...x.by.values()];
    const ok = rs.filter((r) => r.years[0] > 0 && r.years[1] > 0 && r.trainDrop < 0.3).length;
    return { ...x, ok, medTrain: median(rs.map((r) => r.trainReturn)) };
  });
  for (const s of scored) {
    const rs = [...s.by.values()];
    console.log(`  ${`${label(s.rule)} ${s.lev}x`.padEnd(34)} train ${pct(s.medTrain)} trainDrop ${pct(-median(rs.map((r) => r.trainDrop)))} test ${pct(median(rs.map((r) => r.testReturn)))} worst ${pct(-median(rs.map((r) => r.drop)))} trades ${median(rs.map((r) => r.trades))}  train-OK ${s.ok}/${COINS.length}`);
  }
  const locked = scored.filter((s) => s.ok === COINS.length).sort((a, b) => b.medTrain - a.medTrain).slice(0, 3);
  console.log(`\nLocked: ${locked.length ? locked.map((s) => `${label(s.rule)} ${s.lev}x`).join(" | ") : "none (no rule is train-OK on every fit coin)"}`);
  for (const s of locked) {
    console.log(`\n${label(s.rule)} ${s.lev}x`);
    let pass = 0;
    for (const [coin, r] of s.by) {
      const ok = r.years.filter((v) => v > 0).length >= 4 && r.drop < 0.3 && r.testReturn > 0;
      if (ok) pass++;
      console.log(`${row(coin, r)}  ${ok ? "PASS" : "fail"}`);
    }
    console.log(`=> ${pass}/${COINS.length}: ${pass === COINS.length ? "PASS" : "NO-GO"}`);
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
