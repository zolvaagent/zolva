/**
 * Research only (read-only): search many simple trading rules on Lighter RH perps without
 * fooling ourselves (docs/perps-research.md, "Rule search").
 *
 * 1. The last TEST_DAYS days are held out. The search never looks at them.
 * 2. Every rule runs on the training period, split into 3 folds. A rule passes when all 3
 *    folds are positive, its training worst drop is at most MAX_DROP, and it trades at
 *    least MIN_TRADES times.
 * 3. A passing rule must be robust: at least 75% of its neighbours (one setting one step
 *    away) must also be positive in training with no fold below -1%.
 * 4. Up to 3 robust rules are chosen from training results alone and printed. Only then
 *    are those 3 run on the held-out days, once.
 *
 * Rule families, all 1x (no leverage). Each market gets an equal share of the agent (one
 * Lighter sub-account per market), a stop, a cost per trade and real hourly funding:
 *   mr     mean reversion: fade |z| > k against an L hour average, exit when z crosses e,
 *          optional trend filter (skip entries against a T hour move larger than tf)
 *   don    breakout: enter on a new N hour high or low, exit on an exit-window low or high
 *   ma     moving average cross: long while the fast average is above the slow one
 *   tsm    time series momentum: long after an lb hour rise above th, short after a fall
 *
 * The held-out days run only with HOLDOUT=1, so checking the training output while fixing
 * the script never peeks at them.
 *
 *   [UNTIL=1794042000000] [COST=0.0005] [HOLDOUT=1] node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-perps-search.mts
 */
import { FIRST_HOUR, HOUR_MS, loadMarket, type Market } from "./lighter-history.mts";

const UNTIL = Number(process.env.UNTIL ?? 1794042000000); // 2026-11-07 09:00 UTC, the cached data's end
const COST = Number(process.env.COST ?? 0.0005);
const WARMUP = 336;
const TEST_DAYS = 30;
const MAX_DROP = 0.1;
const MIN_TRADES = 15;

/** Lighter RH market ids (orderBookDetails, 2026-11-07). */
const UNIVERSES: Record<string, Record<string, number>> = {
  crypto3: { BTC: 1, ETH: 0, SOL: 3 },
  crypto5: { BTC: 1, ETH: 0, SOL: 3, HYPE: 2, XRP: 6 },
  metals: { XAU: 40, XAG: 41 },
  index: { SPY: 26, QQQ: 25 },
  stocks: {
    SPY: 26, QQQ: 25, NVDA: 15, TSLA: 16, PLTR: 34, CRCL: 24, SPCX: 18, AAPL: 10,
    MSFT: 14, GOOGL: 12, AMZN: 11, META: 13, COIN: 23, AMD: 29, MU: 31,
  },
};

type SideRule = "long" | "short" | "both";
type Rule = { family: "mr" | "don" | "ma" | "tsm"; params: Record<string, number>; side: SideRule; stop: number };

/** Ordered settings per family; neighbours are one step apart in one setting. */
const GRID = {
  mr: { L: [24, 48, 96], k: [2, 2.5, 3], e: [0, 0.5], tf: [Infinity, 0.12, 0.08, 0.05, 0.03], T: [72, 168] },
  don: { N: [24, 48, 96, 168], exit: [0.5, 1] },
  ma: { pair: [0, 1, 2, 3] }, // index into MA_PAIRS
  tsm: { lb: [24, 72, 168, 336], th: [0, 0.02, 0.05] },
} as const;
const MA_PAIRS = [[12, 48], [24, 96], [24, 168], [48, 168]];
const SIDES: SideRule[] = ["long", "short", "both"];
const STOPS = [0.05, 0.1];

type Prepared = {
  close: Float64Array;
  funding: number[];
  z: Record<number, Float64Array>;
  ret: Record<number, Float64Array>;
  high: Record<number, Float64Array>; // highest close over the previous N hours (not counting this one)
  low: Record<number, Float64Array>;
  ma: Record<number, Float64Array>;
};

