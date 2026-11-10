/**
 * Research only (read-only): runs the real engine (lib/engine, the same code as the hourly
 * tick) on Lighter RH history with the frozen deep dip rule (DEEP_DIP_96, 5% stop), to check
 * it matches the rule search and to try it on other perps (docs/perps-research.md).
 *
 *   [MARKETS=BTC:1,ETH:0,SOL:3] [FROM=2026-07-01] [MAX_PCT=33] [UNTIL=<ms>]
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-perps-engine-check.mts
 *
 * MARKETS are symbol:Lighter market id pairs; every market needs a price at FROM (the
 * first week is warm-up). Reports the whole period, its first and second half, and the last
 * 30 days.
 */
import { DEEP_DIP_96 } from "../lib/agents/house.ts";
import { buyAndHold, simulate, PERPS_COST_RATE, type AgentParams } from "../lib/engine/engine.ts";
import { HOUR_MS, loadMarket } from "./lighter-history.mts";

const UNTIL = Number(process.env.UNTIL ?? Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
const FROM = Date.parse(`${process.env.FROM ?? "2026-07-01"}T00:00:00Z`);
const MARKETS = Object.fromEntries((process.env.MARKETS ?? "BTC:1,ETH:0,SOL:3").split(",").map((pair) => pair.split(":")).map(([symbol, id]) => [symbol, Number(id)]));
const params: AgentParams = { strategy: "custom", rules: DEEP_DIP_96, maxPositionPct: Number(process.env.MAX_PCT ?? 33), stopLossPct: 5, venue: "perps" };
const WARMUP = 168;

async function main() {
  const hours: number[] = [];
  for (let hour = FROM; hour < UNTIL; hour += HOUR_MS) hours.push(hour);
  const series: Record<string, number[]> = {};
  const funding: Record<string, number[]> = {};
  for (const [symbol, id] of Object.entries(MARKETS)) {
    const market = await loadMarket(id, hours, UNTIL);
    if (!market) throw new Error(`${symbol}: no price at ${new Date(FROM).toISOString().slice(0, 10)}`);
    series[symbol] = market.closes;
    funding[symbol] = market.funding;
  }
  const last = hours.length - 1;
  const middle = Math.floor((WARMUP + last) / 2);
  const day = (index: number) => new Date(hours[index]).toISOString().slice(5, 10);
  console.log(`${Object.keys(MARKETS).join(" ")}, max ${params.maxPositionPct}% each`);
  for (const [label, from, to] of [
    ["whole period", WARMUP, last],
    ["first half", WARMUP, middle],
    ["second half", middle + 1, last],
    ["last 30 days", last - 30 * 24, last],
  ] as [string, number, number][]) {
    const run = simulate({ series, params, capital: 10_000, fromIndex: from, toIndex: to, funding, times: hours.map((hour) => hour / 1000) });
    const hold = buyAndHold(series, 10_000, from, to, PERPS_COST_RATE);
    console.log(
      `  ${label.padEnd(13)} ${day(from)} to ${day(to)}  ${run.returnPct.toFixed(1).padStart(6)}%  worst drop ${run.maxDrawdownPct.toFixed(1).padStart(4)}%  round trips ${String(run.roundTrips).padStart(3)}  wins ${run.winRatePct?.toFixed(0) ?? "-"}%  (holding ${hold.returnPct.toFixed(1)}%)`,
    );
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
