/**
 * Research only (read-only, never writes to the database): do the short ideas from
 * research-short-trend.mts and research-short-structure.mts work on 15 minute bars (2026-11-13)?
 * Lighter RH crypto perps (8), 1x, short only, one slot, decisions at each bar close, hourly funding
 * split over the bars of the hour, cost on open and close.
 *
 *   bounce     the engine's rule with every hour count scaled to bars: down more than TREND over 7 days,
 *              z >= 0.5 (and <= 2.5) against the 48 hour average, not up more than FAST_MAX over 24 hours;
 *              cover at z <= -0.5 or the stop.
 *   lh         support break: a close below the latest swing low (the bar before was at or above it, the
 *              swing low is at most 72 hours old), with a lower swing high; exit above the lower high
 *              (trailed down) or the stop.
 *   lhll       lh, and also a lower swing low.
 *   lh_trend   lh, and down more than TREND over 7 days.
 * A swing point is the highest or lowest close of K bars either side, known K bars later (no look-ahead).
 *
 *   BAR=15m K=4,8,16 COSTS=0.0005 STOP=0.1 node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-short-15m.mts
 *
 * First run downloads the 15 minute candles (about 12 thousand bars per market, ~1 request a second).
 */
import { FIRST_HOUR, HOUR_MS, loadMarketBars, type Market } from "./lighter-history.mts";

const RESOLUTION = process.env.BAR ?? "15m";
const BAR_MS = RESOLUTION === "5m" ? 300_000 : RESOLUTION === "15m" ? 900_000 : HOUR_MS;
/** Bars per hour. */
const B = HOUR_MS / BAR_MS;
const MARKETS: Record<string, number> = { BTC: 1, ETH: 0, HYPE: 2, SOL: 3, ZEC: 4, LIT: 5, XRP: 6, NEAR: 7 };
const COST = Number(process.env.COSTS ?? 0.0005);
const STOP = Number(process.env.STOP ?? 0.1);
const KS = (process.env.K ?? "4,8,16").split(",").map(Number);
const TREND = Number(process.env.TREND ?? 0.05);
const FAST_MAX = Number(process.env.FAST_MAX ?? 0.015);
const AVG = 48 * B;
const WEEK = 168 * B;
const DAY = 24 * B;
const WARMUP = WEEK;
const MAX_AGE = 72 * B;

type Mode = "bounce" | "lh" | "lhll" | "lh_trend";
type Position = { quantity: number; entry: number; invalidate: number };
type Swings = { h1: number; h2: number; l1: number; l2: number; l1At: number };

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function swingsFor(closes: number[], k: number): Swings[] {
  const out: Swings[] = [];
  let h1 = NaN, h2 = NaN, l1 = NaN, l2 = NaN, l1At = -Infinity;
  for (let i = 0; i < closes.length; i++) {
    const j = i - k;
    if (j >= k) {
      const left = closes.slice(j - k, j);
      const right = closes.slice(j + 1, j + k + 1);
      if (closes[j] > Math.max(...left) && closes[j] >= Math.max(...right)) { h2 = h1; h1 = closes[j]; }
      if (closes[j] < Math.min(...left) && closes[j] <= Math.min(...right)) { l2 = l1; l1 = closes[j]; l1At = j; }
    }
    out.push({ h1, h2, l1, l2, l1At });
  }
  return out;
}

function zAt(closes: number[], index: number) {
  const window = closes.slice(index - AVG + 1, index + 1);
  const average = mean(window);
  const deviation = Math.sqrt(mean(window.map((value) => (value - average) ** 2)));
  return deviation > 0 ? (closes[index] - average) / deviation : 0;
}

