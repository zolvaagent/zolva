/**
 * GeckoTerminal client for hourly USD candles of Robinhood Chain stock tokens.
 *
 * Kept free of Next.js and server-only imports so the one-off backfill script
 * (scripts/backfill-candles.mts, run with plain Node) can share it.
 *
 * Free tier: in testing about half of all calls got a 429 even 6.5s apart, so
 * the hourly tick uses one multi-pool snapshot plus a few spaced OHLCV calls
 * (see lib/prices/ingest.ts). This module retries a 429 a few times.
 */

const BASE_URL = "https://api.geckoterminal.com/api/v2/networks/robinhood";
const HOUR_SECONDS = 3600;
const RETRY_PAUSE_MS = 20_000;
const MAX_RETRIES = 3;

/**
 * Pause between two calls in a loop (about 9 a minute). At 3.1s the free tier
 * started answering 429 and retries stretched a 20 token tick to 4 minutes;
 * 6.5s ran 20 calls without a single 429.
 */
export const REQUEST_SPACING_MS = 6_500;

/** Most candles GeckoTerminal returns per call. */
export const MAX_CANDLES_PER_CALL = 1000;

export type Candle = {
  /** Start of the hour, unix seconds (UTC). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeUsd: number;
};

export type CandleRequest = {
  /** Pool address (v3) or pool id (v4) the token is priced from. */
  pool: string;
  /** Token address; makes GeckoTerminal return this token's USD price whichever side of the pool it is on. */
  token: string;
  limit?: number;
  /** Only candles before this unix second, for paging back in time. */
  before?: number;
  /** Times a 429 is retried after a pause; 0 gives up at once (the hourly tick). */
  maxRetries?: number;
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchHourlyCandles(request: CandleRequest, fetchImpl: typeof fetch = fetch): Promise<Candle[]> {
  const params = new URLSearchParams({
    aggregate: "1",
    currency: "usd",
    token: request.token,
    limit: String(request.limit ?? MAX_CANDLES_PER_CALL),
  });
  if (request.before) params.set("before_timestamp", String(request.before));
  const url = `${BASE_URL}/pools/${request.pool}/ohlcv/hour?${params}`;

  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(url, { headers: { accept: "application/json" } });
    if (response.status === 429 && attempt < (request.maxRetries ?? MAX_RETRIES)) {
      await sleep(RETRY_PAUSE_MS);
      continue;
    }
    if (!response.ok) {
      throw new Error(`GeckoTerminal ${response.status} for pool ${request.pool}`);
    }
    return parseOhlcv(await response.json());
  }
}

/**
 * Turns GeckoTerminal's `ohlcv_list` ([time, open, high, low, close, volume],
 * newest first) into validated candles, oldest first. Rows that are not on an
 * hour boundary or carry a non-positive price are dropped, not repaired.
 *
 * The same hour can appear twice in one response (seen for PLTR); the row with
 * more volume wins, since it reflects more trades.
 */
export function parseOhlcv(body: unknown): Candle[] {
  const list = (body as { data?: { attributes?: { ohlcv_list?: unknown } } })?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) throw new Error("GeckoTerminal response has no ohlcv_list");

  const byHour = new Map<number, Candle>();
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [time, open, high, low, close, volume] = row.map(Number);
    const prices = [open, high, low, close];
    if (!Number.isInteger(time) || time % HOUR_SECONDS !== 0) continue;
    if (prices.some((price) => !Number.isFinite(price) || price <= 0)) continue;
    const candle = { time, open, high, low, close, volumeUsd: Number.isFinite(volume) && volume > 0 ? volume : 0 };
    const existing = byHour.get(time);
    if (!existing || candle.volumeUsd > existing.volumeUsd) byHour.set(time, candle);
  }
  return [...byHour.values()].sort((a, b) => a.time - b.time);
}

/**
 * Drops the candle of the hour still in progress: its close is not final, and
 * an agent deciding on it would act on a price that later changes.
 */
