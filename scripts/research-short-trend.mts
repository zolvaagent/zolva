/**
 * Research only (read-only, never writes to the database): would a short that follows a
 * falling market have paid on Lighter's 8 crypto perps? (Follow-up to docs/shorting-research.md
 * and docs/perps-research.md, 2026-11-13: after a sharp sell-off no agent was short, because
 * spike fade only shorts rises.)
 *
 * Two short-only rules, both gated by "the market is down more than TREND over 7 days":
 *   bounce:     short when price climbs back above its 48h average (z >= BOUNCE_Z), cover at
 *               z <= -0.5. "Sell the rally inside a downtrend".
 *   breakdown:  short when price closes below its lowest close of the last 72h, cover at
 *               z >= 0.5. Earlier research found trend shorts of this kind lost; kept as a baseline.
 * Same simulator shape as research-perps.mts: 1x, hourly funding (a positive rate moves money
 * from longs to shorts), cost per trade on open and close, one slot, the deepest-trend market first.
 *
 * Walk-forward windows (fixed by days before now; the 30 days to 2026-11-07 were already used by
 * the earlier search, so only the last ~6 days are fresh):
 *   fresh test (last 6d), then training folds 30d each: 6-36, 36-66, 66-96 days ago.
 *
 *   COSTS=0.0005 TREND=0.05 STOP=0.1 BOUNCE_Z=0.5 node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-short-trend.mts
 *
 * Data: scripts/lighter-history.mts (cached in LIGHTER_CACHE).
 */
import { FIRST_HOUR, HOUR_MS, loadMarket, type Market } from "./lighter-history.mts";

const WARMUP_HOURS = 168;
const MARKETS: Record<string, number> = { BTC: 1, ETH: 0, HYPE: 2, SOL: 3, ZEC: 4, LIT: 5, XRP: 6, NEAR: 7 };
const COSTS = (process.env.COSTS ?? "0.0005").split(",").map(Number);
const TREND = Number(process.env.TREND ?? 0.05);
const STOPS = (process.env.STOP ?? "0.05,0.1").split(",").map(Number);
const BOUNCE_Z = Number(process.env.BOUNCE_Z ?? 0.5);
const BREAKDOWN_HOURS = 72;
/** SLOTS=n holds up to n shorts at once (each an equal share of equity); 1 is the original single slot. */
const SLOTS = Number(process.env.SLOTS ?? 1);
/** Skip entries in a market that rose more than FAST_MAX over the last FAST_HOURS; off by default. */
const FAST_HOURS = Number(process.env.FAST_HOURS ?? 24);
const FAST_MAX = process.env.FAST_MAX ? Number(process.env.FAST_MAX) : Infinity;

/**
 * STRUCT_K=n (hours) adds market structure to bounce: enter only while the latest confirmed swing
 * high is lower than the one before it (a lower high) and the price is still below it; cover when the
 * close goes above that swing high (a higher high). Swing = highest close of n hours either side,
 * known n hours later. STRUCT_LL=1 also needs a lower swing low. Off when unset.
 */
const STRUCT_K = Number(process.env.STRUCT_K ?? 0);
const STRUCT_LL = process.env.STRUCT_LL === "1";

/**
 * LEVERAGE=n opens a position of n x the margin (the share of equity put in) and liquidates it when the
 * loss reaches 95% of the margin; the stop is a price distance, so STOP=0.03 at 10x risks 30% of the margin.
 * Checked on hourly closes only, so wicks inside an hour (real liquidations) are NOT modelled: results
 * at high leverage are optimistic. 1 (default) keeps the original accounting.
 */
const LEVERAGE = Number(process.env.LEVERAGE ?? 1);

type Rule = "bounce" | "breakdown";
type Position = { quantity: number; entry: number; invalidate?: number; margin: number };

