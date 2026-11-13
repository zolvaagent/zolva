/**
 * Research only (read-only, never writes to the database): which strategy pays in which market
 * regime? (2026-11-13, goal in docs/perps-research.md "Strategy by regime".)
 *
 * Regime of an hour, fixed BEFORE looking at results and using only data up to that hour. The market is
 * the equal-weight basket of the 8 Lighter crypto perps:
 *   SHOCK  hourly volatility of the basket over the last 48 hours >= SHOCK_VOL (default 0.8%)
 *   UP     else the basket is up SIDE or more over 7 days (default +5%)
 *   DOWN   else the basket is down SIDE or more over 7 days
 *   RANGE  otherwise
 * Each strategy runs once over the whole history (its state carries on across regimes), 1x, one slot per
 * side, cost on open and close, real hourly funding, 10% stop. The return of hour i is credited to the regime
 * label of hour i-1 (the exposure held during hour i was decided at the close of hour i-1).
 *
 *   SIDE=0.05 SHOCK_VOL=0.008 COSTS=0.0005 UNTIL=<ms> node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-regime-matrix.mts
 *
 * Data: scripts/lighter-history.mts (cached in LIGHTER_CACHE).
 */
import { BINANCE_FIRST_HOUR, BINANCE_SYMBOLS, loadBinanceMarket } from "./binance-history.mts";
import { FIRST_HOUR, HOUR_MS, loadMarket, type Market } from "./lighter-history.mts";

/** DATA=binance runs the same rules on 6 coins of Binance spot hourly closes (2020-08 on, no funding); UNTIL=<ms> cuts the end. */
const BINANCE = process.env.DATA === "binance";

const WARMUP = 168;
const MARKETS: Record<string, number> = { BTC: 1, ETH: 0, HYPE: 2, SOL: 3, ZEC: 4, LIT: 5, XRP: 6, NEAR: 7 };
const COST = Number(process.env.COSTS ?? 0.0005);
const STOP = Number(process.env.STOP ?? 0.1);
const SIDE = Number(process.env.SIDE ?? 0.05);
const SHOCK_VOL = Number(process.env.SHOCK_VOL ?? 0.008);
const REGIMES = ["UP", "RANGE", "DOWN", "SHOCK"] as const;
type Regime = (typeof REGIMES)[number];
type Side = "long" | "short";
type Position = { side: Side; quantity: number; entry: number; openedAt: number };

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const std = (values: number[]) => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
};

/** Per market and hour indicators, computed on demand from closes only (no look-ahead). */
function makeStats(closes: number[]) {
  return (i: number) => {
    const w48 = closes.slice(i - 47, i + 1);
    const avg = mean(w48);
    const sd = std(w48);
    return {
      price: closes[i],
      avg48: avg,
      z: sd > 0 ? (closes[i] - avg) / sd : 0,
      trend: closes[i] / closes[i - 168] - 1,
      change24: closes[i] / closes[i - 24] - 1,
      high72: Math.max(...closes.slice(i - 72, i)),
      low24: Math.min(...closes.slice(i - 24, i)),
    };
  };
}
type Stats = ReturnType<ReturnType<typeof makeStats>>;
/** basketWeek is the basket's 7 day move at that hour (the regime input). */
type Row = { symbol: string; basketWeek: number } & Stats;

/** A strategy decides entries for the free slots and exits for the open positions. */
type Strategy = {
  name: string;
  slots: { long: number; short: number };
  /** Candidate markets for a new position on `side`, best first. */
  entries: (side: Side, rows: Row[]) => Row[];
  exits: (position: Position, row: Row) => boolean;
};

