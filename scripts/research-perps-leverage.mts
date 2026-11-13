/* eslint-disable @typescript-eslint/no-explicit-any -- read-only research script over Lighter's untyped public API JSON */
/**
 * Research only (read-only), Phase L0 of docs/plan-actions-perps-live.md section 2: the perps
 * Lab strategies at 1x, 2x, 3x, 5x and 10x on Lighter RH history, with a leverage model the
 * engine does not have yet. Results: docs/perps-research.md, "Leverage, Phase L0".
 *
 *   [LIGHTER_CACHE=<folder>] [UNTIL=<ms>] [FRESH=2026-11-07] [ONLY=deep_dip,...]
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-perps-leverage.mts
 *
 * Model (isolated margin, one position per market, as the plan specifies):
 * - A position puts `margin` = min(cash, equity x max %) in, as the engine sizes a 1x position,
 *   and holds notional = margin x leverage. Leverage is capped at the market's maximum
 *   (10000 / min_initial_margin_fraction, read from the free public orderBookDetails).
 * - Every fill costs PERPS_COST_RATE (0.05%) of the notional, taken from the margin.
 * - Funding is charged on the notional every hour, from the margin (positive rate: longs pay).
 * - Liquidation from the hour's candle: a long is liquidated when the low reaches
 *   entry x (1 - 1/L + mmf), a short when the high reaches entry x (1 + 1/L - mmf), with
 *   mmf = maintenance_margin_fraction. The margin is lost, and the 1% liquidation fee on the
 *   notional is charged from free cash (conservative: Lighter may take it from what is left).
 * - The stop loss is checked on the close, as today. Signals and market choice copy the engine
 *   (lib/engine/engine.ts runHour): deep dip is the custom rule DEEP_DIP_96 on each market,
 *   spike fade and bounce short hold one position at a time.
 * - Bounce short is not committed to lib/engine yet; `bounceShort` below copies the preset from
 *   the working copy (strategies.ts BOUNCE_SHORT, 2026-11-13).
 *
 * At 1x the model is checked against the real engine (`simulate`) on the whole period.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEEP_DIP_96 } from "../lib/agents/house.ts";
import { buyAndHold, maxDrawdown, PERPS_COST_RATE, simulate, type AgentParams } from "../lib/engine/engine.ts";
import { evaluateRules, rulesLookback } from "../lib/engine/rules.ts";
import { decide, LOOKBACK_HOURS, mean, type Signal } from "../lib/engine/strategies.ts";
import { HOUR_MS, loadMarket } from "./lighter-history.mts";

const CACHE = process.env.LIGHTER_CACHE ?? join(tmpdir(), "zolva-lighter-cache");
const UNTIL = Number(process.env.UNTIL ?? Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
const FROM = Date.UTC(2026, 6, 1);
const FRESH = Date.parse(`${process.env.FRESH ?? "2026-11-07"}T00:00:00Z`);
const WARMUP = 168;
const CAPITAL = 10_000;
const LEVELS = [1, 2, 3, 5, 10];
const LIQUIDATION_FEE = 0.01;
const COST = PERPS_COST_RATE;

/** Pass, per leverage level (plan section 2). */
const GATE = { maxDrawdownPct: 15, minRoundTrips: 30 };

const MARKET_IDS: Record<string, number> = { ETH: 0, BTC: 1, HYPE: 2, SOL: 3, ZEC: 4, LIT: 5, XRP: 6, NEAR: 7 };

type StrategyName = "deep_dip" | "deep_dip_alts" | "spike_fade" | "bounce_short" | "bounce_short_stop5";
type Setup = { label: string; kind: "rules" | "spike_fade" | "bounce_short"; symbols: string[]; maxPositionPct: number; stopLossPct: number };

