import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { completeHoursOnly, fetchHourlyCandles, repairBatch, REQUEST_SPACING_MS, sleep, toCandleRow } from "@/lib/prices/geckoterminal";
import { blockBefore, checkAgainstFeeds, createChainClient, readFeedPrices, readPrices, type PricePool } from "@/lib/prices/onchain";

const HOUR_MS = 3_600_000;
/**
 * How far back missing hours are filled from chain. Covers a day of missed
 * ticks; each missing hour costs about 15 RPC calls, so a full day stays well
 * inside one tick.
 */
const CATCH_UP_HOURS = 24;
/** Tokens whose GeckoTerminal candles are re-fetched per tick; all 22 every 11 hours. */
const REPAIR_TOKENS_PER_TICK = 2;
/** Hours re-read for a repaired token; longer than the rotation so no hour is skipped. */
const REPAIR_LOOKBACK_HOURS = 24;

export type IngestResult = {
  tokens: number;
  /** Start of the hour that just ended, the newest hour this tick closes. */
  snapshotHour: string;
  /** Hours read from chain this tick (oldest first); usually just the one that ended. */
  hoursFilled: string[];
  /** Candles written from chain. */
  snapshots: number;
  repaired: string[];
  repairedCandles: number;
  /** Steps that broke the tick: agents may miss an hour. */
  failed: { step: string; error: string }[];
  /** Best-effort steps that did not work (GeckoTerminal, a stale Chainlink feed); the tick is still fine. */
  warnings: { step: string; error: string }[];
  /** Pool closes not stored because they disagreed with Chainlink; that hour is retried next tick. */
  rejected: { symbol: string; hour: string; pool: number; feed: number }[];
};

/**
 * Hourly price ingest.
 *
 * 1. On chain (the source of truth): for every complete hour of the last day
 *    that some token is missing, read each token's USDG pool at the last
 *    block of that hour and store it as the hour's close. Normally that is
 *    only the hour that just ended; after missed ticks it fills the gap.
 *    An existing candle is never overwritten. Tokens with a Chainlink feed
 *    (crypto) only get the close when the pool agrees with the feed at that
 *    same block; otherwise the hour stays missing and agents skip it.
 * 2. GeckoTerminal repair (best effort): two tokens, in rotation, get real
 *    open/high/low/close candles for the last day. GeckoTerminal often
 *    answers 429 to Cloudflare's shared IPs; then this is skipped, not retried.
 *
 * Safe to run twice in the same hour.
 */