function prepare(market: Market): Prepared {
  const close = Float64Array.from(market.closes);
  const n = close.length;
  const z: Prepared["z"] = {};
  for (const L of GRID.mr.L) {
    const out = new Float64Array(n);
    for (let i = L; i < n; i++) {
      let sum = 0;
      for (let j = i - L + 1; j <= i; j++) sum += close[j];
      const average = sum / L;
      let squares = 0;
      for (let j = i - L + 1; j <= i; j++) squares += (close[j] - average) ** 2;
      const deviation = Math.sqrt(squares / L);
      out[i] = deviation > 0 ? (close[i] - average) / deviation : 0;
    }
    z[L] = out;
  }
  const ret: Prepared["ret"] = {};
  for (const T of new Set([...GRID.mr.T, ...GRID.tsm.lb])) {
    const out = new Float64Array(n);
    for (let i = T; i < n; i++) out[i] = close[i] / close[i - T] - 1;
    ret[T] = out;
  }
  const high: Prepared["high"] = {};
  const low: Prepared["low"] = {};
  for (const N of new Set(GRID.don.N.flatMap((N) => GRID.don.exit.map((ratio) => Math.round(N * ratio))))) {
    const up = new Float64Array(n);
    const down = new Float64Array(n);
    for (let i = N; i < n; i++) {
      let max = -Infinity;
      let min = Infinity;
      for (let j = i - N; j < i; j++) {
        max = Math.max(max, close[j]);
        min = Math.min(min, close[j]);
      }
      up[i] = max;
      down[i] = min;
    }
    high[N] = up;
    low[N] = down;
  }
  const ma: Prepared["ma"] = {};
  for (const period of new Set(MA_PAIRS.flat())) {
    const out = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += close[i];
      if (i >= period) sum -= close[i - period];
      out[i] = sum / Math.min(i + 1, period);
    }
    ma[period] = out;
  }
  return { close, funding: market.funding, z, ret, high, low, ma };
}

/** Desired position (1 long, -1 short, 0 flat) given the current one. */
function signal(rule: Rule, m: Prepared, i: number, current: number): number {
  const allowLong = rule.side !== "short";
  const allowShort = rule.side !== "long";
  const p = rule.params;
  if (rule.family === "mr") {
    const z = m.z[p.L][i];
    if (current === 1) return z >= p.e ? 0 : 1;
    if (current === -1) return z <= -p.e ? 0 : -1;
    const trend = m.ret[p.T][i];
    if (allowShort && z > p.k && trend <= p.tf) return -1;
    if (allowLong && z < -p.k && trend >= -p.tf) return 1;
    return 0;
  }
  if (rule.family === "don") {
    const price = m.close[i];
    const exitN = Math.round(p.N * p.exit);
    if (current === 1) return price < m.low[exitN][i] ? 0 : 1;
    if (current === -1) return price > m.high[exitN][i] ? 0 : -1;
    if (allowLong && price > m.high[p.N][i]) return 1;
    if (allowShort && price < m.low[p.N][i]) return -1;
    return 0;
  }
  if (rule.family === "ma") {
    const [fast, slow] = MA_PAIRS[p.pair];
    const up = m.ma[fast][i] > m.ma[slow][i];
    return up ? (allowLong ? 1 : 0) : allowShort ? -1 : 0;
  }
  const move = m.ret[p.lb][i];
  if (Math.abs(move) <= p.th && current !== 0) return current; // inside the band: keep
  if (move > p.th) return allowLong ? 1 : 0;
  if (move < -p.th) return allowShort ? -1 : 0;
  return 0;
}

type Result = { returnPct: number; dropPct: number; trades: number };

