/**
 * Research only (read-only, public data, no database): momentum as a many-coin portfolio, with leverage
 * (2026-11-25, owner: "go research again. jadilah ambisius. kamu boleh research dari source lain").
 * Sources: time-series momentum is the most robust crypto effect in the literature (e.g. VU journal 2026: ~32% a
 * year, beats cross-sectional); cross-sectional momentum (Liu, Tsyvinski & Wu, NBER w25882: ~3% a week long-short
 * 2014-2020) is disputed as fragile and outlier driven (Springer s11408-025-00474-9). The idea here: our one rule
 * that passed (Vol Trend) spread over many coins should cut the worst drop, which is what lets leverage be used.
 *
 * Everything below was fixed before the first run.
 *
 * Universe (19 Binance USDT pairs, hourly closes 2020-10-15 to now): BTC ETH SOL XRP NEAR ZEC ADA DOGE LINK AVAX
 *   DOT LTC BCH ATOM TRX UNI plus three that collapsed, so survivors do not flatter the result: LUNA (cut at
 *   2022-05-13 00:00 UTC, before the symbol was reused for a new token), FTT, SRM (until their data ends).
 *   Funding: Binance perp funding (data.binance.vision); a coin without funding data pays 10% a year on longs.
 * Costs: 0.05% a fill on every change of position (check: COST=0.001). Leverage L: the portfolio's hourly
 *   return is multiplied by L; if the account falls to 5% or less it is liquidated (hourly closes, optimistic).
 *
 * P1  Vol Trend portfolio: each coin runs the shipped rule (long when close > SMA(1200 h) x 1.03, exit below
 *     the SMA; 20% volatility target over 720 h, daily resize when > 25% off, 15% stop) long only, or long + short
 *     (short when close < SMA x 0.97 and 7 day funding >= 0). The portfolio holds every live coin in equal
 *     weight, rebalanced each hour (each coin's own hourly return, averaged). L 1, 2, 3 = 6 configurations.
 * P2  Cross-sectional momentum: every Monday 00:00 UTC rank the live coins by their return over the last LB days
 *     and hold the top K in equal weight; long + short variant also shorts the bottom K. Gate variant: hold longs
 *     only while BTC > its SMA(1200 h) and shorts only while BTC < it, else cash. LB 7 or 28 days x K 3 or 5 x
 *     gate on/off x long only / long + short = 16 rules x L 1, 2, 3 = 48.
 * Pass rule (portfolio): positive in at least 4 of the 6 years 2021-2026, worst drop under 30%, positive test
 *   (2024 to now), still positive at 2x costs. P2 selection first: train-OK = 2 of 2021-2023 positive and a
 *   training drop under 30%; lock the 3 best training returns. P1 has 6 configurations and is judged directly.
 *   Check (not selection): the same on two halves of the universe (HALF=a or HALF=b).
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-portfolio-momentum.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

import { binanceCloses, HOUR_MS } from "./binance-history.mts";

const ALL = ["BTC", "ETH", "SOL", "XRP", "NEAR", "ZEC", "ADA", "DOGE", "LINK", "AVAX", "DOT", "LTC", "BCH", "ATOM", "TRX", "UNI", "LUNA", "FTT", "SRM"];
const HALVES: Record<string, string[]> = { a: ALL.filter((_, i) => i % 2 === 0), b: ALL.filter((_, i) => i % 2 === 1) };
const COINS = process.env.HALF ? HALVES[process.env.HALF] : ALL;
const START = Date.UTC(2020, 9, 15);
const TRAIN_END = Date.UTC(2024, 0, 1);
const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
const COST = Number(process.env.COST ?? 0.0005);
const LUNA_END = Date.UTC(2022, 4, 13);
const FUNDING_CACHE = process.env.FUNDING_CACHE ?? join(tmpdir(), "zolva-binance-funding");
const SMA_H = 1200;
const VOL_H = 720;

async function funding(coin: string, until: number): Promise<[number, number][] | null> {
  const file = join(FUNDING_CACHE, `${coin}USDT-funding.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const rows: [number, number][] = [];
  for (let y = 2020, m = 8; Date.UTC(y, m, 1) < until; m === 11 ? (y++, (m = 0)) : m++) {
    const month = `${y}-${String(m + 1).padStart(2, "0")}`;
    const url = `https://data.binance.vision/data/futures/um/monthly/fundingRate/${coin}USDT/${coin}USDT-fundingRate-${month}.zip`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) continue;
    const zip = Buffer.from(await response.arrayBuffer());
    const cd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const start = 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28);
    const body = zip.subarray(start, start + zip.readUInt32LE(cd + 20));
    for (const line of (zip.readUInt16LE(8) === 8 ? inflateRawSync(body) : body).toString("utf8").split(String.fromCharCode(10))) {
      const [time, , rate] = line.split(",");
      if (/^[0-9]+$/.test(time ?? "") && Number.isFinite(Number(rate))) rows.push([Number(time), Number(rate)]);
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a[0] - b[0]);
  mkdirSync(FUNDING_CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(rows));
  return rows;
}

/** Per coin, aligned to `hours`: close (NaN before listing or after the end), funding paid this hour by a long. */
type Coin = { close: Float64Array; fund: Float64Array; live: Uint8Array };

