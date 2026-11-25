/**
 * Development check (read-only, no database): runs the real engine (lib/engine `simulate`, the same code as
 * the hourly tick) in Lab portfolio mode (AgentParams.portfolio) on Research's Binance history, to compare
 * with scripts/research-portfolio-momentum.mts (docs/perps-research.md, "Many-coin momentum portfolio"):
 * Vol Trend L+S on every coin, equal sleeves, account leverage 1, 2, 3.
 *
 *   [LIST=BTC,ETH,SOL,XRP,NEAR,ZEC] [COST_SCALE=1] node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-portfolio-engine.mts
 *
 * Reads the hourly closes (scripts/binance-history.mts cache) and funding (FUNDING_CACHE, written by Research's
 * script) from the OS temp folder; run Research's script first if they are missing. Differences to expect: the
 * engine resizes each sleeve once a day (Research rebalances every hour), margins each sleeve on its own
 * (Research liquidates the whole account), and pays costs on every resize.
 */
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { VOL_TREND_1200_LS } from "../lib/agents/house.ts";
import { maxDrawdown, simulate, type AgentParams } from "../lib/engine/engine.ts";
import { binanceCloses, HOUR_MS } from "./binance-history.mts";

const COINS = (process.env.LIST ?? "BTC,ETH,SOL,XRP,NEAR,ZEC").split(",");
const START = Date.UTC(2020, 9, 15);
const FUNDING_CACHE = process.env.FUNDING_CACHE ?? join(tmpdir(), "zolva-binance-funding");
const COST_SCALE = Number(process.env.COST_SCALE ?? 1);
const LEVERAGES = (process.env.LEVERAGES ?? "1,2,3").split(",").map(Number);

function fundingRows(coin: string): [number, number][] {
  const file = join(FUNDING_CACHE, `${coin}USDT-funding.json`);
  if (!existsSync(file)) throw new Error(`No cached funding for ${coin}: run scripts/research-portfolio-momentum.mts first`);
  return JSON.parse(readFileSync(file, "utf8"));
}

async function main() {
  const now = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const closesBy: Record<string, Map<number, number>> = {};
  let last = START;
  for (const coin of COINS) {
    const rows = await binanceCloses(`${coin}USDT`, now);
    closesBy[coin] = new Map(rows.map(([time, close]) => [time, close]));
    last = Math.max(last, rows[rows.length - 1]?.[0] ?? START);
  }
  const hours: number[] = [];
  for (let hour = START; hour <= last; hour += HOUR_MS) hours.push(hour);

  const series: Record<string, (number | null)[]> = {};
  const funding: Record<string, number[]> = {};
  for (const coin of COINS) {
    // Null before the first close; gaps after it keep the last close.
    let previous: number | null = null;
    series[coin] = hours.map((hour) => (previous = closesBy[coin].get(hour) ?? previous));
    // Binance funding settles every 8 hours: the rate is paid in the hour it settles.
    const byHour = new Map<number, number>();
    for (const [time, rate] of fundingRows(coin)) byHour.set(Math.floor(time / HOUR_MS) * HOUR_MS, rate);
    funding[coin] = hours.map((hour) => byHour.get(hour) ?? 0);
  }
  const times = hours.map((hour) => hour / 1000);

  console.log(`Engine, Vol Trend L+S portfolio, ${COINS.join(" ")}, ${new Date(START).toISOString().slice(0, 10)} to ${new Date(last).toISOString().slice(0, 10)}, cost x${COST_SCALE}`);
  for (const leverage of LEVERAGES) {
    const params: AgentParams = {
      strategy: "custom",
      rules: VOL_TREND_1200_LS,
      maxPositionPct: 100,
      stopLossPct: 15,
      venue: "perps",
      sizing: { kind: "volTarget", targetPct: 20, hours: 720 },
      portfolio: { leverage },
    };
    const result = simulate({ series, params, capital: 10_000, fromIndex: 0, times, funding, costScale: COST_SCALE });
    const equity = result.runs.map((run) => run.equity);
    const years = (hours[hours.length - 1] - hours[0]) / (365.25 * 24 * HOUR_MS);
    const yearly = Math.pow(equity[equity.length - 1] / 10_000, 1 / years) - 1;
    const byYear: string[] = [];
    let up = 0;
    for (const year of [2021, 2022, 2023, 2024, 2025, 2026]) {
      const inYear = result.runs.filter((run) => new Date(times[run.index] * 1000).getUTCFullYear() === year);
      if (!inYear.length) continue;
      const startIndex = result.runs.indexOf(inYear[0]);
      const from = startIndex > 0 ? result.runs[startIndex - 1].equity : 10_000;
      const change = inYear[inYear.length - 1].equity / from - 1;
      if (change > 0) up += 1;
      byYear.push(`${year} ${(change * 100).toFixed(0)}%`);
    }
    const liquidations = result.fills.filter((fill) => fill.reason === "stop_loss").length;
    console.log(
      `${leverage}x: yearly ${(yearly * 100).toFixed(1)}%, worst drop ${(maxDrawdown(equity) * 100).toFixed(1)}%, years up ${up} of ${byYear.length}, fills ${result.fills.length}, stops ${liquidations}, min cash ${Math.min(...result.runs.map((run) => run.cash)).toFixed(2)}`,
    );
    console.log(`    ${byYear.join(" | ")}`);
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
