/**
 * Research only (read-only, never writes to the database): would our strategies pay on
 * Lighter's perps on Robinhood Chain (docs/perps-research.md)? Uses Lighter RH's public
 * hourly candles and hourly funding, 1x positions (no leverage), a 10% stop, and a cost
 * per trade on open and close.
 *
 *   Dip long:     buy the deepest dip (z < -2.5 against the 48h average), sell at z >= 0.5.
 *   Spike fade:   short the highest spike (z > 2.5), cover at z <= -0.5.
 *   Dip + fade:   both, one slot each.
 *   Swing:        one slot, either side: the most extreme market beyond |z| 2.5.
 *   Swing 1h/2h:  Swing's entries, but every position closes after 1 or 2 hours (a scalp).
 *
 * TREND_FILTER=0.05 adds a trend filter to every entry: no short while the market is up more
 * than 5% over the last 7 days, no long while it is down more than 5%.
 *
 * Funding: Lighter pays it every hour; the API's `rate` is in percent and a positive rate
 * (direction "long") means longs pay shorts (docs.lighter.xyz/trading/funding).
 *
 *   PERPS_GROUP=crypto|stocks COSTS=0,0.0005 [TREND_FILTER=0.05] [STRATEGIES=swing,dip_and_fade] [WINDOWS=30:0,30:30] node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-perps.mts
 *
 * Data: scripts/lighter-history.mts (cached in LIGHTER_CACHE).
 */
import { FIRST_HOUR, HOUR_MS, loadMarket, type Market } from "./lighter-history.mts";

const WARMUP_HOURS = 168;
const STOP = 0.1;

/** Lighter RH market ids (orderBookDetails, 2026-11-07). */
const GROUPS: Record<string, Record<string, number>> = {
  crypto: { BTC: 1, ETH: 0, SOL: 3 },
  // The five other crypto perps Zolva lists (2026-11-11), and all eight together.
  alts: { HYPE: 2, ZEC: 4, LIT: 5, XRP: 6, NEAR: 7 },
  crypto8: { BTC: 1, ETH: 0, HYPE: 2, SOL: 3, ZEC: 4, LIT: 5, XRP: 6, NEAR: 7 },
  stocks: {
    SPY: 26, QQQ: 25, NVDA: 15, TSLA: 16, PLTR: 34, CRCL: 24, SPCX: 18, AAPL: 10,
    MSFT: 14, GOOGL: 12, AMZN: 11, META: 13, COIN: 23, AMD: 29, MU: 31,
  },
};
const GROUP = process.env.PERPS_GROUP ?? "crypto";
const COSTS = (process.env.COSTS ?? "0,0.0005").split(",").map(Number);
/** 7 day move beyond which entries against the trend are skipped; off when unset. */
const TREND_FILTER = process.env.TREND_FILTER ? Number(process.env.TREND_FILTER) : Infinity;
const STRATEGIES = (process.env.STRATEGIES ?? "dip_long,spike_fade,dip_and_fade,swing,swing_1h,swing_2h").split(",");

type Side = "long" | "short";
type Position = { side: Side; quantity: number; entry: number; openedAt: number };
type Strategy = "dip_long" | "spike_fade" | "dip_and_fade" | "swing" | "swing_1h" | "swing_2h";

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function stats(closes: number[], index: number) {
  const window = closes.slice(index - 47, index + 1);
  const average = mean(window);
  const deviation = Math.sqrt(mean(window.map((value) => (value - average) ** 2)));
  // trend: the move over the last 7 days (the warm-up guarantees 168 hours of history).
  return { price: closes[index], z: deviation > 0 ? (closes[index] - average) / deviation : 0, trend: closes[index] / closes[index - 168] - 1 };
}