function simulate(rule: Rule, markets: Prepared[], from: number, to: number): Result {
  const share = 1 / markets.length;
  const cash = markets.map(() => share);
  const side = markets.map(() => 0);
  const quantity = markets.map(() => 0);
  const entry = markets.map(() => 0);
  const blocked = markets.map(() => 0); // side stopped out; no re-entry until the signal changes
  let trades = 0;
  let peak = 1;
  let drop = 0;
  let equity = 1;
  const value = (k: number, price: number) =>
    side[k] === 0 ? cash[k] : cash[k] + (side[k] === 1 ? quantity[k] * price : quantity[k] * (2 * entry[k] - price));
  const close = (k: number, price: number) => {
    cash[k] = value(k, price) - quantity[k] * price * COST;
    side[k] = 0;
    quantity[k] = 0;
  };

  for (let i = from; i < to; i++) {
    equity = 0;
    for (let k = 0; k < markets.length; k++) {
      const m = markets[k];
      const price = m.close[i];
      if (side[k] !== 0) {
        cash[k] -= side[k] * quantity[k] * price * m.funding[i];
        const move = price / entry[k] - 1;
        if (side[k] * move <= -rule.stop) {
          blocked[k] = side[k];
          close(k, price);
        }
      }
      let want = signal(rule, m, i, side[k]);
      if (want !== blocked[k]) blocked[k] = 0;
      else want = 0;
      if (want !== side[k]) {
        if (side[k] !== 0) close(k, price);
        if (want !== 0 && cash[k] > 0) {
          quantity[k] = (cash[k] * (1 - COST)) / price;
          entry[k] = price;
          cash[k] = 0;
          side[k] = want;
          trades += 1;
        }
      }
      equity += value(k, price);
    }
    peak = Math.max(peak, equity);
    drop = Math.max(drop, 1 - equity / peak);
  }
  return { returnPct: (equity - 1) * 100, dropPct: drop * 100, trades };
}

function* rules(): Generator<Rule> {
  for (const side of SIDES) {
    for (const stop of STOPS) {
      for (const L of GRID.mr.L) for (const k of GRID.mr.k) for (const e of GRID.mr.e) for (const tf of GRID.mr.tf) {
        for (const T of tf === Infinity ? [168] : GRID.mr.T) yield { family: "mr", params: { L, k, e, tf, T }, side, stop };
      }
      for (const N of GRID.don.N) for (const exit of GRID.don.exit) yield { family: "don", params: { N, exit }, side, stop };
      for (const pair of GRID.ma.pair) yield { family: "ma", params: { pair }, side, stop };
      for (const lb of GRID.tsm.lb) for (const th of GRID.tsm.th) yield { family: "tsm", params: { lb, th }, side, stop };
    }
  }
}

const keyOf = (universe: string, rule: Rule) => `${universe}|${rule.family}|${rule.side}|${rule.stop}|${JSON.stringify(rule.params)}`;

function neighbours(rule: Rule): Rule[] {
  const out: Rule[] = [];
  const grid = GRID[rule.family] as Record<string, readonly number[]>;
  for (const [name, values] of Object.entries(grid)) {
    if (rule.family === "mr" && name === "T" && rule.params.tf === Infinity) continue;
    const at = values.indexOf(rule.params[name]);
    for (const step of [-1, 1]) {
      const next = values[at + step];
      if (next === undefined) continue;
      const params = { ...rule.params, [name]: next };
      if (rule.family === "mr" && name === "tf" && next === Infinity) params.T = 168;
      out.push({ ...rule, params });
    }
  }
  const stopAt = STOPS.indexOf(rule.stop);
  for (const step of [-1, 1]) if (STOPS[stopAt + step] !== undefined) out.push({ ...rule, stop: STOPS[stopAt + step] });
  return out;
}

const describe = (rule: Rule) => {
  const p = rule.params;
  const settings =
    rule.family === "mr"
      ? `L${p.L} k${p.k} exit${p.e}${p.tf === Infinity ? "" : ` trend${p.tf * 100}%/${p.T}h`}`
      : rule.family === "don"
        ? `N${p.N} exit${Math.round(p.N * p.exit)}`
        : rule.family === "ma"
          ? `MA${MA_PAIRS[p.pair].join("/")}`
          : `lb${p.lb} band${p.th * 100}%`;
  return `${rule.family} ${rule.side} ${settings} stop${rule.stop * 100}%`;
};