const STRATEGIES: Strategy[] = [
  {
    name: "bounce_short",
    slots: { long: 0, short: 1 },
    entries: (_side, rows) => rows.filter((r) => r.trend <= -0.05 && r.z >= 0.5 && r.z <= 2.5 && r.change24 <= 0.015).sort((a, b) => a.trend - b.trend),
    exits: (_p, r) => r.z <= -0.5,
  },
  {
    name: "spike_fade_short",
    slots: { long: 0, short: 1 },
    entries: (_side, rows) => rows.filter((r) => r.z > 2.5).sort((a, b) => b.z - a.z),
    exits: (_p, r) => r.z <= -0.5,
  },
  {
    name: "dip_long",
    slots: { long: 1, short: 0 },
    entries: (_side, rows) => rows.filter((r) => r.z < -2.5).sort((a, b) => a.z - b.z),
    exits: (_p, r) => r.z >= 0.5,
  },
  {
    name: "dip_fade_filtered",
    slots: { long: 1, short: 1 },
    entries: (side, rows) =>
      side === "long"
        ? rows.filter((r) => r.z < -2.5 && r.trend >= -0.05).sort((a, b) => a.z - b.z)
        : rows.filter((r) => r.z > 2.5 && r.trend <= 0.05).sort((a, b) => b.z - a.z),
    exits: (p, r) => (p.side === "long" ? r.z >= 0.5 : r.z <= -0.5),
  },
  {
    name: "momentum_long",
    slots: { long: 1, short: 0 },
    entries: (_side, rows) => rows.filter((r) => r.price > r.avg48 && r.change24 > 0.03).sort((a, b) => b.change24 - a.change24),
    exits: (_p, r) => r.price < r.avg48 * 0.97,
  },
  // Momentum gated to rising markets. mom_assetN: this asset is up N% or more over 7 days; mom_basket5: the
  // basket is up 5% or more over 7 days; mom_both5: both; mom_asset5_x: asset gate 5% and also exit once the
  // asset's own 7 day move turns negative.
  ...[3, 5, 8].map((pct) => ({
    name: `mom_asset${pct}`,
    slots: { long: 1, short: 0 },
    entries: (_side: Side, rows: Row[]) => rows.filter((r) => r.price > r.avg48 && r.change24 > 0.03 && r.trend >= pct / 100).sort((a, b) => b.change24 - a.change24),
    exits: (_p: Position, r: Row) => r.price < r.avg48 * 0.97,
  })),
  ...[3, 8].map((pct) => ({
    name: `mom_basket${pct}`,
    slots: { long: 1, short: 0 },
    entries: (_side: Side, rows: Row[]) => rows.filter((r) => r.price > r.avg48 && r.change24 > 0.03 && r.basketWeek >= pct / 100).sort((a, b) => b.change24 - a.change24),
    exits: (_p: Position, r: Row) => r.price < r.avg48 * 0.97,
  })),
  {
    name: "mom_basket5",
    slots: { long: 1, short: 0 },
    entries: (_side, rows) => rows.filter((r) => r.price > r.avg48 && r.change24 > 0.03 && r.basketWeek >= 0.05).sort((a, b) => b.change24 - a.change24),
    exits: (_p, r) => r.price < r.avg48 * 0.97,
  },
  {
    name: "mom_both5",
    slots: { long: 1, short: 0 },
    entries: (_side, rows) => rows.filter((r) => r.price > r.avg48 && r.change24 > 0.03 && r.trend >= 0.05 && r.basketWeek >= 0.05).sort((a, b) => b.change24 - a.change24),
    exits: (_p, r) => r.price < r.avg48 * 0.97,
  },
  {
    name: "mom_asset5_x",
    slots: { long: 1, short: 0 },
    entries: (_side, rows) => rows.filter((r) => r.price > r.avg48 && r.change24 > 0.03 && r.trend >= 0.05).sort((a, b) => b.change24 - a.change24),
    exits: (_p, r) => r.price < r.avg48 * 0.97 || r.trend < 0,
  },
  {
    name: "breakout_long",
    slots: { long: 1, short: 0 },
    entries: (_side, rows) => rows.filter((r) => r.price > r.high72).sort((a, b) => b.price / b.high72 - a.price / a.high72),
    exits: (_p, r) => r.price < r.low24,
  },
  {
    name: "breakdown_short",
    slots: { long: 0, short: 1 },
    entries: (_side, rows) => rows.filter((r) => r.price < Math.min(r.low24, r.avg48 * 0.98)).sort((a, b) => a.z - b.z),
    exits: (_p, r) => r.z >= 0.5,
  },
];

type Result = { curve: number[]; entries: { index: number; side: Side }[]; wins: number; closed: number };

