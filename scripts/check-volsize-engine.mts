/**
 * Read-only check (2026-11-14): runs the real engine (lib/engine/engine.ts, runHour via simulate) with
 * the alt perps Lab agents' frozen settings on the same Binance hourly history as the research
 * (scripts/research-alt-volsize.mts), and prints the same yearly returns, worst drop and test return,
 * so the engine can be compared with the research numbers before the agents are seeded.
 *
 * Same assumptions as the research: 0.05% a fill (PERPS_COST_RATE), longs pay 10% a year funding,
 * indicators only once their whole window is real data. Differences that remain on purpose: the
 * engine takes the cost out of the buy and measures the stop from the entry price including cost.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-volsize-engine.mts
 */
import { LAB_AGENTS } from "../lib/agents/house.ts";
import { simulate, type AgentParams } from "../lib/engine/engine.ts";
import { BINANCE_FIRST_HOUR, BINANCE_SYMBOLS, binanceCloses, HOUR_MS } from "./binance-history.mts";

const START = Date.UTC(2020, 9, 15);
const TRAIN_END = Date.UTC(2024, 0, 1);
const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
const LONG_FUNDING_PER_HOUR = 0.1 / (365 * 24);

function stats(equity: number[], hours: number[], from: number, to: number) {
  const i0 = hours.findIndex((hour) => hour >= from);
  const i1 = hours.findLastIndex((hour) => hour < to);
  if (i0 < 0 || i1 < i0) return null;
  const start = i0 > 0 ? equity[i0 - 1] : equity[i0];
  let peak = start;
  let worst = 0;
  for (let i = i0; i <= i1; i++) {
    peak = Math.max(peak, equity[i]);
    worst = Math.max(worst, (peak - equity[i]) / peak);
  }
  return { ret: equity[i1] / start - 1, drop: worst };
}

const pct = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(0)}%`;

async function main() {
  const now = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const hours: number[] = [];
  for (let hour = BINANCE_FIRST_HOUR; hour < now; hour += HOUR_MS) hours.push(hour);

  for (const coin of ["SOL", "XRP", "NEAR", "ZEC"]) {
    const config = LAB_AGENTS.find((agent) => agent.name === `Lab · ${coin} Vol Trend`)!;
    const params: AgentParams = { strategy: config.strategy, rules: config.rules, maxPositionPct: config.maxPositionPct, stopLossPct: config.stopLossPct, venue: config.venue, sizing: config.sizing };

    // Closes on the hour grid, forward filled; null before the coin's first bar so the engine waits.
    const rows = await binanceCloses(BINANCE_SYMBOLS[coin], now);
    const closeAt = new Map<number, number>(rows);
    let last: number | null = null;
    const closes = hours.map((hour) => (hour < rows[0][0] ? null : (last = closeAt.get(hour) ?? last)));
    const funding = hours.map(() => LONG_FUNDING_PER_HOUR);

    const result = simulate({ series: { [coin]: closes }, params, capital: 10_000, fromIndex: 1, times: hours.map((hour) => hour / 1000), funding: { [coin]: funding } });
    // runs start at index 1; pad index 0 with the starting capital.
    const equity = [10_000, ...result.runs.map((run) => run.equity)];

    const years = YEARS.map((year) => stats(equity, hours, Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1))?.ret ?? 0);
    const whole = stats(equity, hours, START, now + HOUR_MS)!;
    const test = stats(equity, hours, TRAIN_END, now + HOUR_MS)!;
    const entries = result.fills.filter((fill) => fill.side === "buy" && fill.reason === "signal").length;
    const resizes = result.fills.filter((fill) => fill.reason === "resize").length;
    const stops = result.fills.filter((fill) => fill.reason === "stop_loss").length;
    console.log(
      `${coin.padEnd(5)} years ${years.map((r) => pct(r).padStart(6)).join("")}  worst drop ${pct(whole.drop).padStart(5)}  test ${pct(test.ret).padStart(6)}  entries ${entries}  resizes ${resizes}  stops ${stops}`,
    );
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