async function main() {
  const hours: number[] = [];
  for (let hour = FIRST_HOUR; hour < UNTIL; hour += HOUR_MS) hours.push(hour);
  const testStart = hours.length - TEST_DAYS * 24;
  const foldSize = Math.floor((testStart - WARMUP) / 3);
  const folds = [0, 1, 2].map((f) => [WARMUP + f * foldSize, f === 2 ? testStart : WARMUP + (f + 1) * foldSize]);
  const day = (index: number) => new Date(hours[index]).toISOString().slice(0, 10);
  console.log(`cost ${COST * 100}% per trade, 1x, real funding`);
  console.log(`training ${day(WARMUP)} to ${day(testStart - 1)} in 3 folds; held out ${day(testStart)} to ${day(hours.length - 1)} (${TEST_DAYS} days)`);

  const universes: Record<string, Prepared[]> = {};
  const prepared = new Map<number, Prepared>();
  for (const [name, ids] of Object.entries(UNIVERSES)) {
    const list: Prepared[] = [];
    for (const [symbol, id] of Object.entries(ids)) {
      if (!prepared.has(id)) {
        const market = await loadMarket(id, hours, UNTIL);
        if (!market) {
          console.log(`  ${symbol}: no price at ${day(0)}, left out`);
          continue;
        }
        prepared.set(id, prepare(market));
      }
      list.push(prepared.get(id)!);
    }
    universes[name] = list;
  }

  // Training only.
  type Row = { universe: string; rule: Rule; folds: number[]; train: Result };
  const rows = new Map<string, Row>();
  for (const [universe, markets] of Object.entries(universes)) {
    for (const rule of rules()) {
      rows.set(keyOf(universe, rule), {
        universe,
        rule,
        folds: folds.map(([from, to]) => simulate(rule, markets, from, to).returnPct),
        train: simulate(rule, markets, WARMUP, testStart),
      });
    }
  }
  const holdTrain = (markets: Prepared[], from: number, to: number) =>
    (markets.reduce((sum, m) => sum + m.close[to - 1] / m.close[from], 0) / markets.length - 1) * 100;

  const passes = (row: Row) => row.folds.every((value) => value > 0) && row.train.dropPct <= MAX_DROP * 100 && row.train.trades >= MIN_TRADES;
  const okNeighbour = (row: Row | undefined) => !!row && row.train.returnPct > 0 && row.folds.every((value) => value > -1);
  const robust = (row: Row) => {
    const near = neighbours(row.rule).map((rule) => rows.get(keyOf(row.universe, rule)));
    return near.length >= 2 && near.filter(okNeighbour).length / near.length >= 0.75;
  };

  const all = [...rows.values()];
  const passing = all.filter(passes);
  const chosenPool = passing.filter(robust).sort((a, b) => Math.min(...b.folds) - Math.min(...a.folds) || b.train.returnPct - a.train.returnPct);
  console.log(`\n${all.length} rule and market combinations; ${passing.length} pass the training test; ${chosenPool.length} are also robust`);
  for (const [universe, markets] of Object.entries(universes)) {
    console.log(`  holding ${universe}: training ${holdTrain(markets, WARMUP, testStart).toFixed(1)}%, folds ${folds.map(([from, to]) => holdTrain(markets, from, to).toFixed(1)).join(" / ")}`);
  }
  const line = (row: Row) =>
    `${row.universe.padEnd(8)} ${describe(row.rule).padEnd(48)} folds ${row.folds.map((value) => value.toFixed(1).padStart(5)).join(" ")}  train ${row.train.returnPct.toFixed(1).padStart(6)}%  drop ${row.train.dropPct.toFixed(1)}%  trades ${row.train.trades}`;
  console.log("\nTop robust rules on training data:");
  for (const row of chosenPool.slice(0, 15)) console.log("  " + line(row));

  // Pick up to 3, no two from the same family and universe, before looking at held-out days.
  const chosen: Row[] = [];
  for (const row of chosenPool) {
    if (chosen.length === 3) break;
    if (chosen.some((other) => other.universe === row.universe && other.rule.family === row.rule.family)) continue;
    chosen.push(row);
  }
  console.log("\nLocked in from training alone:");
  for (const row of chosen) console.log("  " + line(row));

  if (process.env.HOLDOUT !== "1") {
    console.log("\nHeld-out days not run (set HOLDOUT=1 once the training output is final).");
    return;
  }
  console.log(`\nHeld-out ${TEST_DAYS} days (run once):`);
  for (const row of chosen) {
    const markets = universes[row.universe];
    const result = simulate(row.rule, markets, testStart, hours.length);
    console.log(
      `  ${row.universe.padEnd(8)} ${describe(row.rule).padEnd(48)} ${result.returnPct.toFixed(1).padStart(6)}%  drop ${result.dropPct.toFixed(1)}%  trades ${result.trades}  (holding ${holdTrain(markets, testStart, hours.length).toFixed(1)}%)`,
    );
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
