/* eslint-disable @typescript-eslint/no-explicit-any -- read-only research script over Lighter's untyped public API JSON */
/**
 * Shared by the perps research scripts (read-only): hourly candles and funding from
 * Lighter's public API on Robinhood Chain (docs/perps-research.md).
 *
 * Downloads are cached in LIGHTER_CACHE (default: the OS temp folder), one file per
 * market and kind, so reruns make no requests and see the same hours. Delete the folder
 * to refresh.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API = "https://api.rh.lighter.xyz/api/v1";
export const HOUR_MS = 3_600_000;
/** Lighter RH crypto candles start on 2026-06-26, stock perps on 2026-06-30. */
export const FIRST_HOUR = Date.UTC(2026, 6, 1);
const CACHE = process.env.LIGHTER_CACHE ?? join(tmpdir(), "zolva-lighter-cache");

/** Closes forward filled to every hour, and funding per hour as a signed fraction (positive: longs pay shorts). */
export type Market = { closes: number[]; funding: number[] };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    // Retries 429s and dropped connections with a growing pause.
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (response?.ok) return response.json();
    if (attempt >= 5) throw new Error(`${response?.status ?? "network error"} ${url}`);
    await sleep(5000 * (attempt + 1));
  }
}

/** Pages through an hourly history endpoint, oldest first; cached per market. */
async function history(kind: "candles" | "fundings", marketId: number, until: number) {
  const file = join(CACHE, `${kind}-${marketId}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const pageHours = kind === "candles" ? 480 : 720;
  const rows: any[] = [];
  for (let from = FIRST_HOUR - HOUR_MS; from < until; from += pageHours * HOUR_MS) {
    const to = Math.min(from + pageHours * HOUR_MS, until);
    const body = await getJson(`${API}/${kind}?market_id=${marketId}&resolution=1h&start_timestamp=${from}&end_timestamp=${to}&count_back=${pageHours}`);
    rows.push(...(kind === "candles" ? body.c ?? [] : body.fundings ?? []));
    await sleep(1100); // stay under the 60 requests a minute limit
  }
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(rows));
  return rows;
}

/** One market aligned to `hours` (Lighter omits empty hours); null when it has no price yet at the first hour. */
export async function loadMarket(marketId: number, hours: number[], until: number): Promise<Market | null> {
  const candles = await history("candles", marketId, until);
  const fundings = await history("fundings", marketId, until);
  const closeAt = new Map<number, number>(candles.map((row: any) => [Math.floor(row.t / HOUR_MS) * HOUR_MS, Number(row.c)]));
  // The API's rate is in percent; direction "long" means longs pay (docs.lighter.xyz/trading/funding).
  const fundingAt = new Map<number, number>(
    fundings.map((row: any) => [Math.floor((row.timestamp * 1000) / HOUR_MS) * HOUR_MS, (Number(row.rate) / 100) * (row.direction === "long" ? 1 : -1)]),
  );
  const closes: number[] = [];
  let last: number | null = null;
  for (const hour of hours) {
    last = closeAt.get(hour) ?? last;
    if (last == null) return null;
    closes.push(last);
  }
  return { closes, funding: hours.map((hour) => fundingAt.get(hour) ?? 0) };
}