export async function ingestLatestCandles(db: SupabaseClient, nowMs: number = Date.now()): Promise<IngestResult> {
  const { data: tokens, error } = await db
    .from("tokens")
    .select("address, symbol, price_pool, pool_kind, stock_is_token0, token_decimals, history_start, chainlink_feed")
    .eq("enabled", true)
    .order("symbol");
  if (error) throw new Error(`Loading tokens failed: ${error.message}`);

  const currentHourStart = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  const result: IngestResult = {
    tokens: tokens.length,
    snapshotHour: new Date(currentHourStart - HOUR_MS).toISOString(),
    hoursFilled: [],
    snapshots: 0,
    repaired: [],
    repairedCandles: 0,
    failed: [],
    warnings: [],
    rejected: [],
  };
  const symbolOf = new Map(tokens.map((token) => [token.address, token.symbol]));
  const feedOf = new Map(tokens.filter((token) => token.chainlink_feed).map((token) => [token.address, token.chainlink_feed as string]));

  try {
    const missing = await missingHours(db, 
      tokens.map((token) => ({ address: token.address, historyStart: token.history_start ? Date.parse(token.history_start) : null })),
      currentHourStart,
    );
    const pools: PricePool[] = tokens.map((token) => ({
      address: token.address,
      pool: token.price_pool,
      kind: token.pool_kind,
      stockIsToken0: token.stock_is_token0,
      tokenDecimals: token.token_decimals,
    }));
    const chain = createChainClient(env.robinhoodRpcUrl);

    for (const [hourStartMs, addresses] of missing) {
      // The close of an hour is the market at the last block before it ends.
      const block = await blockBefore(chain, (hourStartMs + HOUR_MS) / 1000);
      const poolPrices = await readPrices(
        chain,
        pools.filter((pool) => addresses.has(pool.address)),
        block,
      );
      const feeds = new Map([...feedOf].filter(([address]) => addresses.has(address)));
      const check = checkAgainstFeeds(poolPrices, new Set(feeds.keys()), await readFeedPrices(chain, feeds, block), (hourStartMs + HOUR_MS) / 1000);
      const hourLabel = new Date(hourStartMs).toISOString();
      for (const miss of check.rejected) result.rejected.push({ symbol: symbolOf.get(miss.address) ?? miss.address, hour: hourLabel, pool: miss.pool, feed: miss.feed });
      for (const address of check.unchecked) result.warnings.push({ step: `chainlink ${symbolOf.get(address) ?? address}`, error: `feed missing or stale at ${hourLabel}; pool price kept` });
      const prices = check.accepted;
      const rows = [...prices].map(([address, price]) =>
        toCandleRow(address, { time: hourStartMs / 1000, open: price, high: price, low: price, close: price, volumeUsd: 0 }, "onchain"),
      );
      if (!rows.length) continue;
      // ignoreDuplicates: never overwrite a candle that is already stored.
      const { error: insertError } = await db.from("candles").upsert(rows, { onConflict: "token_address,ts", ignoreDuplicates: true });
      if (insertError) throw new Error(insertError.message);
      result.hoursFilled.push(new Date(hourStartMs).toISOString());
      result.snapshots += rows.length;
    }
  } catch (cause) {
    result.failed.push({ step: "onchain", error: cause instanceof Error ? cause.message : String(cause) });
  }

  for (const token of repairBatch(tokens, currentHourStart / HOUR_MS, REPAIR_TOKENS_PER_TICK)) {
    await sleep(REQUEST_SPACING_MS);
    try {
      const candles = completeHoursOnly(
        await fetchHourlyCandles({ pool: token.price_pool, token: token.address, limit: REPAIR_LOOKBACK_HOURS + 1, maxRetries: 0 }),
        nowMs,
      );
      if (!candles.length) continue;
      const { error: repairError } = await db
        .from("candles")
        .upsert(candles.map((candle) => toCandleRow(token.address, candle)), { onConflict: "token_address,ts" });
      if (repairError) throw new Error(repairError.message);
      result.repaired.push(token.symbol);
      result.repairedCandles += candles.length;
    } catch (cause) {
      result.warnings.push({ step: `repair ${token.symbol}`, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  return result;
}

/**
 * Complete hours of the last day that lack a candle for some token, oldest
 * first, each with the tokens it lacks. A token is expected from its
 * history_start on; a token without history yet only gets the newest hour.
 */
async function missingHours(db: SupabaseClient, tokens: { address: string; historyStart: number | null }[], currentHourStart: number): Promise<Map<number, Set<string>>> {
  const from = currentHourStart - CATCH_UP_HOURS * HOUR_MS;
  // 22 tokens x 24 hours stays below the 1,000 row default limit.
  const { data, error } = await db
    .from("candles")
    .select("token_address, ts")
    .in(
      "token_address",
      tokens.map((token) => token.address),
    )
    .gte("ts", new Date(from).toISOString());
  if (error) throw new Error(`Loading recent candles failed: ${error.message}`);
  const stored = new Set(data.map((row) => `${row.token_address}@${Date.parse(row.ts)}`));

  const missing = new Map<number, Set<string>>();
  for (let hour = from; hour < currentHourStart; hour += HOUR_MS) {
    const isNewest = hour === currentHourStart - HOUR_MS;
    for (const token of tokens) {
      const expected = token.historyStart === null ? isNewest : token.historyStart <= hour;
      if (!expected || stored.has(`${token.address}@${hour}`)) continue;
      const set = missing.get(hour) ?? new Set<string>();
      set.add(token.address);
      missing.set(hour, set);
    }
  }
  return missing;
}
