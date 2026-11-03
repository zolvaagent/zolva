/**
 * Research only (read-only, never writes): can an agent stay ahead in a falling
 * market without shorting? Tests three ideas on the live-tradable (v3) markets:
 *
 *   1. Dip buying: buy a token far below its 48h average (z < -2.5), sell on the bounce (z >= 0.5).
 *   2. Rotation: every rebalance, hold the K strongest tokens by past return,
 *      but only those going up (positive return and above the 48h average).
 *   3. Cash: when nothing qualifies, stay in USDG.
 *
 * Each idea alone and combined, over three windows (last 30 days, the 30 before,
 * last 60), against an equal-weight hold. 0.5% cost per trade like the engine,
 * unless RESEARCH_COST is set.
 * This simulator is separate from lib/engine on purpose: if an idea holds up it
 * gets built into runHour (and prototype/engine.js) properly.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-down-market.mts
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { COST_RATE as ENGINE_COST_RATE } from "../lib/engine/engine.ts";
import { buildCloseSeries, HOUR_SECONDS, type CloseCandle } from "../lib/engine/series.ts";

const WARMUP_HOURS = 168;
/** RESEARCH_COST=0.002 tests a lower cost per trade than the engine's 0.5% (real fills cost less). */
const COST_RATE = Number(process.env.RESEARCH_COST ?? ENGINE_COST_RATE);
const DIP = { entryZ: -2.5, exitZ: 0.5 };

type Config = {
  label: string;
  rotation: boolean;
  dips: boolean;
  /** Hours of past return used to rank tokens. */
  lookback: number;
  /** Hours between rotation rebalances. */
  rebalance: number;
  stopLossPct: number;
  /** Number of rotation slots and dip slots; every slot is one share of the agent. */
  rotationSlots: number;
  dipSlots: number;
};

type Position = { quantity: number; entry: number; kind: "rotation" | "dip" };

