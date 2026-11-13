/**
 * Shared by the long-history research scripts (read-only): hourly closes from Binance's public market
 * data mirror (data-api.binance.vision, spot, no key). Used as a hold-out for rules found on the short
 * Lighter history (docs/perps-research.md). Spot prices, so no funding and not the same book as Lighter.
 *
 * Only the symbols that are the same asset as a Lighter perp are listed. Never add a symbol by name alone:
 * LITUSDT on Binance is Litentry, not Lighter's LIT.
 *
 * Downloads are cached in BINANCE_CACHE (default: the OS temp folder), one file per symbol holding
 * [hour start ms, close] pairs, so reruns make no requests. Delete the folder to refresh.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/binance-history.mts   (downloads all)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API = "https://data-api.binance.vision/api/v3/klines";
export const HOUR_MS = 3_600_000;
/** First hour of the common window: SOL's first Binance hourly bar is 2020-08-11. */
export const BINANCE_FIRST_HOUR = Date.UTC(2020, 7, 12);
const CACHE = process.env.BINANCE_CACHE ?? join(tmpdir(), "zolva-binance-cache");

/** Same asset as the Lighter perp of that name (checked 2026-11-13). */
export const BINANCE_SYMBOLS: Record<string, string> = { BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT", XRP: "XRPUSDT", NEAR: "NEARUSDT", ZEC: "ZECUSDT" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url: string): Promise<unknown[][]> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (response?.ok) return (await response.json()) as unknown[][];
    if (attempt >= 6) throw new Error(`${response?.status ?? "network error"} ${url}`);
    await sleep(3000 * (attempt + 1));
  }
}

/** [hour start ms, close] pairs, oldest first, from BINANCE_FIRST_HOUR to `until`; cached per symbol. */
export async function binanceCloses(symbol: string, until: number): Promise<[number, number][]> {
  const file = join(CACHE, `${symbol}-1h.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const rows: [number, number][] = [];
  for (let from = BINANCE_FIRST_HOUR; from < until; ) {
    const page = await getJson(`${API}?symbol=${symbol}&interval=1h&startTime=${from}&endTime=${until}&limit=1000`);
    if (!page.length) break;
    for (const row of page) rows.push([Number(row[0]), Number(row[4])]);
    from = Number(page[page.length - 1][0]) + HOUR_MS;
    await sleep(250);
  }
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(rows));
  return rows;
}

/** One market aligned to `hours`, forward filling missing hours; null when it has no price at the first hour. */
export async function loadBinanceMarket(symbol: string, hours: number[], until: number): Promise<number[] | null> {
  const rows = await binanceCloses(symbol, until);
  const closeAt = new Map<number, number>(rows);
  const closes: number[] = [];
  let last: number | null = null;
  for (const hour of hours) {
    last = closeAt.get(hour) ?? last;
    if (last == null) return null;
    closes.push(last);
  }
  return closes;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const until = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  for (const [name, symbol] of Object.entries(BINANCE_SYMBOLS)) {
    const rows = await binanceCloses(symbol, until);
    console.log(`${name} (${symbol}): ${rows.length} bars, ${new Date(rows[0][0]).toISOString().slice(0, 10)} to ${new Date(rows[rows.length - 1][0]).toISOString().slice(0, 13)}Z`);
  }
}