function mean(values: Float64Array, window: number): Float64Array {
  const out = new Float64Array(values.length).fill(NaN);
  let sum = 0, count = 0;
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) { sum += values[i]; count++; }
    if (i >= window && Number.isFinite(values[i - window])) { sum -= values[i - window]; count--; }
    if (count === window) out[i] = sum / window;
  }
  return out;
}

/** Hourly return of one coin's Vol Trend sleeve (fraction of the sleeve), costs and funding included. */
function volTrendReturns(c: Coin, shorts: boolean, cost: number): Float64Array {
  const n = c.close.length;
  const out = new Float64Array(n);
  const sma = mean(c.close, SMA_H);
  const logr = new Float64Array(n).fill(NaN);
  for (let i = 1; i < n; i++) if (c.live[i] && c.live[i - 1]) logr[i] = Math.log(c.close[i] / c.close[i - 1]);
  const m1 = mean(logr, VOL_H);
  const sq = logr.map((v) => v * v);
  const m2 = mean(sq, VOL_H);
  const f7 = mean(c.fund, 168);
  let side = 0, size = 0, stopRef = 0;
  for (let i = 1; i < n; i++) {
    if (!c.live[i] || !c.live[i - 1]) {
      if (side !== 0 && c.live[i - 1] && !c.live[i]) out[i] = -size * cost; // closed at the last price
      side = 0; size = 0;
      continue;
    }
    const r = c.close[i] / c.close[i - 1] - 1;
    out[i] = side * size * r - (side !== 0 ? side * size * c.fund[i] : 0);
    const price = c.close[i];
    const vol = Math.sqrt(Math.max(0, m2[i] - m1[i] * m1[i]) * 8760);
    if (!Number.isFinite(sma[i]) || !(vol > 0)) continue;
    const wanted = Math.min(1, 0.2 / vol);
    let target = side;
    if (side === 1 && (price < sma[i] || price <= stopRef * 0.85)) target = 0;
    if (side === -1 && (price > sma[i] || price >= stopRef * 1.15 || f7[i] < 0)) target = 0;
    if (target === 0) {
      if (price > sma[i] * 1.03) target = 1;
      else if (shorts && price < sma[i] * 0.97 && f7[i] >= 0) target = -1;
      if (target === side) target = side; // unchanged
    }
    if (target !== side) {
      out[i] -= (size + (target !== 0 ? wanted : 0)) * cost;
      side = target;
      size = target !== 0 ? wanted : 0;
      stopRef = price;
    } else if (side !== 0 && i % 24 === 0 && Math.abs(size - wanted) > 0.25 * wanted) {
      out[i] -= Math.abs(size - wanted) * cost;
      size = wanted;
    }
  }
  return out;
}

type Weights = (i: number) => Map<number, number>;