function run(strategy: Strategy, markets: Record<string, Market>, stats: Record<string, (i: number) => Stats>, hours: number, basketWeek: number[]): Result {
  const symbols = Object.keys(markets);
  const slotCount = strategy.slots.long + strategy.slots.short;
  let cash = 10_000;
  const positions = new Map<string, Position>();
  const entries: Result["entries"] = [];
  let wins = 0;
  let closed = 0;
  const valueOf = (p: Position, price: number) => (p.side === "long" ? p.quantity * price : p.quantity * (2 * p.entry - price));
  const equityAt = (i: number) => cash + [...positions].reduce((sum, [s, p]) => sum + valueOf(p, markets[s].closes[i]), 0);
  const curve: number[] = new Array(hours).fill(NaN);

  for (let i = WARMUP; i < hours; i++) {
    for (const [symbol, p] of positions) {
      const payment = p.quantity * markets[symbol].closes[i] * markets[symbol].funding[i];
      cash += p.side === "short" ? payment : -payment;
    }
    for (const [symbol, p] of [...positions]) {
      const row = { symbol, basketWeek: basketWeek[i], ...stats[symbol](i) };
      const stopped = p.side === "long" ? row.price <= p.entry * (1 - STOP) : row.price >= p.entry * (1 + STOP);
      if (stopped || strategy.exits(p, row)) {
        const proceeds = valueOf(p, row.price) - p.quantity * row.price * COST;
        if (proceeds > p.quantity * p.entry) wins += 1;
        closed += 1;
        cash += proceeds;
        positions.delete(symbol);
      }
    }
    const free = symbols.filter((s) => !positions.has(s)).map((s) => ({ symbol: s, basketWeek: basketWeek[i], ...stats[s](i) }));
    for (const side of ["long", "short"] as Side[]) {
      const used = [...positions.values()].filter((p) => p.side === side).length;
      if (used >= strategy.slots[side]) continue;
      const pick = strategy.entries(side, free).find((r) => !positions.has(r.symbol));
      if (!pick) continue;
      const amount = Math.min(cash, equityAt(i) / slotCount);
      if (amount < 100) continue;
      cash -= amount;
      positions.set(pick.symbol, { side, quantity: (amount * (1 - COST)) / pick.price, entry: pick.price, openedAt: i });
      entries.push({ index: i, side });
      free.splice(free.findIndex((r) => r.symbol === pick.symbol), 1);
    }
    curve[i] = equityAt(i);
  }
  return { curve, entries, wins, closed };
}