function readDevVars(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function zScore(closes: number[], index: number): number {
  const window = closes.slice(index - 47, index + 1);
  const average = mean(window);
  const deviation = Math.sqrt(mean(window.map((value) => (value - average) ** 2)));
  return deviation > 0 ? (closes[index] - average) / deviation : 0;
}

function simulate(series: Record<string, number[]>, config: Config, capital: number) {
  const symbols = Object.keys(series);
  const hours = series[symbols[0]].length;
  let cash = capital;
  const positions = new Map<string, Position>();
  let trades = 0;
  let peak = capital;
  let maxDrop = 0;
  const slotShare = 1 / (config.rotationSlots * (config.rotation ? 1 : 0) + config.dipSlots * (config.dips ? 1 : 0));
  const equityAt = (index: number) => cash + [...positions].reduce((sum, [symbol, position]) => sum + position.quantity * series[symbol][index], 0);

  const sell = (symbol: string, index: number) => {
    const position = positions.get(symbol)!;
    cash += position.quantity * series[symbol][index] * (1 - COST_RATE);
    positions.delete(symbol);
    trades += 1;
  };
  const buy = (symbol: string, index: number, kind: Position["kind"]) => {
    const amount = Math.min(cash, equityAt(index) * slotShare);
    if (amount < capital * 0.01) return;
    cash -= amount;
    positions.set(symbol, { quantity: (amount * (1 - COST_RATE)) / series[symbol][index], entry: series[symbol][index], kind });
    trades += 1;
  };

  for (let index = WARMUP_HOURS; index < hours; index++) {
    // Stop losses first, for every position.
    for (const [symbol, position] of [...positions]) {
      if (series[symbol][index] <= position.entry * (1 - config.stopLossPct / 100)) sell(symbol, index);
    }
    // Dip positions leave on the bounce.
    for (const [symbol, position] of [...positions]) {
      if (position.kind === "dip" && zScore(series[symbol], index) >= DIP.exitZ) sell(symbol, index);
    }
    // Rotation: keep only the strongest tokens that are going up; the rest of the slots stay in cash.
    if (config.rotation && (index - WARMUP_HOURS) % config.rebalance === 0) {
      const ranked = symbols
        .map((symbol) => {
          const closes = series[symbol];
          const change = closes[index] / closes[index - config.lookback] - 1;
          const average = mean(closes.slice(index - 47, index + 1));
          return { symbol, change, up: change > 0 && closes[index] > average };
        })
        .filter((row) => row.up)
        .sort((a, b) => b.change - a.change)
        .slice(0, config.rotationSlots)
        .map((row) => row.symbol);
      for (const [symbol, position] of [...positions]) if (position.kind === "rotation" && !ranked.includes(symbol)) sell(symbol, index);
      for (const symbol of ranked) if (!positions.has(symbol)) buy(symbol, index, "rotation");
    }
    // Dip buys, up to the dip slots.
    if (config.dips) {
      const held = [...positions.values()].filter((position) => position.kind === "dip").length;
      const dips = symbols
        .filter((symbol) => !positions.has(symbol))
        .map((symbol) => ({ symbol, z: zScore(series[symbol], index) }))
        .filter((row) => row.z < DIP.entryZ)
        .sort((a, b) => a.z - b.z)
        .slice(0, Math.max(0, config.dipSlots - held));
      for (const row of dips) buy(row.symbol, index, "dip");
    }
    const equity = equityAt(index);
    peak = Math.max(peak, equity);
    maxDrop = Math.max(maxDrop, 1 - equity / peak);
  }
  return { returnPct: (equityAt(hours - 1) / capital - 1) * 100, trades, maxDropPct: maxDrop * 100 };
}

function holdReturn(series: Record<string, number[]>): number {
  const symbols = Object.keys(series);
  const last = series[symbols[0]].length - 1;
  return mean(symbols.map((symbol) => ((1 - COST_RATE) * series[symbol][last]) / series[symbol][WARMUP_HOURS] - 1)) * 100;
}

async function main() {
  const vars = readDevVars();
  const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: tokens, error } = await db.from("tokens").select("address, symbol").eq("pool_kind", "v3");
  if (error) throw new Error(error.message);

  const candles = new Map<string, CloseCandle[]>();
  for (const token of tokens) {
    const rows: CloseCandle[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: pageError } = await db.from("candles").select("ts, close").eq("token_address", token.address).order("ts").range(from, from + 999);
      if (pageError) throw new Error(pageError.message);
      rows.push(...data.map((row) => ({ time: Date.parse(row.ts) / 1000, close: Number(row.close) })));
      if (data.length < 1000) break;
    }
    candles.set(token.symbol, rows);
  }
  const latest = Math.max(...[...candles.values()].map((rows) => rows[rows.length - 1]?.time ?? 0));

  const windows = [
    { label: "last 30d", endDaysAgo: 0, days: 30 },
    { label: "30d before", endDaysAgo: 30, days: 30 },
    { label: "last 60d", endDaysAgo: 0, days: 60 },
  ];
  const base = { lookback: 168, rebalance: 24, stopLossPct: 10, rotationSlots: 2, dipSlots: 1 };
  const configs: Config[] = [
    { label: "1 dips only", rotation: false, dips: true, ...base },
    { label: "2+3 rotation only", rotation: true, dips: false, ...base },
    { label: "1+2+3 combined", rotation: true, dips: true, ...base },
  ];
  // Robustness: the combined idea across nearby settings, so one lucky setting cannot carry it.
  for (const lookback of [72, 168]) {
    for (const rebalance of [24, 72]) {
      for (const stopLossPct of [10, 15]) {
        configs.push({ label: `combined L${lookback} R${rebalance} S${stopLossPct}`, rotation: true, dips: true, lookback, rebalance, stopLossPct, rotationSlots: 2, dipSlots: 1 });
      }
    }
  }

  for (const window of windows) {
    const toTime = latest - window.endDaysAgo * 24 * HOUR_SECONDS;
    const fromTime = toTime - (window.days * 24 + WARMUP_HOURS - 1) * HOUR_SECONDS;
    const series: Record<string, number[]> = {};
    for (const [symbol, rows] of candles) {
      const closes = buildCloseSeries(rows, fromTime, toTime).closes;
      if (closes.every((close) => close != null)) series[symbol] = closes as number[];
    }
    const hold = holdReturn(series);
    const label = `${new Date((toTime - window.days * 24 * HOUR_SECONDS) * 1000).toISOString().slice(5, 10)} to ${new Date(toTime * 1000).toISOString().slice(5, 10)}`;
    console.log(`\n== ${window.label} (${label}), ${Object.keys(series).length} markets: ${Object.keys(series).join(" ")}`);
    console.log(`   equal-weight hold: ${hold.toFixed(1)}%  (cost per trade ${(COST_RATE * 100).toFixed(2)}%)`);
    for (const config of configs) {
      const run = simulate(series, config, 10_000);
      console.log(`   ${config.label.padEnd(28)} ${`${run.returnPct.toFixed(1)}%`.padStart(7)}  vs hold ${`${(run.returnPct - hold).toFixed(1)}`.padStart(6)} pts  trades ${String(run.trades).padStart(3)}  worst drop ${run.maxDropPct.toFixed(1)}%`);
    }
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