function simulate(markets: Record<string, Market>, strategy: Strategy, cost: number, capital: number) {
  const symbols = Object.keys(markets);
  const hours = markets[symbols[0]].closes.length;
  const slots = strategy === "dip_and_fade" ? 2 : 1;
  const holdLimit = strategy === "swing_1h" ? 1 : strategy === "swing_2h" ? 2 : Infinity;
  let cash = capital;
  const positions = new Map<string, Position>();
  let trades = 0;
  let wins = 0;
  let fundingPaid = 0;
  let peak = capital;
  let maxDrop = 0;

  const valueOf = (position: Position, price: number) =>
    position.side === "long" ? position.quantity * price : position.quantity * (2 * position.entry - price);
  const equityAt = (index: number) => cash + [...positions].reduce((sum, [symbol, position]) => sum + valueOf(position, markets[symbol].closes[index]), 0);

  const close = (symbol: string, index: number) => {
    const position = positions.get(symbol)!;
    const price = markets[symbol].closes[index];
    const proceeds = valueOf(position, price) - position.quantity * price * cost;
    if (proceeds > position.quantity * position.entry) wins += 1;
    cash += proceeds;
    positions.delete(symbol);
    trades += 1;
  };
  const open = (symbol: string, index: number, side: Side) => {
    const amount = Math.min(cash, equityAt(index) / slots);
    if (amount < capital * 0.01) return;
    const price = markets[symbol].closes[index];
    cash -= amount;
    positions.set(symbol, { side, quantity: (amount * (1 - cost)) / price, entry: price, openedAt: index });
    trades += 1;
  };

  for (let index = WARMUP_HOURS; index < hours; index++) {
    // Hourly funding: a positive rate moves money from longs to shorts.
    for (const [symbol, position] of positions) {
      const payment = position.quantity * markets[symbol].closes[index] * markets[symbol].funding[index];
      const paid = position.side === "long" ? payment : -payment;
      cash -= paid;
      fundingPaid += paid;
    }
    for (const [symbol, position] of [...positions]) {
      const { price, z } = stats(markets[symbol].closes, index);
      const stopped = position.side === "long" ? price <= position.entry * (1 - STOP) : price >= position.entry * (1 + STOP);
      const exit = index - position.openedAt >= holdLimit || (holdLimit === Infinity && (position.side === "long" ? z >= 0.5 : z <= -0.5));
      if (stopped || exit) close(symbol, index);
    }
    const free = symbols.filter((symbol) => !positions.has(symbol)).map((symbol) => ({ symbol, ...stats(markets[symbol].closes, index) }));
    const shortable = (row: { trend: number }) => row.trend <= TREND_FILTER;
    const longable = (row: { trend: number }) => row.trend >= -TREND_FILTER;
    const holds = (side: Side) => [...positions.values()].some((position) => position.side === side);
    if ((strategy === "spike_fade" || strategy === "dip_and_fade") && !holds("short")) {
      const pick = free.filter((row) => row.z > 2.5 && shortable(row)).sort((a, b) => b.z - a.z)[0];
      if (pick) open(pick.symbol, index, "short");
    }
    if ((strategy === "dip_long" || strategy === "dip_and_fade") && !holds("long")) {
      const pick = free.filter((row) => row.z < -2.5 && longable(row)).sort((a, b) => a.z - b.z)[0];
      if (pick) open(pick.symbol, index, "long");
    }
    if (strategy.startsWith("swing") && positions.size === 0) {
      const pick = free
        .filter((row) => (row.z > 2.5 && shortable(row)) || (row.z < -2.5 && longable(row)))
        .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];
      if (pick) open(pick.symbol, index, pick.z < 0 ? "long" : "short");
    }
    const equity = equityAt(index);
    peak = Math.max(peak, equity);
    maxDrop = Math.max(maxDrop, 1 - equity / peak);
  }
  const closedTrades = Math.floor(trades / 2);
  return {
    returnPct: (equityAt(hours - 1) / capital - 1) * 100,
    trades: closedTrades,
    winPct: closedTrades ? (wins / closedTrades) * 100 : 0,
    fundingPct: (fundingPaid / capital) * 100,
    maxDropPct: maxDrop * 100,
  };
}

async function main() {
  const ids = GROUPS[GROUP];
  if (!ids) throw new Error(`PERPS_GROUP must be one of ${Object.keys(GROUPS).join(", ")}`);
  const until = Number(process.env.UNTIL ?? Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
  const allHours: number[] = [];
  for (let hour = FIRST_HOUR; hour < until; hour += HOUR_MS) allHours.push(hour);
  const totalDays = Math.floor((allHours.length - WARMUP_HOURS) / 24);

  const windows = process.env.WINDOWS
    ? process.env.WINDOWS.split(",").map((pair) => pair.split(":").map(Number) as [number, number])
    : [[totalDays, 0], [30, 0], [30, 30], [30, 60], [totalDays - 90, 90]] as [number, number][];

  console.log(`Lighter RH perps, group ${GROUP}, 1x, stop ${STOP * 100}%, trend filter ${TREND_FILTER === Infinity ? "off" : `${TREND_FILTER * 100}%`}, history from ${new Date(FIRST_HOUR).toISOString().slice(0, 10)} (${totalDays} days after warm-up)`);
  for (const [days, endDaysAgo] of windows) {
    const endIndex = allHours.length - endDaysAgo * 24;
    const hours = allHours.slice(Math.max(0, endIndex - days * 24 - WARMUP_HOURS), endIndex);
    const markets: Record<string, Market> = {};
    for (const [symbol, id] of Object.entries(ids)) {
      const market = await loadMarket(id, hours, until);
      if (market) markets[symbol] = market;
    }
    const symbols = Object.keys(markets);
    const last = hours.length - 1;
    const hold = mean(symbols.map((symbol) => markets[symbol].closes[last] / markets[symbol].closes[WARMUP_HOURS] - 1)) * 100;
    console.log(`\n== ${days}d ending ${endDaysAgo}d ago, ${symbols.length} markets (${symbols.join(" ")}): holding ${hold.toFixed(1)}%`);
    for (const cost of COSTS) {
      console.log(`  cost ${(cost * 100).toFixed(2)}% per trade`);
      for (const strategy of STRATEGIES as Strategy[]) {
        const run = simulate(markets, strategy, cost, 10_000);
        console.log(
          `    ${strategy.padEnd(13)} ${`${run.returnPct.toFixed(1)}%`.padStart(7)}  trades ${String(run.trades).padStart(3)}  wins ${run.winPct.toFixed(0).padStart(3)}%  funding ${run.fundingPct.toFixed(2)}%  worst drop ${run.maxDropPct.toFixed(1)}%`,
        );
      }
    }
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
