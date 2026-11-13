/**
 * Research only (read-only, never writes to the database): an early short from market structure
 * on Lighter's 8 crypto perps (follow-up to scripts/research-short-trend.mts, 2026-11-13).
 *
 * Swing points come from hourly closes: a swing high (low) is a close that is the highest (lowest)
 * of the K hours either side. A pivot is only known K hours after it happened, so nothing looks ahead.
 *   Lower high (LH):  the latest swing high is below the one before it.
 *   Lower low (LL):   the latest swing low is below the one before it.
 *   Support:          the latest swing low (no older than MAX_AGE hours).
 * Entry (short only, one slot): the close breaks below support (the hour before it was at or above)
 *   lh        needs a lower high only  ("early": the first lower high, then the support break)
 *   lhll      needs a lower high and a lower low (a confirmed downtrend)
 *   lh_trend  lh, and the market is down more than TREND over 7 days
 * Exit: the close rises above the invalidation level (the lower high at entry, trailed down as newer,
 * lower swing highs form: a higher high breaks the structure), or the stop.
 *
 *   K=3,6 COSTS=0.0005 STOP=0.1 TREND=0.05 MAX_AGE=72 node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-short-structure.mts
 *
 * Data: scripts/lighter-history.mts (cached in LIGHTER_CACHE).
 */
import { FIRST_HOUR, HOUR_MS, loadMarket, type Market } from "./lighter-history.mts";

const WARMUP_HOURS = 168;
const MARKETS: Record<string, number> = { BTC: 1, ETH: 0, HYPE: 2, SOL: 3, ZEC: 4, LIT: 5, XRP: 6, NEAR: 7 };
const COST = Number(process.env.COSTS ?? 0.0005);
const STOPS = (process.env.STOP ?? "0.1").split(",").map(Number);
const KS = (process.env.K ?? "3,6").split(",").map(Number);
const TREND = Number(process.env.TREND ?? 0.05);
const MAX_AGE = Number(process.env.MAX_AGE ?? 72);

type Mode = "lh" | "lhll" | "lh_trend";
type Position = { quantity: number; entry: number; invalidate: number };
/** Latest and previous confirmed swing points at one hour; NaN while unknown. */
type Swings = { h1: number; h2: number; l1: number; l2: number; l1At: number };

/** Swing points known at every hour. */
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

function simulate(markets: Record<string, Market>, mode: Mode, k: number, stop: number, capital: number) {
  const symbols = Object.keys(markets);
  const hours = markets[symbols[0]].closes.length;
  const swings = Object.fromEntries(symbols.map((symbol) => [symbol, swingsFor(markets[symbol].closes, k)]));
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

  for (let index = WARMUP_HOURS; index < hours; index++) {
    for (const [symbol, position] of positions) {
      const payment = position.quantity * markets[symbol].closes[index] * markets[symbol].funding[index];
      cash += payment;
      fundingPaid -= payment;
    }
    for (const [symbol, position] of [...positions]) {
      const price = markets[symbol].closes[index];
      const swing = swings[symbol][index];
      // Trail the invalidation level down as newer, lower swing highs confirm.
      if (swing.h1 < position.invalidate) position.invalidate = swing.h1;
      if (price >= position.entry * (1 + stop) || price > position.invalidate) cover(symbol, index);
    }
    if (positions.size === 0) {
      const candidates = symbols
        .map((symbol) => {
          const closes = markets[symbol].closes;
          const s = swings[symbol][index];
          const lowerHigh = s.h1 < s.h2;
          const lowerLow = s.l1 < s.l2;
          const broke = closes[index] < s.l1 && closes[index - 1] >= s.l1 && index - s.l1At <= MAX_AGE;
          const trend = closes[index] / closes[index - 168] - 1;
          const ok = broke && lowerHigh && (mode !== "lhll" || lowerLow) && (mode !== "lh_trend" || trend <= -TREND) && closes[index] < s.h1;
          return { symbol, ok, trend, invalidate: s.h1 };
        })
        .filter((row) => row.ok && !positions.has(row.symbol))
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
    returnPct: (equityAt(hours - 1) / capital - 1) * 100,
    trades: closedTrades,
    winPct: closedTrades ? (wins / closedTrades) * 100 : 0,
    fundingPct: (fundingPaid / capital) * 100,
    maxDropPct: maxDrop * 100,
  };
}

async function main() {
  const until = Number(process.env.UNTIL ?? Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
  const allHours: number[] = [];
  for (let hour = FIRST_HOUR; hour < until; hour += HOUR_MS) allHours.push(hour);

  const windows: [string, number, number][] = [
    ["fresh test", 6, 0],
    ["fold 3 (most recent)", 30, 6],
    ["fold 2", 30, 36],
    ["fold 1", 30, 66],
  ];
  console.log(`Lighter RH crypto perps (8), short-only on a support break, 1x, cost ${COST * 100}%, swing half-width K in hours: ${KS.join(", ")}`);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  for (const [label, days, endDaysAgo] of windows) {
    const endIndex = allHours.length - endDaysAgo * 24;
    const hours = allHours.slice(endIndex - days * 24 - WARMUP_HOURS, endIndex);
    const markets: Record<string, Market> = {};
    for (const [symbol, id] of Object.entries(MARKETS)) {
      const market = await loadMarket(id, hours, until);
      if (market) markets[symbol] = market;
    }
    const symbols = Object.keys(markets);
    const hold = mean(symbols.map((symbol) => markets[symbol].closes[hours.length - 1] / markets[symbol].closes[WARMUP_HOURS] - 1)) * 100;
    console.log(`\n== ${label}: ${days}d ending ${endDaysAgo}d ago, holding ${hold.toFixed(1)}%`);
    for (const k of KS) {
      for (const stop of STOPS) {
        for (const mode of ["lh", "lhll", "lh_trend"] as Mode[]) {
          const run = simulate(markets, mode, k, stop, 10_000);
          console.log(
            `  K ${k} stop ${stop * 100}% ${mode.padEnd(8)} ${`${run.returnPct.toFixed(1)}%`.padStart(7)}  trades ${String(run.trades).padStart(3)}  wins ${run.winPct.toFixed(0).padStart(3)}%  funding ${run.fundingPct.toFixed(2)}%  worst drop ${run.maxDropPct.toFixed(1)}%`,
          );
        }
      }
    }
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