/** Latest and previous confirmed swing highs and lows at every hour; NaN while unknown. */
function swingsFor(closes: number[], k: number) {
  const out: { h1: number; h2: number; l1: number; l2: number }[] = [];
  let h1 = NaN, h2 = NaN, l1 = NaN, l2 = NaN;
  for (let i = 0; i < closes.length; i++) {
    const j = i - k;
    if (j >= k) {
      const left = closes.slice(j - k, j);
      const right = closes.slice(j + 1, j + k + 1);
      if (closes[j] > Math.max(...left) && closes[j] >= Math.max(...right)) { h2 = h1; h1 = closes[j]; }
      if (closes[j] < Math.min(...left) && closes[j] <= Math.min(...right)) { l2 = l1; l1 = closes[j]; }
    }
    out.push({ h1, h2, l1, l2 });
  }
  return out;
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function stats(closes: number[], index: number) {
  const window = closes.slice(index - 47, index + 1);
  const average = mean(window);
  const deviation = Math.sqrt(mean(window.map((value) => (value - average) ** 2)));
  const lowest = Math.min(...closes.slice(index - BREAKDOWN_HOURS, index));
  return {
    price: closes[index],
    z: deviation > 0 ? (closes[index] - average) / deviation : 0,
    trend: closes[index] / closes[index - 168] - 1,
    brokeDown: closes[index] < lowest,
  };
}

function simulate(markets: Record<string, Market>, rule: Rule, cost: number, stop: number, capital: number) {
  const symbols = Object.keys(markets);
  const hours = markets[symbols[0]].closes.length;
  const swings = STRUCT_K ? Object.fromEntries(symbols.map((symbol) => [symbol, swingsFor(markets[symbol].closes, STRUCT_K)])) : {};
  let cash = capital;
  const positions = new Map<string, Position>();
  let closedTrades = 0;
  let wins = 0;
  let fundingPaid = 0;
  let peak = capital;
  let maxDrop = 0;

  // A short is worth quantity x (2 x entry - price), like the engine.
  const valueOf = (position: Position, price: number) =>
    LEVERAGE === 1 ? position.quantity * (2 * position.entry - price) : Math.max(0, position.margin + position.quantity * (position.entry - price));
  const equityAt = (index: number) => cash + [...positions].reduce((sum, [symbol, position]) => sum + valueOf(position, markets[symbol].closes[index]), 0);

  const cover = (symbol: string, index: number) => {
    const position = positions.get(symbol)!;
    const price = markets[symbol].closes[index];
    const proceeds = Math.max(0, valueOf(position, price) - position.quantity * price * cost);
    if (proceeds > (LEVERAGE === 1 ? position.quantity * position.entry : position.margin)) wins += 1;
    cash += proceeds;
    positions.delete(symbol);
    closedTrades += 1;
  };

  for (let index = WARMUP_HOURS; index < hours; index++) {
    for (const [symbol, position] of positions) {
      // Shorts receive funding when the rate is positive.
      const payment = position.quantity * markets[symbol].closes[index] * markets[symbol].funding[index];
      cash += payment;
      fundingPaid -= payment;
    }
    for (const [symbol, position] of [...positions]) {
      const { price, z } = stats(markets[symbol].closes, index);
      const stopped = price >= position.entry * (1 + stop) || (LEVERAGE > 1 && price >= position.entry * (1 + 0.95 / LEVERAGE));
      const done = rule === "bounce" ? z <= -0.5 : z >= 0.5;
      // Structure exit: a close above the lower high the short was opened under is a higher high.
      const broken = STRUCT_K && position.invalidate !== undefined && price > position.invalidate;
      if (stopped || done || broken) cover(symbol, index);
    }
    // Fill every free slot, deepest 7 day trend first. FAST_HOURS/FAST_MAX skip a market that
    // has already risen more than FAST_MAX over the last FAST_HOURS (a reversal rally).
    if (positions.size < SLOTS) {
      const candidates = symbols
        .filter((symbol) => !positions.has(symbol))
        .map((symbol) => ({ symbol, ...stats(markets[symbol].closes, index) }))
        .filter((row) => row.trend <= -TREND && (rule === "bounce" ? row.z >= BOUNCE_Z && row.z <= 2.5 : row.brokeDown))
        .filter((row) => markets[row.symbol].closes[index] / markets[row.symbol].closes[index - FAST_HOURS] - 1 <= FAST_MAX)
        .filter((row) => {
          if (!STRUCT_K) return true;
          const s = swings[row.symbol][index];
          return s.h1 < s.h2 && row.price < s.h1 && (!STRUCT_LL || s.l1 < s.l2);
        })
        .sort((a, b) => a.trend - b.trend);
      for (const pick of candidates) {
        if (positions.size >= SLOTS) break;
        const amount = Math.min(cash, equityAt(index) / SLOTS);
        if (amount < capital * 0.01) break;
        const price = markets[pick.symbol].closes[index];
        cash -= amount;
        const notional = amount * LEVERAGE;
        positions.set(pick.symbol, {
          quantity: LEVERAGE === 1 ? (amount * (1 - cost)) / price : notional / price,
          entry: price,
          margin: amount - notional * cost,
          invalidate: STRUCT_K ? swings[pick.symbol][index].h1 : undefined,
        });
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
  const totalDays = Math.floor((allHours.length - WARMUP_HOURS) / 24);

  const windows: [string, number, number][] = [
    ["fresh test", 6, 0],
    ["fold 3 (most recent)", 30, 6],
    ["fold 2", 30, 36],
    ["fold 1", 30, 66],
  ];
  console.log(`Lighter RH crypto perps (8), short-only, 1x, trend gate ${TREND * 100}% over 7d, bounce z >= ${BOUNCE_Z}, ${totalDays} days of history after warm-up`);
  for (const [label, days, endDaysAgo] of windows) {
    const endIndex = allHours.length - endDaysAgo * 24;
    const startIndex = endIndex - days * 24 - WARMUP_HOURS;
    if (startIndex < 0) {
      console.log(`\n== ${label}: not enough history`);
      continue;
    }
    const hours = allHours.slice(startIndex, endIndex);
    const markets: Record<string, Market> = {};
    for (const [symbol, id] of Object.entries(MARKETS)) {
      const market = await loadMarket(id, hours, until);
      if (market) markets[symbol] = market;
    }
    const symbols = Object.keys(markets);
    const hold = mean(symbols.map((symbol) => markets[symbol].closes[hours.length - 1] / markets[symbol].closes[WARMUP_HOURS] - 1)) * 100;
    console.log(`\n== ${label}: ${days}d ending ${endDaysAgo}d ago, ${symbols.length} markets, holding ${hold.toFixed(1)}%`);
    for (const cost of COSTS) {
      for (const stop of STOPS) {
        for (const rule of ["bounce", "breakdown"] as Rule[]) {
          const run = simulate(markets, rule, cost, stop, 10_000);
          console.log(
            `  cost ${(cost * 100).toFixed(2)}% stop ${stop * 100}% ${rule.padEnd(9)} ${`${run.returnPct.toFixed(1)}%`.padStart(7)}  trades ${String(run.trades).padStart(3)}  wins ${run.winPct.toFixed(0).padStart(3)}%  funding ${run.fundingPct.toFixed(2)}%  worst drop ${run.maxDropPct.toFixed(1)}%`,
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