async function main() {
  const until = Number(process.env.UNTIL ?? Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
  const hours: number[] = [];
  const first = BINANCE ? Number(process.env.FROM ?? BINANCE_FIRST_HOUR) : FIRST_HOUR;
  for (let h = first; h < until; h += HOUR_MS) hours.push(h);
  const markets: Record<string, Market> = {};
  if (BINANCE) {
    for (const [symbol, binanceSymbol] of Object.entries(BINANCE_SYMBOLS)) {
      const closes = await loadBinanceMarket(binanceSymbol, hours, until);
      if (closes) markets[symbol] = { closes, funding: closes.map(() => 0) };
    }
  } else {
    for (const [symbol, id] of Object.entries(MARKETS)) {
      const market = await loadMarket(id, hours, until);
      if (market) markets[symbol] = market;
    }
  }
  const symbols = Object.keys(markets);
  const n = hours.length;
  const stats = Object.fromEntries(symbols.map((s) => [s, makeStats(markets[s].closes)]));

  // Regime label of each hour, from the basket only and data up to that hour.
  // Equal-weight index, rebalanced every hour: it compounds the average hourly return of the markets, so no single
  // coin that rose 50x can dominate it (an average of normalised prices would).
  const basket: number[] = [1];
  for (let i = 1; i < n; i++) basket.push(basket[i - 1] * (1 + mean(symbols.map((s) => markets[s].closes[i] / markets[s].closes[i - 1] - 1))));
  const label: (Regime | null)[] = Array.from({ length: n }, (_, i) => {
    if (i < WARMUP) return null;
    const rets = Array.from({ length: 48 }, (_, k) => basket[i - k] / basket[i - k - 1] - 1);
    if (std(rets) >= SHOCK_VOL) return "SHOCK";
    const week = basket[i] / basket[i - 168] - 1;
    return week >= SIDE ? "UP" : week <= -SIDE ? "DOWN" : "RANGE";
  });
  const counts = Object.fromEntries(REGIMES.map((r) => [r, label.filter((l) => l === r).length]));
  const total = n - WARMUP;
  console.log(`Lighter RH crypto perps (${symbols.length}), ${hours.length} hours from ${new Date(first).toISOString().slice(0, 10)} to ${new Date(until).toISOString().slice(0, 13)}Z, ${total} hours after warm-up`);
  console.log(`Regimes (basket 7d move +/-${SIDE * 100}%, shock = 48h hourly vol >= ${SHOCK_VOL * 100}%): ` + REGIMES.map((r) => `${r} ${counts[r]} h (${((counts[r] / total) * 100).toFixed(0)}%)`).join(", "));

  const regimeReturn = (curve: number[]) => {
    const out: Record<string, { ret: number; maxDrop: number }> = {};
    for (const r of REGIMES) {
      let level = 1;
      let peak = 1;
      let maxDrop = 0;
      for (let i = WARMUP + 1; i < n; i++) {
        if (label[i - 1] !== r) continue;
        level *= curve[i] / curve[i - 1];
        peak = Math.max(peak, level);
        maxDrop = Math.max(maxDrop, 1 - level / peak);
      }
      out[r] = { ret: (level - 1) * 100, maxDrop: maxDrop * 100 };
    }
    return out;
  };

  const basketWeek = basket.map((v, i) => (i >= 168 ? v / basket[i - 168] - 1 : 0));
  // STRATS=name,name limits the table to those rules.
  const only = process.env.STRATS ? process.env.STRATS.split(",") : null;
  const half = Math.floor((WARMUP + n) / 2);
  // Holding the basket, for the same hours.
  const holdCurve = basket.map((v) => v * 10_000);
  const hold = regimeReturn(holdCurve);
  const header = "strategy".padEnd(20) + REGIMES.map((r) => r.padStart(22)).join("") + "   whole period";
  console.log("\n" + header);
  console.log("cell = return in the regime's hours | entries | worst drop  (* = fewer than 5 entries)");
  console.log("hold basket".padEnd(20) + REGIMES.map((r) => `${hold[r].ret.toFixed(1)}%`.padStart(22)).join("") + `   ${((holdCurve[n - 1] / holdCurve[WARMUP] - 1) * 100).toFixed(1)}%`);
  console.log("\nwhole-period return split in two halves (first half | second half), a stability check");
  const yearly: { name: string; curve: number[] }[] = [];
  for (const strategy of STRATEGIES.filter((s) => !only || only.includes(s.name))) {
    const result = run(strategy, markets, stats, n, basketWeek);
    yearly.push({ name: strategy.name, curve: result.curve });
    const byRegime = regimeReturn(result.curve);
    const cells = REGIMES.map((r) => {
      const count = result.entries.filter((e) => label[e.index - 1] === r || (label[e.index] === r && label[e.index - 1] == null)).length;
      const cell = `${byRegime[r].ret.toFixed(1)}% | ${count}${count < 5 ? "*" : ""} | ${byRegime[r].maxDrop.toFixed(0)}%`;
      return cell.padStart(22);
    }).join("");
    const whole = ((result.curve[n - 1] / result.curve[WARMUP] - 1) * 100).toFixed(1);
    const firstHalf = ((result.curve[half] / result.curve[WARMUP] - 1) * 100).toFixed(1);
    const secondHalf = ((result.curve[n - 1] / result.curve[half] - 1) * 100).toFixed(1);
    console.log(strategy.name.padEnd(20) + cells + `   ${whole}% (${result.closed} closed, ${result.closed ? ((result.wins / result.closed) * 100).toFixed(0) : 0}% won) | halves ${firstHalf}% | ${secondHalf}%`);
  }
  if (process.env.YEARLY) {
    const years = [...new Set(hours.map((h) => new Date(h).getUTCFullYear()))];
    const yearReturn = (curve: number[], year: number) => {
      const idx = hours.map((h, i) => [h, i] as const).filter(([h, i]) => i >= WARMUP && new Date(h).getUTCFullYear() === year).map(([, i]) => i);
      return idx.length > 24 ? ((curve[idx[idx.length - 1]] / curve[idx[0] - 1] - 1) * 100).toFixed(0) + "%" : "-";
    };
    console.log("\nreturn by calendar year (the first and last year are partial)");
    console.log("strategy".padEnd(20) + years.map((y) => String(y).padStart(9)).join(""));
    console.log("hold index".padEnd(20) + years.map((y) => yearReturn(holdCurve, y).padStart(9)).join(""));
    for (const entry of yearly) console.log(entry.name.padEnd(20) + years.map((y) => yearReturn(entry.curve, y).padStart(9)).join(""));
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
