/**
 * One-off (re-runnable) backfill of hourly candles for every enabled token,
 * from the newest complete hour back to the start of its price pool.
 *
 *   npm run backfill            all enabled tokens
 *   npm run backfill -- NVDA    only the symbols given
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .dev.vars. Upserts by
 * (token, hour), so running it again only fills gaps. Also sets
 * tokens.history_start to each token's first stored hour.
 *
 * Lighter perps (venue lighter) come from Lighter's public API instead, with hourly
 * funding, from PERPS_HISTORY_START on.
 *
 * Runs with plain Node 24 (built-in TypeScript type stripping, no build step).
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import {
  completeHoursOnly,
  fetchHourlyCandles,
  MAX_CANDLES_PER_CALL,
  REQUEST_SPACING_MS,
  sleep,
  toCandleRow,
  type Candle,
} from "../lib/prices/geckoterminal.ts";
import { fetchLighterHours, LIGHTER_MAX_HOURS_PER_CALL, type LighterRow } from "../lib/prices/lighter.ts";

const MAX_PAGES_PER_TOKEN = 6; // 6 x 1000 hours is far more than any pool's age today
const UPSERT_CHUNK = 500;
const HOUR_MS = 3_600_000;
/** Lighter's Robinhood Chain perps have hourly history from about 2026-06-26. */
const PERPS_HISTORY_START = Date.UTC(2026, 5, 26);

/** Every complete hour of one Lighter perp since PERPS_HISTORY_START, oldest first. */
async function lighterHistory(address: string, marketId: number): Promise<LighterRow[]> {
  const now = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const rows: LighterRow[] = [];
  for (let from = PERPS_HISTORY_START; from < now; from += LIGHTER_MAX_HOURS_PER_CALL * HOUR_MS) {
    rows.push(...(await fetchLighterHours(address, marketId, from, Math.min(from + LIGHTER_MAX_HOURS_PER_CALL * HOUR_MS, now))));
    await sleep(1100); // Lighter allows 60 requests a minute; each page is two
  }
  return rows;
}

function readDevVars(): Record<string, string> {
  const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).trim()];
      }),
  );
}

async function main() {
  const vars = readDevVars();
  if (!vars.SUPABASE_URL || !vars.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .dev.vars");
  }
  const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const only = new Set(process.argv.slice(2).map((symbol) => symbol.toUpperCase()));
  const { data: tokens, error } = await db.from("tokens").select("address, symbol, price_pool, venue, lighter_market_id").eq("enabled", true).order("symbol");
  if (error) throw new Error(`Loading tokens failed: ${error.message}`);
  const selected = tokens.filter((token) => !only.size || only.has(token.symbol));

  let total = 0;
  for (const token of selected) {
    if (token.venue === "lighter") {
      const rows = await lighterHistory(token.address, Number(token.lighter_market_id));
      for (let start = 0; start < rows.length; start += UPSERT_CHUNK) {
        const { error: upsertError } = await db.from("candles").upsert(rows.slice(start, start + UPSERT_CHUNK), { onConflict: "token_address,ts" });
        if (upsertError) throw new Error(`${token.symbol}: ${upsertError.message}`);
      }
      if (rows.length) await db.from("tokens").update({ history_start: rows[0].ts }).eq("address", token.address);
      total += rows.length;
      const withFunding = rows.filter((row) => row.funding_rate !== null).length;
      console.log(`${token.symbol.padEnd(9)} ${String(rows.length).padStart(5)} hours  ${rows[0]?.ts.slice(0, 16) ?? "none"} to ${rows.at(-1)?.ts.slice(0, 16) ?? "none"}  (${withFunding} with funding)`);
      continue;
    }
    const candles: Candle[] = [];
    let before: number | undefined;
    for (let page = 0; page < MAX_PAGES_PER_TOKEN; page++) {
      const batch = await fetchHourlyCandles({ pool: token.price_pool, token: token.address, before });
      await sleep(REQUEST_SPACING_MS);
      if (!batch.length) break;
      candles.unshift(...batch);
      before = batch[0].time;
      if (batch.length < MAX_CANDLES_PER_CALL) break; // reached the start of the pool
    }

    // Pages can overlap by one hour at the boundary: keep each hour once.
    const unique = [...new Map(candles.map((candle) => [candle.time, candle])).values()].sort((a, b) => a.time - b.time);
    const complete = completeHoursOnly(unique);
    for (let start = 0; start < complete.length; start += UPSERT_CHUNK) {
      const rows = complete.slice(start, start + UPSERT_CHUNK).map((candle) => toCandleRow(token.address, candle));
      const { error: upsertError } = await db.from("candles").upsert(rows, { onConflict: "token_address,ts" });
      if (upsertError) throw new Error(`${token.symbol}: ${upsertError.message}`);
    }

    // history_start comes from what is stored, so reruns and partial runs stay correct.
    const { data: first } = await db
      .from("candles")
      .select("ts")
      .eq("token_address", token.address)
      .order("ts", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (first) await db.from("tokens").update({ history_start: first.ts }).eq("address", token.address);

    total += complete.length;
    const hourLabel = (candle: Candle) => toCandleRow(token.address, candle).ts.slice(0, 16);
    const range = complete.length ? `${hourLabel(complete[0])} to ${hourLabel(complete[complete.length - 1])}` : "no candles";
    console.log(`${token.symbol.padEnd(6)} ${String(complete.length).padStart(5)} hours  ${range}`);
  }
  console.log(`Done: ${total} candles for ${selected.length} tokens.`);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