function simulate(markets: Record<string, Market>, mode: Mode, k: number, capital: number) {
  const symbols = Object.keys(markets);
  const bars = markets[symbols[0]].closes.length;
  const swings = mode === "bounce" ? {} : Object.fromEntries(symbols.map((symbol) => [symbol, swingsFor(markets[symbol].closes, k)]));
  let cash = capital;
  const positions = new Map<string, Position>();
  let closedTrades = 0, wins = 0, fundingPaid = 0, peak = capital, maxDrop = 0;

  const valueOf = (position: Position, price: number) => position.quantity * (2 * position.entry - price);
  const equityAt = (index: number) => cash + [...positions].reduce((sum, [symbol, position]) => sum + valueOf(position, markets[symbol].closes[index]), 0);
  const cover = (symbol: string, index: number) => {
    const position = positions.get(symbol)!;
    const price = markets[symbol].closes[index];
    const proceeds = valueOf(position, price) - position.quantity * price * COST;
    if (proceeds > position.quantity * position.entry) wins += 1;
    cash += proceeds;
    positions.delete(symbol);
    closedTrades += 1;
  };

  for (let index = WARMUP; index < bars; index++) {
    for (const [symbol, position] of positions) {
      const payment = position.quantity * markets[symbol].closes[index] * markets[symbol].funding[index];
      cash += payment;
      fundingPaid -= payment;
    }
    for (const [symbol, position] of [...positions]) {
      const closes = markets[symbol].closes;
      const price = closes[index];
      let exit = price >= position.entry * (1 + STOP);
      if (mode === "bounce") exit ||= zAt(closes, index) <= -0.5;
      else {
        // Trail the invalidation level down as newer, lower swing highs confirm.
        const s = swings[symbol][index];
        if (s.h1 < position.invalidate) position.invalidate = s.h1;
        exit ||= price > position.invalidate;
      }
      if (exit) cover(symbol, index);
    }
    if (positions.size === 0) {
      const candidates = symbols
        .filter((symbol) => !positions.has(symbol))
        .map((symbol) => {
          const closes = markets[symbol].closes;
          const price = closes[index];
          const trend = price / closes[index - WEEK] - 1;
          if (mode === "bounce") {
            const z = zAt(closes, index);
            const fast = price / closes[index - DAY] - 1;
            return { symbol, trend, invalidate: NaN, ok: trend <= -TREND && z >= 0.5 && z <= 2.5 && fast <= FAST_MAX };
          }
          const s = swings[symbol][index];
          const broke = price < s.l1 && closes[index - 1] >= s.l1 && index - s.l1At <= MAX_AGE;
          const ok = broke && s.h1 < s.h2 && price < s.h1 && (mode !== "lhll" || s.l1 < s.l2) && (mode !== "lh_trend" || trend <= -TREND);
          return { symbol, trend, invalidate: s.h1, ok };
        })
        .filter((row) => row.ok)
        .sort((a, b) => a.trend - b.trend);
      const pick = candidates[0];
      if (pick) {
        const price = markets[pick.symbol].closes[index];
        const amount = cash;
        cash -= amount;
        positions.set(pick.symbol, { quantity: (amount * (1 - COST)) / price, entry: price, invalidate: pick.invalidate });
      }
    }
    const equity = equityAt(index);
    peak = Math.max(peak, equity);
    maxDrop = Math.max(maxDrop, 1 - equity / peak);
  }
  return {
    returnPct: (equityAt(bars - 1) / capital - 1) * 100,
    trades: closedTrades,
    winPct: closedTrades ? (wins / closedTrades) * 100 : 0,
    fundingPct: (fundingPaid / capital) * 100,
    maxDropPct: maxDrop * 100,
  };
}

async function main() {
  const until = Number(process.env.UNTIL ?? Math.floor(Date.now() / BAR_MS) * BAR_MS);
  const allBars: number[] = [];
  for (let bar = FIRST_HOUR; bar < until; bar += BAR_MS) allBars.push(bar);

  const windows: [string, number, number][] = [
    ["fresh test", 6, 0],
    ["fold 3 (most recent)", 30, 6],
    ["fold 2", 30, 36],
    ["fold 1", 30, 66],
  ];
  console.log(`Lighter RH crypto perps (8), ${RESOLUTION} bars, short only, 1x, cost ${COST * 100}%, stop ${STOP * 100}%, swing half-width K in bars: ${KS.join(", ")} (1 hour = ${B} bars)`);
  for (const [label, days, endDaysAgo] of windows) {
    const endIndex = allBars.length - endDaysAgo * 24 * B;
    const bars = allBars.slice(endIndex - days * 24 * B - WARMUP, endIndex);
    const markets: Record<string, Market> = {};
    for (const [symbol, id] of Object.entries(MARKETS)) {
      const market = await loadMarketBars(id, RESOLUTION, BAR_MS, bars, until);
      if (market) markets[symbol] = market;
    }
    const symbols = Object.keys(markets);
    const hold = mean(symbols.map((symbol) => markets[symbol].closes[bars.length - 1] / markets[symbol].closes[WARMUP] - 1)) * 100;
    console.log(`\n== ${label}: ${days}d ending ${endDaysAgo}d ago, holding ${hold.toFixed(1)}%`);
    const runs: [Mode, number][] = [["bounce", 0], ...KS.flatMap((k) => (["lh", "lhll", "lh_trend"] as Mode[]).map((mode) => [mode, k] as [Mode, number]))];
    for (const [mode, k] of runs) {
      const run = simulate(markets, mode, k, 10_000);
      console.log(
        `  ${mode.padEnd(8)} ${mode === "bounce" ? "      " : `K ${String(k).padStart(2)} `} ${`${run.returnPct.toFixed(1)}%`.padStart(7)}  trades ${String(run.trades).padStart(3)}  wins ${run.winPct.toFixed(0).padStart(3)}%  funding ${run.fundingPct.toFixed(2)}%  worst drop ${run.maxDropPct.toFixed(1)}%`,
      );
    }
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
