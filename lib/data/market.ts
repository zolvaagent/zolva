import "server-only";

import { buildCloseSeries, HOUR_SECONDS, OUTLIER_WINDOW, type CloseCandle } from "@/lib/engine/series";
import { db } from "@/lib/supabase";

/** Hours of closes sent to pages: 30 day backtests + a week of look-back + spare. */
export const MARKET_HOURS = 900;

export type MarketToken = {
  address: string;
  symbol: string;
  name: string;
  /** Index of the first hour with a price, or null if none in the window. */
  firstIndex: number | null;
  /** One cleaned close per hour (forward-filled, outliers removed); null before the first price. */
  closes: (number | null)[];
};

export type Market = {
  /** Start of the first hour, unix seconds. */
  startTs: number;
  hours: number;
  tokens: MarketToken[];
};

type RawToken = { address: string; symbol: string; name: string; candles: [number, number][] };

// Prices change once an hour; keep a built snapshot for a few minutes per Worker isolate.
const CACHE_MS = 5 * 60 * 1000;
let cached: { at: number; market: Market } | null = null;

/**
 * The last MARKET_HOURS hourly closes of every enabled token, aligned to the
 * same hours and cleaned exactly like the live engine sees them.
 */
export async function getMarket(): Promise<Market> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.market;

  const latest = await latestCandleTime();
  if (latest === null) return { startTs: 0, hours: 0, tokens: [] };
  const startTs = latest - (MARKET_HOURS - 1) * HOUR_SECONDS;
  // Load a day earlier than the window so the outlier filter starts warm.
  const from = startTs - OUTLIER_WINDOW * HOUR_SECONDS;

  const { data, error } = await db().rpc("candle_closes", { p_from: new Date(from * 1000).toISOString() });
  if (error) throw new Error(`Loading prices failed: ${error.message}`);

  const tokens = (data as RawToken[]).map((token) => {
    const candles: CloseCandle[] = token.candles.map(([time, close]) => ({ time: Number(time), close: Number(close) }));
    const series = buildCloseSeries(candles, startTs, latest);
    const firstIndex = series.closes.findIndex((close) => close !== null);
    return { address: token.address, symbol: token.symbol, name: token.name, firstIndex: firstIndex === -1 ? null : firstIndex, closes: series.closes };
  });

  const market = { startTs, hours: MARKET_HOURS, tokens };
  cached = { at: Date.now(), market };
  return market;
}

/** Start of the newest stored hour (unix seconds), or null with no data. */
export async function latestCandleTime(): Promise<number | null> {
  const { data, error } = await db().from("candles").select("ts").order("ts", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Loading the latest price failed: ${error.message}`);
  return data ? Date.parse(data.ts) / 1000 : null;
}

/** Forget the cached snapshot (after the hourly tick wrote new prices). */
export function clearMarketCache() {
  cached = null;
}
