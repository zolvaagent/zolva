/**
 * Research only (read-only): runs the real engine (lib/engine, the same code as the hourly
 * tick) on Lighter RH history for Lab · Perps Deep Dip, to check it matches the rule search
 * (docs/perps-research.md, "Rule search").
 *
 *   [UNTIL=1794042000000] node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-perps-engine-check.mts
 */
import { DEEP_DIP_96 } from "../lib/agents/house.ts";
import { buyAndHold, simulate, PERPS_COST_RATE, type AgentParams } from "../lib/engine/engine.ts";
import { FIRST_HOUR, HOUR_MS, loadMarket } from "./lighter-history.mts";

const UNTIL = Number(process.env.UNTIL ?? 1794042000000);
const MARKETS: Record<string, number> = { BTC: 1, ETH: 0, SOL: 3 };
const params: AgentParams = { strategy: "custom", rules: DEEP_DIP_96, maxPositionPct: 33, stopLossPct: 5, venue: "perps" };

async function main() {
  const hours: number[] = [];
  for (let hour = FIRST_HOUR; hour < UNTIL; hour += HOUR_MS) hours.push(hour);
  const series: Record<string, number[]> = {};
  const funding: Record<string, number[]> = {};
  for (const [symbol, id] of Object.entries(MARKETS)) {
    const market = await loadMarket(id, hours, UNTIL);
    if (!market) throw new Error(`${symbol}: no history`);
    series[symbol] = market.closes;
    funding[symbol] = market.funding;
  }
  const testStart = hours.length - 30 * 24;
  const windows = [
    { label: "training (Jul 15 to Oct 8)", from: 336, to: testStart - 1 },
    { label: "held-out month", from: testStart, to: hours.length - 1 },
  ];
  for (const window of windows) {
    const run = simulate({ series, params, capital: 10_000, fromIndex: window.from, toIndex: window.to, funding, times: hours.map((hour) => hour / 1000) });
    const hold = buyAndHold(series, 10_000, window.from, window.to, PERPS_COST_RATE);
    console.log(
      `${window.label.padEnd(28)} ${run.returnPct.toFixed(1).padStart(6)}%  worst drop ${run.maxDrawdownPct.toFixed(1)}%  round trips ${run.roundTrips}  wins ${run.winRatePct?.toFixed(0) ?? "-"}%  (holding ${hold.returnPct.toFixed(1)}%)`,
    );
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
