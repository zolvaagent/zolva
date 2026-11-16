/**
 * Research only (read-only, no database): honest by-year backtests of the Studio presets (2026-11-16, Grok plan
 * items 2 and 4, owner approved "Kirim item 2-6"). Runs the deployed engine (`simulate`, ENGINE_ROOT) with each
 * preset's default limits at spot cost (the engine's 0.5% a fill) on long history, and prints every calendar year,
 * losing years included, next to buying and holding the same markets.
 *
 * Markets and data (free):
 *   CRYPTO  BTC, ETH: Binance spot hourly closes 2020-08 to now (scripts/binance-history.mts), 6 scored years.
 *   INDEX   SPY, QQQ; TECH GOOGL, META, NVDA: Yahoo 60 minute bars incl. pre/post market, last 730 days only
 *           (Yahoo's limit), on a 24/7 hourly grid (forward filled), so 2024 (partial) to 2026 only.
 * Presets (Studio defaults: 33% per market, 8% stop): Momentum, Mean reversion, Dip hunter, Breakout template
 * (custom rules), DCA (52 weekly buys a year, capital split across the markets, restarted each year), and for
 * reference the Lab Vol Trend long-only rule (50 day gate, 20% volatility target, 15% stop, 100% max).
 * Label rule (proposed to Development): a preset is "Tested" on a market set only when it passes the research pass
 * rule there: positive in at least 4 of 6 calendar years 2021-2026 AND worst drop under 30% over the whole window,
 * at spot cost. Sets without 6 years of hourly history cannot be "Tested" (stocks today).
 *
 *   ENGINE_ROOT=<deployed checkout> node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-preset-years.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { BINANCE_FIRST_HOUR, BINANCE_SYMBOLS, binanceCloses, HOUR_MS } from "./binance-history.mts";

const ENGINE_ROOT = resolve(process.env.ENGINE_ROOT ?? new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const { simulate, maxDrawdown } = await import(pathToFileURL(resolve(ENGINE_ROOT, "lib/engine/engine.ts")).href);
const { RULE_TEMPLATES } = await import(pathToFileURL(resolve(ENGINE_ROOT, "lib/engine/rules.ts")).href);
const house = await import(pathToFileURL(resolve(ENGINE_ROOT, "lib/agents/house.ts")).href);

const YAHOO_CACHE = process.env.YAHOO_CACHE ?? join(tmpdir(), "zolva-yahoo-cache");
const CAPITAL = 10_000;
const WARMUP = 1300; // hours before the first scored hour (Vol Trend needs 1,201)

type Preset = { name: string; params: Record<string, unknown> | ((year: number) => Record<string, unknown>); dca?: boolean };
const PRESETS: Preset[] = [
  { name: "Momentum", params: { strategy: "momentum", maxPositionPct: 33, stopLossPct: 8 } },
  { name: "Mean reversion", params: { strategy: "mean_reversion", maxPositionPct: 33, stopLossPct: 8 } },
  { name: "Dip hunter", params: { strategy: "dip_hunter", maxPositionPct: 33, stopLossPct: 8 } },
  { name: "Breakout (template)", params: { strategy: "custom", rules: RULE_TEMPLATES.breakout, maxPositionPct: 33, stopLossPct: 8 } },
  { name: "DCA 52 weekly", params: { strategy: "dca", maxPositionPct: 100, stopLossPct: 0 }, dca: true },
  { name: "Vol Trend long (Lab, reference)", params: { strategy: "custom", rules: house.VOL_TREND_1200, maxPositionPct: 100, stopLossPct: 15, sizing: { kind: "volTarget", targetPct: 20, hours: 720 } } },
];

async function yahoo60m(symbol: string): Promise<[number, number][]> {
  const file = join(YAHOO_CACHE, `${symbol}-60m-730d.json`);
  if (!existsSync(file)) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=730d&interval=60m&includePrePost=true`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const body = (await response.json()) as { chart: { result: { timestamp: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] } };
    const r = body.chart.result[0];
    const bars: [number, number][] = [];
    r.timestamp.forEach((s, i) => {
      const c = r.indicators.quote[0].close[i];
      if (c != null) bars.push([s * 1000, c]);
    });
    mkdirSync(YAHOO_CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(bars));
    await new Promise((res) => setTimeout(res, 1500));
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Closes on an hourly grid (ms), forward filled; a bar's close is known one hour after its start for Yahoo. */
function grid(bars: [number, number][], hours: number[], lagMs: number): (number | null)[] {
  const sorted = bars.map(([t, c]) => [t + lagMs, c] as [number, number]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  let last: number | null = null;
  return hours.map((h) => {
    while (j < sorted.length && sorted[j][0] <= h) last = sorted[j++][1];
    return last;
  });
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;

async function main() {
  const now = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const sets: { name: string; symbols: string[]; hours: number[]; series: Record<string, (number | null)[]>; years: number[] }[] = [];
  {
    const hours: number[] = [];
    for (let h = BINANCE_FIRST_HOUR; h < now; h += HOUR_MS) hours.push(h);
    const series: Record<string, (number | null)[]> = {};
    for (const s of ["BTC", "ETH"]) series[s] = grid(await binanceCloses(BINANCE_SYMBOLS[s], now), hours, 0);
    sets.push({ name: "CRYPTO", symbols: ["BTC", "ETH"], hours, series, years: [2021, 2022, 2023, 2024, 2025, 2026] });
  }
  for (const [name, symbols] of [["INDEX", ["SPY", "QQQ"]], ["TECH", ["GOOGL", "META", "NVDA"]]] as const) {
    const bars = Object.fromEntries(await Promise.all(symbols.map(async (s) => [s, await yahoo60m(s)] as const)));
    const start = Math.max(...symbols.map((s) => bars[s][0][0])) + HOUR_MS;
    const hours: number[] = [];
    for (let h = Math.ceil(start / HOUR_MS) * HOUR_MS; h < now; h += HOUR_MS) hours.push(h);
    const series = Object.fromEntries(symbols.map((s) => [s, grid(bars[s], hours, HOUR_MS)]));
    sets.push({ name, symbols: [...symbols], hours, series, years: [2024, 2025, 2026] });
  }

  // One-market crypto sets too: the research rules were tested as one agent per market.
  for (const s of ["BTC", "ETH"]) {
    const crypto = sets[0];
    sets.push({ name: `CRYPTO ${s} only`, symbols: [s], hours: crypto.hours, series: { [s]: crypto.series[s] }, years: crypto.years });
  }

  const out: string[] = [];
  const log = (line: string) => {
    console.log(line);
    out.push(line);
  };
  for (const set of sets) {
    log(`\n${set.name} (${set.symbols.join(" ")}), ${new Date(set.hours[0]).toISOString().slice(0, 10)} to ${new Date(set.hours[set.hours.length - 1]).toISOString().slice(0, 10)}; years ${set.years.join(" / ")} (first stock year is partial)`);
    // hold per year, equal weight
    const holdYear = set.years.map((y) => {
      const i0 = set.hours.findIndex((h) => h >= Date.UTC(y, 0, 1));
      const i1 = set.hours.findLastIndex((h) => h < Date.UTC(y + 1, 0, 1));
      return (set.symbols.reduce((s, sym) => s + (set.series[sym][i1] as number) / (set.series[sym][i0] as number), 0) / set.symbols.length - 1) * 100;
    });
    log(`  ${"Hold (equal weight)".padEnd(32)} ${holdYear.map((v) => pct(v).padStart(7)).join("")}`);
    for (const preset of PRESETS) {
      const yearly: number[] = [];
      const drops: number[] = [];
      let trades = 0;
      let wholeEquity: number[] = [];
      if (preset.dca) {
        for (const y of set.years) {
          const i0 = Math.max(0, set.hours.findIndex((h) => h >= Date.UTC(y, 0, 1)));
          const i1 = set.hours.findLastIndex((h) => h < Date.UTC(y + 1, 0, 1));
          const params = { ...(preset.params as Record<string, unknown>), dca: { buys: 52, everyHours: 168, startTs: set.hours[i0] / 1000 } };
          const r = simulate({ series: set.series, params, capital: CAPITAL, fromIndex: i0, toIndex: i1, times: set.hours.map((h) => h / 1000) });
          yearly.push(r.returnPct);
          drops.push(r.maxDrawdownPct);
          trades += r.fills.length;
        }
      } else {
        const fromIndex = Math.min(preset.name.startsWith("Vol Trend") ? WARMUP : 200, set.hours.length - 1);
        const r = simulate({ series: set.series, params: preset.params as Record<string, unknown>, capital: CAPITAL, fromIndex, times: set.hours.map((h) => h / 1000) });
        wholeEquity = r.runs.map((run: { equity: number }) => run.equity);
        const runHours = r.runs.map((run: { index: number }) => set.hours[run.index]);
        for (const y of set.years) {
          const idx = runHours.map((h: number, i: number) => [h, i] as const).filter(([h]: readonly [number, number]) => h >= Date.UTC(y, 0, 1) && h < Date.UTC(y + 1, 0, 1)).map(([, i]: readonly [number, number]) => i);
          if (!idx.length) {
            yearly.push(NaN);
            continue;
          }
          const start = idx[0] > 0 ? wholeEquity[idx[0] - 1] : CAPITAL;
          yearly.push((wholeEquity[idx[idx.length - 1]] / start - 1) * 100);
        }
        drops.push(r.maxDrawdownPct);
        trades = r.fills.length;
      }
      const drop = Math.max(...drops);
      const positive = yearly.filter((v) => v > 0).length;
      const tested = set.years.length >= 6 && positive >= 4 && drop < 30;
      log(
        `  ${preset.name.padEnd(32)} ${yearly.map((v) => (Number.isNaN(v) ? "     -" : pct(v)).padStart(7)).join("")}   worst drop ${drop.toFixed(0)}%  fills ${trades}  -> ${tested ? "TESTED" : set.years.length < 6 ? "Experiment (only " + set.years.length + " years of hourly data)" : `Experiment (${positive}/6 years positive, drop ${drop.toFixed(0)}%)`}`,
      );
      void maxDrawdown;
    }
  }
  if (process.env.OUT) writeFileSync(process.env.OUT, out.join("\n"));
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.stack : cause);
  process.exit(1);
});