export function completeHoursOnly(candles: Candle[], nowMs: number = Date.now()): Candle[] {
  const currentHourStart = Math.floor(nowMs / 1000 / HOUR_SECONDS) * HOUR_SECONDS;
  return candles.filter((candle) => candle.time < currentHourStart);
}

/** Max pools per multi-pool call. */
const MAX_POOLS_PER_CALL = 30;

/**
 * Current USD price of many tokens with one call per 30 pools (the hourly
 * snapshot). Returns token address (lowercase) to price; tokens whose pool is
 * missing from the response are simply absent.
 */
export async function fetchLatestPrices(
  requests: { pool: string; token: string }[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  for (let start = 0; start < requests.length; start += MAX_POOLS_PER_CALL) {
    const batch = requests.slice(start, start + MAX_POOLS_PER_CALL);
    const url = `${BASE_URL}/pools/multi/${batch.map((request) => request.pool).join(",")}?include=base_token,quote_token`;
    let response = await fetchImpl(url, { headers: { accept: "application/json" } });
    for (let attempt = 0; response.status === 429 && attempt < MAX_RETRIES; attempt++) {
      await sleep(RETRY_PAUSE_MS);
      response = await fetchImpl(url, { headers: { accept: "application/json" } });
    }
    if (!response.ok) throw new Error(`GeckoTerminal ${response.status} for the price snapshot`);
    for (const [token, price] of parseMultiPrices(await response.json(), batch.map((request) => request.token))) prices.set(token, price);
    if (start + MAX_POOLS_PER_CALL < requests.length) await sleep(REQUEST_SPACING_MS);
  }
  return prices;
}

/**
 * Reads each wanted token's USD price from a multi-pool response, whichever
 * side of its pool the token sits on (some are base, some are quote).
 */
export function parseMultiPrices(body: unknown, tokens: string[]): Map<string, number> {
  type Pool = {
    attributes?: { base_token_price_usd?: string; quote_token_price_usd?: string };
    relationships?: { base_token?: { data?: { id?: string } }; quote_token?: { data?: { id?: string } } };
  };
  type Included = { id?: string; attributes?: { address?: string } };
  const { data, included } = (body ?? {}) as { data?: Pool[]; included?: Included[] };
  if (!Array.isArray(data)) throw new Error("GeckoTerminal response has no pool list");

  const addressById = new Map((included ?? []).map((item) => [item.id, item.attributes?.address?.toLowerCase()]));
  const wanted = new Set(tokens.map((token) => token.toLowerCase()));
  const prices = new Map<string, number>();
  for (const pool of data) {
    const sides = [
      [addressById.get(pool.relationships?.base_token?.data?.id), pool.attributes?.base_token_price_usd],
      [addressById.get(pool.relationships?.quote_token?.data?.id), pool.attributes?.quote_token_price_usd],
    ] as const;
    for (const [address, raw] of sides) {
      const price = Number(raw);
      if (address && wanted.has(address) && Number.isFinite(price) && price > 0) prices.set(address, price);
    }
  }
  return prices;
}

/**
 * Which tokens get their real candles re-fetched this hour. Rotates through
 * the list so every token is repaired every ceil(n / perTick) hours.
 */
export function repairBatch<T>(items: T[], hourNumber: number, perTick: number): T[] {
  if (!items.length) return [];
  const count = Math.min(perTick, items.length);
  const start = (hourNumber * count) % items.length;
  return Array.from({ length: count }, (_, i) => items[(start + i) % items.length]);
}

/** Row shape of the `candles` table. */
export function toCandleRow(tokenAddress: string, candle: Candle, source: "ohlcv" | "snapshot" | "onchain" = "ohlcv") {
  return {
    token_address: tokenAddress,
    ts: new Date(candle.time * 1000).toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume_usd: candle.volumeUsd,
    source,
  };
}