/** Cross-sectional momentum: returns the portfolio's hourly return directly. */
function crossSectional(coins: Coin[], btc: Coin, lb: number, k: number, gate: boolean, shorts: boolean, hours: number[], cost: number): Float64Array {
  const n = hours.length;
  const out = new Float64Array(n);
  const btcSma = mean(btc.close, SMA_H);
  let weights = new Map<number, number>();
  for (let i = 1; i < n; i++) {
    // return of the held book over this hour
    let r = 0;
    for (const [j, w] of weights) {
      const c = coins[j];
      if (c.live[i] && c.live[i - 1]) r += w * (c.close[i] / c.close[i - 1] - 1) - w * c.fund[i];
    }
    out[i] = r;
    for (const [j] of weights) if (!coins[j].live[i]) weights.delete(j); // a dead coin leaves the book
    const d = new Date(hours[i]);
    if (d.getUTCDay() !== 1 || d.getUTCHours() !== 0) continue;
    const back = i - lb * 24;
    if (back < 0) continue;
    const ranked = coins
      .map((c, j) => ({ j, ret: c.live[i] && c.live[back] ? c.close[i] / c.close[back] - 1 : NaN }))
      .filter((x) => Number.isFinite(x.ret))
      .sort((a, b) => b.ret - a.ret);
    if (ranked.length < 2 * k) continue;
    const up = btc.close[i] > btcSma[i];
    const next = new Map<number, number>();
    const longOk = !gate || up;
    const shortOk = shorts && (!gate || !up);
    const legs = (longOk ? 1 : 0) + (shortOk ? 1 : 0);
    if (longOk) for (const x of ranked.slice(0, k)) next.set(x.j, 1 / k / Math.max(1, legs));
    if (shortOk) for (const x of ranked.slice(-k)) next.set(x.j, (next.get(x.j) ?? 0) - 1 / k / Math.max(1, legs));
    let turnover = 0;
    for (const j of new Set([...weights.keys(), ...next.keys()])) turnover += Math.abs((next.get(j) ?? 0) - (weights.get(j) ?? 0));
    out[i] -= turnover * cost;
    weights = next;
  }
  return out;
}

type Stats = { years: number[]; drop: number; trainRet: number; trainDrop: number; testRet: number; total: number; cagr: number; liquidated: boolean };

function leveraged(hourly: Float64Array, lev: number, hours: number[]): Stats {
  const n = hours.length;
  const eq = new Float64Array(n);
  let e = 1;
  let liquidated = false;
  for (let i = 0; i < n; i++) {
    if (hours[i] >= START && !liquidated) {
      e *= 1 + lev * hourly[i];
      if (e <= 0.05) { e = 0; liquidated = true; }
    }
    eq[i] = e;
  }
  const idx = (t: number) => { const k = hours.findIndex((h) => h >= t); return k < 0 ? n - 1 : k; };
  const span = (a: number, b: number) => {
    let peak = eq[a], worst = 0;
    for (let i = a; i <= b; i++) { peak = Math.max(peak, eq[i]); if (peak > 0) worst = Math.max(worst, 1 - eq[i] / peak); }
    return { ret: eq[a] > 0 ? eq[b] / eq[a] - 1 : -1, drop: worst };
  };
  const s0 = idx(START);
  const years = YEARS.map((y) => span(Math.max(s0, idx(Date.UTC(y, 0, 1)) - 1), Math.min(n - 1, idx(Date.UTC(y + 1, 0, 1)) - 1)).ret);
  const tr = span(s0, idx(TRAIN_END) - 1);
  const whole = span(s0, n - 1);
  const yrs = (hours[n - 1] - START) / (365 * 24 * HOUR_MS);
  return { years, drop: whole.drop, trainRet: tr.ret, trainDrop: tr.drop, testRet: span(idx(TRAIN_END) - 1, n - 1).ret, total: whole.ret, cagr: Math.pow(Math.max(0, 1 + whole.ret), 1 / yrs) - 1, liquidated };
}

