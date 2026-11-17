/**
 * Research only (read-only, no database): what did the first months look like for big, much-watched US IPOs?
 * (2026-11-17, owner: "All four" for the $ANT / Anthropic IPO pieces.) Context for the $ANT token launch on
 * Robinhood Chain and the Lab "IPO Day" DCA agent. Not advice; past IPOs do not predict this one.
 *
 * Everything below was fixed before the first run.
 *
 * IPOs (fixed list, high-profile tech or crypto-related listings with Yahoo daily data from day one):
 *   BABA 2014, UBER 2019, SNOW 2020, ABNB 2020, COIN 2021 (direct listing), RIVN 2021, ARM 2023, RDDT 2024,
 *   CRWV 2025, CRCL 2025, FIG 2025, plus META 2012.
 * Prices: Yahoo daily closes (split-adjusted). Day 1 = the first close (buyers of the token at launch can rarely get
 * the IPO price; the first close is the honest "bought on day one" entry).
 * Reported per IPO, from the day 1 close: return after 5, 20, 60 and 120 trading days; worst fall from the day 1
 * close within 120 days; worst fall from the highest close within 120 days; and two ways to put money in:
 *   Day 1   buy everything at the day 1 close (0.5% cost)
 *   DCA 20  20 equal buys on the first 20 trading days (0.5% cost each), valued on day 60 and day 120
 * Summary: median and how many of the 12 were below their day 1 close on day 20, 60 and 120.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-ipo-first-month.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CACHE = process.env.YAHOO_CACHE ?? join(tmpdir(), "zolva-yahoo-cache");
const IPOS: [string, string][] = [
  ["META", "2012-05-18"],
  ["BABA", "2014-09-19"],
  ["UBER", "2019-05-10"],
  ["SNOW", "2020-09-16"],
  ["ABNB", "2020-12-10"],
  ["COIN", "2021-04-14"],
  ["RIVN", "2021-11-10"],
  ["ARM", "2023-09-14"],
  ["RDDT", "2024-03-21"],
  ["CRWV", "2025-03-28"],
  ["CRCL", "2025-06-05"],
  ["FIG", "2025-07-31"],
];
const COST = 0.005;

async function daily(symbol: string): Promise<{ day: string; close: number }[]> {
  const file = join(CACHE, `${symbol}-1d-max.json`);
  if (!existsSync(file)) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=max&interval=1d`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const body = (await response.json()) as {
      chart: { result: { timestamp: number[]; indicators: { quote: { close: (number | null)[] }[]; adjclose?: { adjclose: (number | null)[] }[] } }[] };
    };
    const r = body.chart.result[0];
    const closes = r.indicators.adjclose?.[0]?.adjclose ?? r.indicators.quote[0].close;
    const bars = r.timestamp.map((s, i) => [s * 1000, closes[i]] as const).filter(([, c]) => c != null);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(bars));
    await new Promise((res) => setTimeout(res, 1500));
  }
  const bars: [number, number][] = JSON.parse(readFileSync(file, "utf8"));
  return bars.map(([t, c]) => ({ day: new Date(t).toISOString().slice(0, 10), close: c }));
}

const pct = (v: number | null) => (v == null ? "    -" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`.padStart(5));
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function main() {
  const rows: Record<string, number | null>[] = [];
  console.log("IPO    first day    d5    d20   d60   d120  worst vs d1  worst from top  Day1@60  DCA20@60  Day1@120  DCA20@120");
  for (const [symbol, ipoDay] of IPOS) {
    const all = await daily(symbol);
    const bars = all.filter((b) => b.day >= ipoDay);
    if (!bars.length) {
      console.log(`${symbol}: no data`);
      continue;
    }
    if (bars[0].day !== ipoDay) console.log(`  note: ${symbol} first Yahoo day ${bars[0].day} (expected ${ipoDay})`);
    const c0 = bars[0].close;
    const at = (n: number) => (bars[n] ? bars[n].close / c0 - 1 : null);
    const window = bars.slice(0, 121);
    let peak = c0;
    let worstFromTop = 0;
    let worstVsD1 = 0;
    for (const b of window) {
      peak = Math.max(peak, b.close);
      worstFromTop = Math.max(worstFromTop, 1 - b.close / peak);
      worstVsD1 = Math.min(worstVsD1, b.close / c0 - 1);
    }
    const day1Value = (n: number) => (bars[n] ? (1 - COST) * (bars[n].close / c0) - 1 : null);
    const dcaValue = (n: number) => {
      if (!bars[n] || bars.length < 20) return null;
      const units = bars.slice(0, 20).reduce((s, b) => s + ((1 / 20) * (1 - COST)) / b.close, 0);
      return units * bars[n].close - 1;
    };
    const row = { d5: at(5), d20: at(20), d60: at(60), d120: at(120), worstVsD1, worstFromTop: -worstFromTop, day1_60: day1Value(60), dca_60: dcaValue(60), day1_120: day1Value(120), dca_120: dcaValue(120) };
    rows.push(row);
    console.log(
      `${symbol.padEnd(5)}  ${bars[0].day}  ${pct(row.d5)} ${pct(row.d20)} ${pct(row.d60)} ${pct(row.d120)}  ${pct(row.worstVsD1).padStart(11)}  ${pct(row.worstFromTop).padStart(14)}  ${pct(row.day1_60).padStart(7)}  ${pct(row.dca_60).padStart(8)}  ${pct(row.day1_120).padStart(8)}  ${pct(row.dca_120).padStart(9)}`,
    );
  }
  const col = (k: string) => rows.map((r) => r[k]).filter((v): v is number => v != null);
  console.log(`\nMedian: d5 ${pct(median(col("d5")))}, d20 ${pct(median(col("d20")))}, d60 ${pct(median(col("d60")))}, d120 ${pct(median(col("d120")))}; worst vs day 1 ${pct(median(col("worstVsD1")))}; worst from top ${pct(median(col("worstFromTop")))}`);
  for (const k of ["d20", "d60", "d120"]) console.log(`Below the day 1 close on ${k}: ${col(k).filter((v) => v < 0).length} of ${col(k).length}`);
  const pairs = (a: string, b: string) => rows.filter((r) => r[a] != null && r[b] != null);
  for (const n of ["60", "120"]) {
    const p = pairs(`day1_${n}`, `dca_${n}`);
    console.log(`DCA over 20 days beat buying on day 1 (value on day ${n}): ${p.filter((r) => (r[`dca_${n}`] as number) > (r[`day1_${n}`] as number)).length} of ${p.length}; median Day1 ${pct(median(p.map((r) => r[`day1_${n}`] as number)))}, DCA ${pct(median(p.map((r) => r[`dca_${n}`] as number)))}`);
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
