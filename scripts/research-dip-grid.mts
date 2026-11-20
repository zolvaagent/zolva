/**
 * Research only (read-only, public data, no database): a trend-filtered dip grid (2026-11-20, owner "ok continue").
 * Idea from the vault study (docs/perps-research.md, "Vault study step 0"): the FuturAI Hyperliquid vault buys small
 * lots on dips and sells each lot at a fixed target. Its weak spot, shared with Steady Wealth Builder, is lots
 * piling up in a long fall. Here the grid only adds lots in the Vol Trend regime and closes everything when the
 * trend breaks. Venue in mind: Lighter perps (zero trading fee), long only, no leverage.
 *
 * Everything below (grid, fills, costs, split, pass rule) was fixed before the first run.
 *
 * Data: Binance spot hourly OHLC (public klines, cached), 2020-10-15 to now.
 *   Fit coins (selection): SOL, LINK, DOGE, XRP, ADA, AVAX. Unseen check only: COINS=BTC,ETH.
 * Rule (per coin, capital 1):
 *   - At most 10 lots; each lot buys 10% of current equity. No leverage, no averaging beyond 10 lots.
 *   - Anchor = price of the last fill; while no lot is held the anchor trails the highest close since.
 *   - Buy: a limit at anchor x (1 - step). It fills in a bar if the bar's low reaches it (at the open when the bar
 *     opens below it). At most one buy per bar.
 *   - Sell: each lot has a limit at its buy x (1 + target). It fills if a LATER bar's high reaches it (at the
 *     open when the bar opens above it). A lot is never bought and sold in the same bar.
 *   - Variant A (FuturAI as is): no filter. Variant B (trend filter): buys only while the regime is on; regime on
 *     when close > SMA(1200 h) x 1.03, off when close < SMA x 0.97 (the Vol Trend gate); when it turns off, every
 *     lot is sold at that close.
 * Grid: step 1%, 2%, 3% x target 1%, 2%, 3% x variant A, B = 18 rules.
 * Costs: 0.05% a fill (Lighter has no fee; this is slippage), longs pay 10% a year funding on held notional.
 *   Check only: COST=0.001 (2x).
 * Split and pass rule (as the alt rounds): training 2020-10-15 to 2023-12-31, test 2024-01-01 to now.
 *   train-OK = positive in at least 2 of 2021/2022/2023 and training drop under 30%, on at least 4 of 6 coins;
 *   lock the 3 train-OK rules with the best median training return. A locked rule PASSES when, on at least 4 of
 *   6 coins: positive in at least 4 of the 6 years 2021-2026, worst drop under 30%, positive test return.
 *   Then report it on BTC/ETH (unseen) and at 2x costs. Holding each coin is shown for comparison.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-dip-grid.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOUR = 3_600_000;
const START = Date.UTC(2020, 9, 15);
const TRAIN_END = Date.UTC(2024, 0, 1);
const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
const COINS = process.env.COINS ? process.env.COINS.split(",") : ["SOL", "LINK", "DOGE", "XRP", "ADA", "AVAX"];
const COST = Number(process.env.COST ?? 0.0005);
const FUNDING_PER_HOUR = 0.1 / (365 * 24);
const CACHE = process.env.OHLC_CACHE ?? join(tmpdir(), "zolva-binance-ohlc");
const SMA_HOURS = 1200;
const MAX_LOTS = 10;

type Bar = { t: number; o: number; h: number; l: number; c: number };

async function ohlc(coin: string): Promise<Bar[]> {
  const file = join(CACHE, `${coin}.json`);
  let bars: Bar[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  let from = bars.length ? bars.at(-1)!.t + HOUR : START - SMA_HOURS * HOUR;
  const until = Math.floor(Date.now() / HOUR) * HOUR - HOUR;
  while (from <= until) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${coin}USDT&interval=1h&startTime=${from}&limit=1000`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const rows = (await response.json()) as [number, string, string, string, string][];
    if (!rows.length) break;
    for (const r of rows) if (r[0] <= until) bars.push({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4] });
    from = rows.at(-1)![0] + HOUR;
    await new Promise((r) => setTimeout(r, 120));
  }
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(bars));
  return bars;
}

type Rule = { step: number; target: number; filter: boolean };
const label = (r: Rule) => `step ${r.step * 100}% target ${r.target * 100}% ${r.filter ? "B trend" : "A plain"}`;
const RULES: Rule[] = [];
for (const step of [0.01, 0.02, 0.03]) for (const target of [0.01, 0.02, 0.03]) for (const filter of [false, true]) RULES.push({ step, target, filter });

type Result = { years: Record<number, number>; drop: number; trainReturn: number; trainDrop: number; testReturn: number; total: number; exposure: number; trades: number };

function simulate(bars: Bar[], rule: Rule): Result {
  const sma: number[] = new Array(bars.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].c;
    if (i >= SMA_HOURS) sum -= bars[i - SMA_HOURS].c;
    if (i >= SMA_HOURS - 1) sma[i] = sum / SMA_HOURS;
  }
  let cash = 1;
  let lots: { qty: number; buy: number; tp: number; bar: number }[] = [];
  let anchor = NaN;
  let regime = false;
  let trades = 0;
  let exposureHours = 0;
  const equityAt = (i: number) => cash + lots.reduce((s, l) => s + l.qty * bars[i].c, 0);
  const curve: { t: number; e: number }[] = [];
  const first = bars.findIndex((b) => b.t >= START);
  for (let i = first; i < bars.length; i++) {
    const bar = bars[i];
    // Funding on the notional held through this hour.
    const held = lots.reduce((s, l) => s + l.qty * bars[i - 1].c, 0);
    cash -= held * FUNDING_PER_HOUR;
    if (held > 0) exposureHours++;
    // Sells: lots bought in an earlier bar whose target this bar reaches.
    const keep: typeof lots = [];
    for (const lot of lots) {
      if (lot.bar < i && bar.h >= lot.tp) {
        const px = Math.max(bar.o, lot.tp);
        cash += lot.qty * px * (1 - COST);
        anchor = px;
        trades++;
      } else keep.push(lot);
    }
    lots = keep;
    // Buy: one limit below the anchor (regime from the previous close for variant B).
    const allowed = !rule.filter || regime;
    if (!Number.isFinite(anchor)) anchor = bars[i - 1].c;
    if (allowed && lots.length < MAX_LOTS) {
      const level = anchor * (1 - rule.step);
      if (bar.l <= level) {
        const px = Math.min(bar.o, level);
        const usd = equityAt(i - 1) * (1 / MAX_LOTS);
        if (usd <= cash) {
          const qty = (usd * (1 - COST)) / px;
          cash -= usd;
          lots.push({ qty, buy: px, tp: px * (1 + rule.target), bar: i });
          anchor = px;
          trades++;
        }
      }
    }
    if (!lots.length) anchor = Math.max(anchor, bar.c);
    // Regime update on this close (variant B); turning off sells everything at the close.
    if (rule.filter && Number.isFinite(sma[i])) {
      if (!regime && bar.c > sma[i] * 1.03) regime = true;
      else if (regime && bar.c < sma[i] * 0.97) {
        regime = false;
        for (const lot of lots) cash += lot.qty * bar.c * (1 - COST);
        trades += lots.length;
        lots = [];
        anchor = bar.c;
      }
    }
    curve.push({ t: bar.t, e: equityAt(i) });
  }
  const yearReturn = (y: number) => {
    const inYear = curve.filter((p) => new Date(p.t).getUTCFullYear() === y);
    const before = curve.filter((p) => new Date(p.t).getUTCFullYear() < y).at(-1)?.e ?? 1;
    return inYear.length ? inYear.at(-1)!.e / before - 1 : NaN;
  };
  const maxDrop = (points: { e: number }[]) => {
    let peak = -Infinity;
    let worst = 0;
    for (const p of points) {
      peak = Math.max(peak, p.e);
      worst = Math.max(worst, 1 - p.e / peak);
    }
    return worst;
  };
  const train = curve.filter((p) => p.t < TRAIN_END);
  const test = curve.filter((p) => p.t >= TRAIN_END);
  return {
    years: Object.fromEntries(YEARS.map((y) => [y, yearReturn(y)])),
    drop: maxDrop(curve),
    trainReturn: train.at(-1)!.e - 1,
    trainDrop: maxDrop(train),
    testReturn: test.at(-1)!.e / train.at(-1)!.e - 1,
    total: curve.at(-1)!.e - 1,
    exposure: exposureHours / curve.length,
    trades,
  };
}

const pct = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%` : "-").padStart(6);
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function row(coin: string, r: Result) {
  return `${coin.padEnd(5)} ${YEARS.map((y) => pct(r.years[y])).join("")}  drop ${pct(-r.drop)}  train ${pct(r.trainReturn)}  test ${pct(r.testReturn)}  total ${pct(r.total)}  in market ${pct(r.exposure)}  fills ${r.trades}`;
}

async function main() {
  const data = new Map<string, Bar[]>();
  for (const coin of COINS) data.set(coin, await ohlc(coin));
  console.log(`Coins ${COINS.join(", ")}; cost ${COST * 100}% a fill; years ${YEARS.join(" ")}`);
  console.log("\nHolding (for comparison):");
  for (const coin of COINS) {
    const bars = data.get(coin)!.filter((b) => b.t >= START);
    const hold: Result = simulateHold(bars);
    console.log(row(coin, hold));
  }

  const results = RULES.map((rule) => ({ rule, by: new Map(COINS.map((c) => [c, simulate(data.get(c)!, rule)] as const)) }));
  if (process.env.SHOW) {
    for (const { rule, by } of results.filter((x) => new RegExp(process.env.SHOW!).test(label(x.rule)))) {
      console.log(`\n${label(rule)}`);
      for (const [coin, r] of by) console.log(row(coin, r));
    }
    return;
  }
  console.log("\nAll rules (median over coins): train return, train drop, test return, worst drop; train-OK coins");
  const scored = results.map(({ rule, by }) => {
    const rs = [...by.values()];
    const trainOk = rs.filter((r) => [2021, 2022, 2023].filter((y) => r.years[y] > 0).length >= 2 && r.trainDrop < 0.3).length;
    return { rule, by, trainOk, medTrain: median(rs.map((r) => r.trainReturn)) };
  });
  for (const s of scored) {
    const rs = [...s.by.values()];
    console.log(`  ${label(s.rule).padEnd(34)} train ${pct(s.medTrain)} trainDrop ${pct(-median(rs.map((r) => r.trainDrop)))} test ${pct(median(rs.map((r) => r.testReturn)))} worst ${pct(-median(rs.map((r) => r.drop)))}  train-OK ${s.trainOk}/${COINS.length}`);
  }
  const locked = scored.filter((s) => s.trainOk >= 4).sort((a, b) => b.medTrain - a.medTrain).slice(0, 3);
  console.log(`\nLocked (train-OK on >= 4 coins, best median training return): ${locked.length ? locked.map((s) => label(s.rule)).join(" | ") : "none"}`);
  for (const s of locked) {
    console.log(`\n${label(s.rule)}`);
    let passes = 0;
    for (const [coin, r] of s.by) {
      const ok = YEARS.filter((y) => r.years[y] > 0).length >= 4 && r.drop < 0.3 && r.testReturn > 0;
      if (ok) passes++;
      console.log(`${row(coin, r)}  ${ok ? "PASS" : "fail"}`);
    }
    console.log(`=> ${passes}/${COINS.length} coins pass: ${passes >= 4 ? "PASS" : "NO-GO"}`);
  }
}

function simulateHold(bars: Bar[]): Result {
  const c0 = bars[0].c;
  const yearEnd = (y: number) => bars.filter((b) => new Date(b.t).getUTCFullYear() <= y).at(-1)?.c;
  const years: Record<number, number> = {};
  for (const y of YEARS) {
    const end = yearEnd(y);
    const start = y === YEARS[0] ? c0 : yearEnd(y - 1);
    years[y] = end && start ? end / start - 1 : NaN;
  }
  let peak = 0;
  let drop = 0;
  for (const b of bars) {
    peak = Math.max(peak, b.c);
    drop = Math.max(drop, 1 - b.c / peak);
  }
  const trainEnd = bars.filter((b) => b.t < TRAIN_END).at(-1)!.c;
  return { years, drop, trainReturn: trainEnd / c0 - 1, trainDrop: NaN, testReturn: bars.at(-1)!.c / trainEnd - 1, total: bars.at(-1)!.c / c0 - 1, exposure: 1, trades: 1 };
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