const pct = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%` : "-").padStart(6);
const line = (name: string, s: Stats, s2: Stats) =>
  `  ${name.padEnd(36)}${s.years.map(pct).join("")}  drop ${pct(-s.drop)}  test ${pct(s.testRet)}  cagr ${pct(s.cagr)}  $/wk/$1k ${((1000 * s.cagr) / 52).toFixed(1).padStart(5)}  2x-cost cagr ${pct(s2.cagr)}${s.liquidated ? "  LIQUIDATED" : ""}  ${passes(s, s2) ? "PASS" : "fail"}`;
const passes = (s: Stats, s2: Stats) => s.years.filter((v) => v > 0).length >= 4 && s.drop < 0.3 && s.testRet > 0 && s2.total > 0;

async function main() {
  const now = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const hours: number[] = [];
  for (let h = START - (SMA_H + 200) * HOUR_MS; h < now; h += HOUR_MS) hours.push(h);
  const data: Coin[] = [];
  let btc: Coin | null = null;
  for (const coin of ALL) {
    const rows = await binanceCloses(`${coin}USDT`, now);
    const at = new Map<number, number>(rows);
    const last = coin === "LUNA" ? LUNA_END : rows[rows.length - 1][0];
    const close = new Float64Array(hours.length).fill(NaN);
    const live = new Uint8Array(hours.length);
    let prev = NaN;
    for (let i = 0; i < hours.length; i++) {
      const v = at.get(hours[i]);
      if (v !== undefined) prev = v;
      if (hours[i] >= rows[0][0] && hours[i] <= last && Number.isFinite(prev)) { close[i] = prev; live[i] = 1; }
    }
    const fund = new Float64Array(hours.length);
    const f = await funding(coin, now);
    if (f) for (const [t, rate] of f) { const k = Math.floor((t - hours[0]) / HOUR_MS); if (k >= 0 && k < hours.length) fund[k] += rate; }
    else for (let i = 0; i < hours.length; i++) fund[i] = 0.1 / 8760;
    const c = { close, fund, live };
    if (coin === "BTC") btc = c;
    if (COINS.includes(coin)) data.push(c);
    console.log(`  ${coin}: ${rows.length} hours${f ? "" : " (no funding data: 10%/yr assumed)"}${coin === "LUNA" ? " (cut 2022-05-13)" : ""}`);
  }
  console.log(`\nUniverse ${COINS.join(" ")}; cost ${COST * 100}% a fill; years ${YEARS.join(" ")}\n`);

  const portfolio = (shorts: boolean, cost: number) => {
    const sleeves = data.map((c) => volTrendReturns(c, shorts, cost));
    const out = new Float64Array(hours.length);
    for (let i = 0; i < hours.length; i++) {
      let sum = 0, count = 0;
      for (let j = 0; j < data.length; j++) if (data[j].live[i]) { sum += sleeves[j][i]; count++; }
      out[i] = count ? sum / count : 0;
    }
    return out;
  };
  console.log("P1 Vol Trend portfolio (judged directly):");
  for (const shorts of [false, true]) {
    const base = portfolio(shorts, COST);
    const dbl = portfolio(shorts, COST * 2);
    for (const lev of [1, 2, 3]) console.log(line(`${shorts ? "L+S" : "long"} ${lev}x`, leveraged(base, lev, hours), leveraged(dbl, lev, hours)));
  }

  console.log("\nP2 cross-sectional momentum (train, train drop, test; train-OK):");
  const rows: { name: string; s: Stats; s2: Stats; ok: boolean }[] = [];
  for (const lb of [7, 28]) for (const k of [3, 5]) for (const gate of [false, true]) for (const shorts of [false, true]) {
    const base = crossSectional(data, btc!, lb, k, gate, shorts, hours, COST);
    const dbl = crossSectional(data, btc!, lb, k, gate, shorts, hours, COST * 2);
    for (const lev of [1, 2, 3]) {
      const s = leveraged(base, lev, hours);
      const s2 = leveraged(dbl, lev, hours);
      const ok = s.years.slice(0, 3).filter((v) => v > 0).length >= 2 && s.trainDrop < 0.3;
      const name = `lb${lb}d top${k} ${gate ? "gate" : "nogate"} ${shorts ? "L+S" : "long"} ${lev}x`;
      rows.push({ name, s, s2, ok });
      console.log(`  ${name.padEnd(36)} train ${pct(s.trainRet)} trainDrop ${pct(-s.trainDrop)} test ${pct(s.testRet)} worst ${pct(-s.drop)} ${ok ? "train-OK" : ""}${s.liquidated ? " LIQUIDATED" : ""}`);
    }
  }
  const locked = rows.filter((r) => r.ok).sort((a, b) => b.s.trainRet - a.s.trainRet).slice(0, 3);
  console.log(`\nP2 locked: ${locked.length ? "" : "none"}`);
  for (const r of locked) console.log(line(r.name, r.s, r.s2));
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