// The Lab agents' settings (lib/agents/house.ts).
const SETUPS: Record<StrategyName, Setup> = {
  deep_dip: { label: "Deep Dip, BTC ETH SOL (max 33% each, 5% stop)", kind: "rules", symbols: ["BTC", "ETH", "SOL"], maxPositionPct: 33, stopLossPct: 5 },
  deep_dip_alts: { label: "Deep Dip Alts, HYPE ZEC XRP LIT NEAR (max 20% each, 5% stop)", kind: "rules", symbols: ["HYPE", "ZEC", "XRP", "LIT", "NEAR"], maxPositionPct: 20, stopLossPct: 5 },
  spike_fade: { label: "Spike Fade, ETH BTC (one short, 100%, 10% stop)", kind: "spike_fade", symbols: ["ETH", "BTC"], maxPositionPct: 100, stopLossPct: 10 },
  bounce_short: { label: "Bounce Short, all 8 crypto perps (one short, 100%, 10% stop)", kind: "bounce_short", symbols: ["BTC", "ETH", "SOL", "HYPE", "ZEC", "XRP", "LIT", "NEAR"], maxPositionPct: 100, stopLossPct: 10 },
  // The stop of the planned 3x Bounce Short Lab agent (working copy of house.ts, 2026-11-13).
  bounce_short_stop5: { label: "Bounce Short, all 8 crypto perps, 5% stop (the planned 3x Lab agent's stop)", kind: "bounce_short", symbols: ["BTC", "ETH", "SOL", "HYPE", "ZEC", "XRP", "LIT", "NEAR"], maxPositionPct: 100, stopLossPct: 5 },
};

// Copy of the bounce_short preset (working copy of lib/engine/strategies.ts, 2026-11-13).
const BOUNCE_SHORT = { trendHours: 168, trendLimit: 0.05, entryZ: 0.5, maxEntryZ: 2.5, exitZ: -0.5, fastHours: 24, fastMax: 0.015 };
function bounceShort(window: number[], isShort: boolean): Signal {
  const price = window[window.length - 1];
  const recent = window.slice(-LOOKBACK_HOURS);
  const average = mean(recent);
  const deviation = Math.sqrt(recent.reduce((sum, value) => sum + (value - average) ** 2, 0) / recent.length);
  const zScore = deviation > 0 ? (price - average) / deviation : 0;
  const trend = price / window[window.length - 1 - BOUNCE_SHORT.trendHours] - 1;
  const fast = price / window[window.length - 1 - BOUNCE_SHORT.fastHours] - 1;
  const indicators = { zScore, trend7d: trend };
  if (isShort) return { action: zScore <= BOUNCE_SHORT.exitZ ? "cover" : "hold", indicators, reasoning: "" };
  const enter = trend <= -BOUNCE_SHORT.trendLimit && zScore >= BOUNCE_SHORT.entryZ && zScore <= BOUNCE_SHORT.maxEntryZ && fast <= BOUNCE_SHORT.fastMax;
  return { action: enter ? "short" : "hold", indicators, reasoning: "" };
}

type Bars = { closes: number[]; highs: number[]; lows: number[]; funding: number[] };
type Limits = { maxLeverage: number; maintenance: number };
type Position = { side: 1 | -1; quantity: number; entry: number; margin: number; leverage: number };
type Run = { returnPct: number; maxDrawdownPct: number; roundTrips: number; wins: number; stops: number; liquidations: number };

