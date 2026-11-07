/**
 * Hourly candles and funding for perps on Lighter's exchange on Robinhood Chain
 * (docs/perps-research.md). Public API, no key. Used by the hourly ingest and the
 * backfill script, so no server-only imports here.
 *
 * Funding: Lighter pays it at each hour mark. The payment at T covers the hour that ended
 * at T, so it is stored on the candle that starts at T - 1h: an agent holding through an
 * hour pays that hour's funding. The API's `rate` is in percent, and direction "long" means
 * longs pay shorts (docs.lighter.xyz/trading/funding). Stored as a signed fraction,
 * positive when longs pay.
 */

export const LIGHTER_API = "https://api.rh.lighter.xyz/api/v1";
const HOUR_MS = 3_600_000;
/** Most candles the API returns per call. */
export const LIGHTER_MAX_HOURS_PER_CALL = 480;

type ApiCandle = { t: number; o: number; h: number; l: number; c: number; V?: number };
type ApiFunding = { timestamp: number; rate: string; direction: "long" | "short" };

export type LighterRow = {
  token_address: string;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume_usd: number;
  source: "lighter";
  funding_rate: number | null;
};

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Lighter ${response.status} for ${url.replace(LIGHTER_API, "")}`);
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Complete hours from `fromMs` (inclusive) to `toMs` (exclusive, an hour start: the hour
 * that starts there is not complete yet) as candle rows with funding.
 */
export async function fetchLighterHours(tokenAddress: string, marketId: number, fromMs: number, toMs: number): Promise<LighterRow[]> {
  const range = `market_id=${marketId}&resolution=1h&start_timestamp=${fromMs}&end_timestamp=${toMs + HOUR_MS}`;
  const [candles, fundings] = await Promise.all([
    getJson(`${LIGHTER_API}/candles?${range}&count_back=${LIGHTER_MAX_HOURS_PER_CALL}`),
    getJson(`${LIGHTER_API}/fundings?${range}&count_back=${LIGHTER_MAX_HOURS_PER_CALL}`),
  ]);
  return toLighterRows(tokenAddress, (candles.c as ApiCandle[]) ?? [], (fundings.fundings as ApiFunding[]) ?? [], fromMs, toMs);
}

/** Pure part of fetchLighterHours, for tests. */
export function toLighterRows(tokenAddress: string, candles: ApiCandle[], fundings: ApiFunding[], fromMs: number, toMs: number): LighterRow[] {
  const fundingByHourStart = new Map<number, number>();
  for (const funding of fundings) {
    const paidAt = Math.floor((funding.timestamp * 1000) / HOUR_MS) * HOUR_MS;
    const rate = (Number(funding.rate) / 100) * (funding.direction === "long" ? 1 : -1);
    if (Number.isFinite(rate)) fundingByHourStart.set(paidAt - HOUR_MS, rate);
  }
  const rows: LighterRow[] = [];
  for (const candle of candles) {
    const start = Math.floor(candle.t / HOUR_MS) * HOUR_MS;
    if (start < fromMs || start >= toMs || !(candle.c > 0)) continue;
    rows.push({
      token_address: tokenAddress,
      ts: new Date(start).toISOString(),
      open: candle.o,
      high: candle.h,
      low: candle.l,
      close: candle.c,
      volume_usd: candle.V ?? 0,
      source: "lighter",
      funding_rate: fundingByHourStart.get(start) ?? null,
    });
  }
  return rows;
}
