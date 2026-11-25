import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildCloseSeries, HOUR_SECONDS, OUTLIER_WINDOW, type CloseCandle } from "@/lib/engine/series";

/** Hours of closes sent to pages: 30 day backtests + a week of look-back + spare. */
export const MARKET_HOURS = 900;
/**
 * Hours the hourly runner loads: enough for the longest rule an agent runs (the alt perps Lab
 * agents' 1,200 hour average, plus one hour) and a week of catch-up. Pages keep MARKET_HOURS.
 */
export const RUNNER_MARKET_HOURS = 1400;

export type AssetClass = "stock" | "crypto";
/** uniswap: stock and crypto tokens on the DEX; lighter: perps (paper only, Lab agents). */
export type MarketVenue = "uniswap" | "lighter";

export type MarketToken = {
  address: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  /** Index of the first hour with a price, or null if none in the window. */
  firstIndex: number | null;
  /** One cleaned close per hour (forward-filled, outliers removed); null before the first price. */
  closes: (number | null)[];
  venue: MarketVenue;
  /** Perps only: funding per hour as a signed fraction (positive: longs pay); null when unknown. */
  funding?: (number | null)[];
  /** Perps only: open interest (coins) stored each hour from 2026-11-16, for the Lab oiChange gate; null when not stored. */
  openInterest?: (number | null)[];
};

export type Market = {
  /** Start of the first hour, unix seconds. */
  startTs: number;
  hours: number;
  tokens: MarketToken[];
};

type RawToken = { address: string; symbol: string; name: string; assetClass?: AssetClass; venue?: MarketVenue; candles: [number, number, (number | null)?, (number | null)?][] };

// Prices change once an hour; keep a built snapshot for a few minutes per Worker isolate.
const CACHE_MS = 5 * 60 * 1000;
const cached = new Map<number, { at: number; market: Market }>();

/**
 * The last MARKET_HOURS hourly closes of every enabled token, aligned to the
 * same hours and cleaned exactly like the live engine sees them.
 *
 * Perps (venue lighter) are left out unless `perps` is set: they are paper only and so
 * far run only for Lab agents, so market lists, the Studio, Swap and the APIs never
 * show them. The agent runner and agent pages ask for them.
 */
export async function getMarket(db: SupabaseClient, options: { perps?: boolean; hours?: number; fresh?: boolean } = {}): Promise<Market> {
  const market = await loadMarket(db, options.hours ?? MARKET_HOURS, options.fresh ?? false);
  return options.perps ? market : { ...market, tokens: market.tokens.filter((token) => token.venue !== "lighter") };
}

/**
 * @param fresh  The hourly agent runners: skip both caches and read the candles directly, so a decision
 *               never rests on a stored result (pages use the cached database function).
 */
async function loadMarket(db: SupabaseClient, hours: number, fresh: boolean): Promise<Market> {
  const hit = fresh ? undefined : cached.get(hours);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.market;

  const latest = await latestCandleTime(db);
  if (latest === null) return { startTs: 0, hours: 0, tokens: [] };
  const startTs = latest - (hours - 1) * HOUR_SECONDS;
  // Load a day earlier than the window so the outlier filter starts warm.
  const from = startTs - OUTLIER_WINDOW * HOUR_SECONDS;

  const pFrom = new Date(from * 1000).toISOString();
  // Pages: candle_closes_cached (supabase/migrations/20261125000400) keeps the result while no candle
  // changed. If that function is missing (not migrated yet) or fails, fall back to the direct one.
  let { data, error } = fresh ? await db.rpc("candle_closes", { p_from: pFrom }) : await db.rpc("candle_closes_cached", { p_from: pFrom });
  if (error && !fresh) ({ data, error } = await db.rpc("candle_closes", { p_from: pFrom }));
  if (error) throw new Error(`Loading prices failed: ${error.message}`);

  const tokens = (data as RawToken[]).map((token) => {
    const candles: CloseCandle[] = token.candles.map(([time, close]) => ({ time: Number(time), close: Number(close) }));
    const series = buildCloseSeries(candles, startTs, latest);
    const firstIndex = series.closes.findIndex((close) => close !== null);
    const venue = token.venue ?? "uniswap";
    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      assetClass: token.assetClass ?? "stock",
      firstIndex: firstIndex === -1 ? null : firstIndex,
      closes: series.closes,
      venue,
      ...(venue === "lighter" ? { funding: hourlySeries(token.candles, 2, startTs, latest), openInterest: hourlySeries(token.candles, 3, startTs, latest) } : {}),
    };
  });

  const market = { startTs, hours, tokens };
  if (!fresh) cached.set(hours, { at: Date.now(), market });
  return market;
}

/** One stored perps value per hour (2: funding rate, 3: open interest) from startTs to latest (inclusive); missing hours are null. */
function hourlySeries(candles: RawToken["candles"], column: 2 | 3, startTs: number, latest: number): (number | null)[] {
  const byTime = new Map(candles.map((candle) => [Number(candle[0]), candle[column] == null ? null : Number(candle[column])]));
  const out: (number | null)[] = [];
  for (let time = startTs; time <= latest; time += HOUR_SECONDS) out.push(byTime.get(time) ?? null);
  return out;
}

/** Start of the newest stored hour (unix seconds), or null with no data. */
export async function latestCandleTime(db: SupabaseClient): Promise<number | null> {
  const { data, error } = await db.from("candles").select("ts").order("ts", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Loading the latest price failed: ${error.message}`);
  return data ? Date.parse(data.ts) / 1000 : null;
}

/** Forget the cached snapshot (after the hourly tick wrote new prices). */
export function clearMarketCache() {
  cached.clear();
}