/** Lighter's margin table, cached beside the history so reruns see the same limits. */
async function loadLimits(): Promise<Record<string, Limits>> {
  const file = join(CACHE, "orderBookDetails.json");
  if (!existsSync(file)) {
    const response = await fetch("https://api.rh.lighter.xyz/api/v1/orderBookDetails", { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`orderBookDetails ${response.status}`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(await response.json()));
  }
  const body = JSON.parse(readFileSync(file, "utf8"));
  const limits: Record<string, Limits> = {};
  for (const [symbol, id] of Object.entries(MARKET_IDS)) {
    const row = body.order_book_details.find((detail: any) => detail.market_id === id);
    if (!row || row.symbol !== symbol) throw new Error(`orderBookDetails: market ${id} is not ${symbol}`);
    limits[symbol] = { maxLeverage: 10_000 / row.min_initial_margin_fraction, maintenance: row.maintenance_margin_fraction / 10_000 };
  }
  return limits;
}

/** Closes and funding from loadMarket, plus each hour's high and low from the same cached candles. */
async function loadBars(symbol: string, hours: number[]): Promise<Bars> {
  const market = await loadMarket(MARKET_IDS[symbol], hours, UNTIL);
  if (!market) throw new Error(`${symbol}: no price at the first hour`);
  const candles: any[] = JSON.parse(readFileSync(join(CACHE, `candles-${MARKET_IDS[symbol]}.json`), "utf8"));
  const candleAt = new Map(candles.map((row) => [Math.floor(row.t / HOUR_MS) * HOUR_MS, row]));
  // An hour with no candle had no trade: its high and low are the forward-filled close.
  const highs = hours.map((hour, index) => Number(candleAt.get(hour)?.h ?? market.closes[index]));
  const lows = hours.map((hour, index) => Number(candleAt.get(hour)?.l ?? market.closes[index]));
  return { closes: market.closes, highs, lows, funding: market.funding };
}

function simulateLeveraged(setup: Setup, leverage: number, bars: Record<string, Bars>, limits: Record<string, Limits>, from: number, to: number): Run {
  const symbols = setup.symbols;
  const lookback = setup.kind === "rules" ? rulesLookback(DEEP_DIP_96) : setup.kind === "bounce_short" ? BOUNCE_SHORT.trendHours : LOOKBACK_HOURS;
  const maxShare = setup.maxPositionPct / 100;
  const stop = setup.stopLossPct / 100;
  let cash = CAPITAL;
  const positions: Record<string, Position> = {};
  const curve: number[] = [];
  const run: Run = { returnPct: 0, maxDrawdownPct: 0, roundTrips: 0, wins: 0, stops: 0, liquidations: 0 };

  const value = (position: Position, price: number) => Math.max(0, position.margin + position.side * position.quantity * (price - position.entry));
  const close = (symbol: string, price: number, put: number) => {
    const position = positions[symbol];
    const back = Math.max(0, value(position, price) - position.quantity * price * COST);
    cash += back;
    run.roundTrips++;
    if (back > put) run.wins++;
    delete positions[symbol];
  };
  const putIn: Record<string, number> = {};

  for (let index = from; index <= to; index++) {
    // 1. Liquidation inside the hour that just passed, from its candle.
    for (const symbol of Object.keys(positions)) {
      const position = positions[symbol];
      const { maintenance } = limits[symbol];
      const line = position.side === 1 ? position.entry * (1 - 1 / position.leverage + maintenance) : position.entry * (1 + 1 / position.leverage - maintenance);
      const hit = position.side === 1 ? bars[symbol].lows[index] <= line : bars[symbol].highs[index] >= line;
      if (!hit) continue;
      cash -= Math.min(cash, position.quantity * line * LIQUIDATION_FEE);
      delete positions[symbol];
      run.roundTrips++;
      run.liquidations++;
    }
    // 2. Funding on the notional, from the margin.
    for (const [symbol, position] of Object.entries(positions)) {
      position.margin -= position.side * position.quantity * bars[symbol].closes[index] * bars[symbol].funding[index];
    }
    const price = (symbol: string) => bars[symbol].closes[index];
    const equityBefore = cash + Object.entries(positions).reduce((sum, [symbol, position]) => sum + value(position, price(symbol)), 0);
    const holdsAny = Object.keys(positions).length > 0;

    // One-position strategies choose their one market first, as the engine's findExtreme does.
    let chosen: string | null = null;
    if (setup.kind !== "rules" && !holdsAny) {
      let best = Infinity;
      for (const symbol of symbols) {
        const window = bars[symbol].closes.slice(index - lookback, index + 1);
        if (index - lookback < 0) continue;
        const signal = setup.kind === "bounce_short" ? bounceShort(window, false) : decide("spike_fade", window, false);
        // Spike fade: the highest z; bounce short: the deepest 7 day fall.
        const score = setup.kind === "bounce_short" ? signal.indicators.trend7d : -signal.indicators.zScore;
        if (signal.action === "short" && score < best) [best, chosen] = [score, symbol];
      }
    }

    for (const symbol of symbols) {
      if (index - lookback < 0) continue;
      const now = price(symbol);
      const position = positions[symbol];
      // 3. The stop on the close.
      if (position && (position.side === 1 ? now <= position.entry * (1 - stop) : now >= position.entry * (1 + stop))) {
        close(symbol, now, putIn[symbol]);
        run.stops++;
        continue;
      }
      // 4. Signals.
      const window = bars[symbol].closes.slice(index - lookback, index + 1);
      const signal =
        setup.kind === "rules"
          ? evaluateRules(DEEP_DIP_96, window, Boolean(position))
          : setup.kind === "bounce_short"
            ? bounceShort(window, Boolean(position))
            : decide("spike_fade", window, Boolean(position));
      if (position) {
        if (signal.action === "sell" || signal.action === "cover") close(symbol, now, putIn[symbol]);
        continue;
      }
      const opens = setup.kind === "rules" ? signal.action === "buy" : signal.action === "short" && symbol === chosen;
      if (!opens) continue;
      const margin = Math.min(cash, equityBefore * maxShare);
      if (margin < 1) continue;
      const level = Math.min(leverage, limits[symbol].maxLeverage);
      const notional = margin * level;
      cash -= margin;
      putIn[symbol] = margin;
      positions[symbol] = { side: setup.kind === "rules" ? 1 : -1, quantity: notional / now, entry: now, margin: margin - notional * COST, leverage: level };
    }
    curve.push(cash + Object.entries(positions).reduce((sum, [symbol, position]) => sum + value(position, price(symbol)), 0));
  }
  run.returnPct = (curve[curve.length - 1] / CAPITAL - 1) * 100;
  run.maxDrawdownPct = maxDrawdown(curve) * 100;
  return run;
}

/** The same strategy through the real engine at 1x, as a check on the model above. */
function engineAt1x(setup: Setup, bars: Record<string, Bars>, hours: number[], from: number, to: number) {
  if (setup.kind === "bounce_short") return null; // not in the committed engine
  const params: AgentParams = {
    ...(setup.kind === "rules" ? { strategy: "custom" as const, rules: DEEP_DIP_96 } : { strategy: "spike_fade" as const }),
    maxPositionPct: setup.maxPositionPct,
    stopLossPct: setup.stopLossPct,
    venue: "perps",
  };
  const series = Object.fromEntries(setup.symbols.map((symbol) => [symbol, bars[symbol].closes]));
  const funding = Object.fromEntries(setup.symbols.map((symbol) => [symbol, bars[symbol].funding]));
  return simulate({ series, params, capital: CAPITAL, fromIndex: from, toIndex: to, funding, times: hours.map((hour) => hour / 1000) });
}

async function main() {
  const hours: number[] = [];
  for (let hour = FROM; hour < UNTIL; hour += HOUR_MS) hours.push(hour);
  const limits = await loadLimits();
  const bars: Record<string, Bars> = {};
  for (const symbol of Object.keys(MARKET_IDS)) bars[symbol] = await loadBars(symbol, hours);

  const last = hours.length - 1;
  const fresh = hours.indexOf(FRESH);
  if (fresh < 0 || fresh >= last) throw new Error("No fresh hours after FRESH");
  const middle = Math.floor((WARMUP + fresh - 1) / 2);
  const windows: [string, number, number][] = [
    ["Whole period", WARMUP, last],
    ["First half", WARMUP, middle],
    ["Second half", middle + 1, fresh - 1],
    ["Jul 8 to Aug 9", WARMUP, fresh - 2160 - 1],
    ["Aug to Sep", fresh - 2160, fresh - 1440 - 1],
    ["Sep to Oct", fresh - 1440, fresh - 720 - 1],
    ["Oct 8 to Nov 7", fresh - 720, fresh - 1],
    ["Fresh (after Nov 7)", fresh, last],
  ];
  const day = (index: number) => new Date(hours[index]).toISOString().slice(0, 16).replace("T", " ");
  console.log(`Lighter RH history ${day(0)} to ${day(last)} UTC; fresh hours: ${last - fresh + 1}; cache ${CACHE}`);
  console.log(`Windows: ${windows.map(([label, from, to]) => `${label} ${day(from).slice(5, 10)}..${day(to).slice(5, 10)}`).join("; ")}`);
  console.log(`Max leverage: ${Object.entries(limits).map(([symbol, limit]) => `${symbol} ${limit.maxLeverage}x (mmf ${(limit.maintenance * 100).toFixed(1)}%)`).join(", ")}\n`);

  const only = process.env.ONLY?.split(",");
  for (const [name, setup] of Object.entries(SETUPS) as [StrategyName, Setup][]) {
    if (only && !only.includes(name)) continue;
    const series = Object.fromEntries(setup.symbols.map((symbol) => [symbol, bars[symbol].closes]));
    const holding = windows.map(([, from, to]) => buyAndHold(series, CAPITAL, from, to, COST).returnPct);
    const capped = setup.symbols.filter((symbol) => limits[symbol].maxLeverage < 10).map((symbol) => `${symbol} ${limits[symbol].maxLeverage}x`);
    console.log(`### ${setup.label}${capped.length ? ` (capped: ${capped.join(", ")})` : ""}\n`);
    console.log(`| Leverage | ${windows.map(([label]) => label).join(" | ")} | Worst drop | Liquidations | Stops | Round trips | Wins | Pass |`);
    console.log(`|---|${windows.map(() => "---|").join("")}---|---|---|---|---|---|`);
    console.log(`| Holding (1x) | ${holding.map((value) => `${value.toFixed(1)}%`).join(" | ")} | | | | | | |`);
    for (const leverage of LEVELS) {
      const runs = windows.map(([, from, to]) => simulateLeveraged(setup, leverage, bars, limits, from, to));
      const whole = runs[0];
      const worstDrop = Math.max(...runs.map((run) => run.maxDrawdownPct));
      const failures = [
        runs.some((run) => run.returnPct <= 0) && "not positive in every window",
        runs[runs.length - 1].returnPct <= holding[holding.length - 1] && "does not beat holding on fresh hours",
        worstDrop > GATE.maxDrawdownPct && `drop ${worstDrop.toFixed(1)}%`,
        whole.liquidations > 0 && `${whole.liquidations} liquidations`,
        whole.roundTrips < GATE.minRoundTrips && `${whole.roundTrips} round trips`,
      ].filter(Boolean);
      console.log(
        `| ${leverage}x | ${runs.map((run) => `${run.returnPct.toFixed(1)}%`).join(" | ")} | ${worstDrop.toFixed(1)}% | ${whole.liquidations} | ${whole.stops} | ${whole.roundTrips} | ${whole.roundTrips ? ((whole.wins / whole.roundTrips) * 100).toFixed(0) : "-"}% | ${failures.length ? `no: ${failures.join(", ")}` : "**yes**"} |`,
      );
    }
    const check = engineAt1x(setup, bars, hours, WARMUP, last);
    if (check) console.log(`\nCheck at 1x, whole period, real engine: ${check.returnPct.toFixed(1)}%, worst drop ${check.maxDrawdownPct.toFixed(1)}%, ${check.roundTrips} round trips.`);
    console.log("");
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
