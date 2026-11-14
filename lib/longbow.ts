/**
 * Longbow (longbow.finance): a Morpho Blue lending protocol on Robinhood Chain where
 * stock tokens, ETFs and ETH can be posted as collateral to borrow USDG. Zolva only
 * reads its market list, to say "Longbow lists a market for this token" with the market's
 * LLTV and a link. Nothing here borrows, lends or signs.
 *
 * The list comes from Longbow's own `/api/markets` JSON (undocumented, no key). It is
 * optional: any failure (down, slow, new shape) gives an empty list, so pages and the
 * public API carry on without the field. Markets are matched by collateral ADDRESS,
 * never by symbol (same-name clones exist; Longbow also lists "NVDAon" and similar).
 *
 * Available liquidity is deliberately not read: on Zolva's tokens it is 0 to ~93 USDG,
 * which would look broken next to a "borrow" number.
 *
 * Every link carries Zolva's Longbow builder code (`?builder=`). Longbow keeps it in the
 * visitor's browser for 30 days and pays Zolva 50% of its performance fee on the borrows
 * and deposits that follow, monthly in USDG. Pages that show the link say so.
 */

import { USDG } from "./live/contracts";

export const LONGBOW_URL = "https://www.longbow.finance";
/** Zolva's Longbow builder code, registered 2026-11-14 with Zolva's own wallet (longbow.finance/builders). */
export const LONGBOW_BUILDER_CODE = "Z68EKTE";
const MARKETS_URL = `${LONGBOW_URL}/api/markets`;

/** How long one read of the market list is reused (3 hours: listings change rarely). */
export const LONGBOW_TTL_SECONDS = 3 * 3600;
/** After a failed read, wait this long before trying again, so an outage does not slow every request. */
const FAILURE_RETRY_SECONDS = 5 * 60;

/** One Longbow market that lends USDG against a token, as Zolva shows it. */
export type LongbowListing = {
  /** Collateral token address, lowercase. */
  collateral: string;
  /** Liquidation loan-to-value, as a fraction (0.625 = 62.5%). */
  lltv: number;
  /** The market's borrow page on Longbow, with Zolva's builder code. */
  url: string;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
// Longbow's market keys are short ids (NVDA, SPY-WETH, CASHCAT_LEGACY); anything else is not linked.
const MARKET_KEY = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Reads Longbow's `/api/markets` body into one listing per collateral token. Keeps only
 * live, open, long markets that lend USDG (not WETH-loan, short or external markets).
 * When a token has more than one such market, the highest LLTV wins. Longbow's `enabled`
 * field is ignored on purpose: Longbow's own site never reads it, and markets with
 * enabled=false (AAPL, GLD, RDDT, AMC on 2026-11-13) are listed and borrowable there
 * like any other. It is not vault membership either. Unreadable entries
 * are skipped; a body that is not a list gives no listings.
 */
export function parseLongbowMarkets(body: unknown): LongbowListing[] {
  if (!Array.isArray(body)) return [];
  const best = new Map<string, LongbowListing>();
  for (const entry of body.slice(0, 1000)) {
    if (!entry || typeof entry !== "object") continue;
    const market = entry as Record<string, unknown>;
    if (market.status !== "live" || market.closed === true || market.isShort === true || market.external === true) continue;
    if (typeof market.loanAddress !== "string" || market.loanAddress.toLowerCase() !== USDG) continue;
    if (typeof market.collateralAddress !== "string" || !ADDRESS.test(market.collateralAddress)) continue;
    if (typeof market.key !== "string" || !MARKET_KEY.test(market.key)) continue;
    const lltv = market.lltv;
    if (typeof lltv !== "number" || !Number.isFinite(lltv) || lltv <= 0 || lltv >= 1) continue;

    const collateral = market.collateralAddress.toLowerCase();
    const current = best.get(collateral);
    if (current && current.lltv >= lltv) continue;
    best.set(collateral, { collateral, lltv, url: `${LONGBOW_URL}/borrow/${market.key}?builder=${LONGBOW_BUILDER_CODE}` });
  }
  return [...best.values()];
}

/** The listing for one token address, or null. */
export function longbowListingFor(listings: LongbowListing[], address: string): LongbowListing | null {
  const wanted = address.toLowerCase();
  return listings.find((listing) => listing.collateral === wanted) ?? null;
}

/** Fetches and parses the market list. Never throws: null means "could not read it". */
export async function fetchLongbowMarkets({ timeoutMs = 3000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<LongbowListing[] | null> {
  try {
    const response = await fetchImpl(MARKETS_URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!response.ok) return null;
    return parseLongbowMarkets(await response.json());
  } catch {
    return null;
  }
}

// Two cache layers: this isolate's memory (also works in next dev), then the Worker's
// edge cache (shared across isolates in a colo). Both hold the parsed listings only.
let memory: { listings: LongbowListing[]; until: number } | null = null;
// v2: links carry the builder code; the new key skips copies cached before that.
const EDGE_KEY = "https://cache.zolvaagent.app/longbow/markets-v2";

function edgeCache(): Cache | undefined {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default;
}

/**
 * Longbow's listings, cached for LONGBOW_TTL_SECONDS. Never throws and never waits more
 * than about 3 s: an empty list means "nothing to show", whatever the reason.
 */
export async function getLongbowListings(options: { fetchImpl?: typeof fetch; now?: number } = {}): Promise<LongbowListing[]> {
  const now = options.now ?? Date.now();
  if (memory && memory.until > now) return memory.listings;
  try {
    const cache = edgeCache();
    const cached = await cache?.match(EDGE_KEY);
    if (cached) {
      const listings = (await cached.json()) as LongbowListing[];
      memory = { listings, until: now + 60_000 };
      return listings;
    }
    const listings = await fetchLongbowMarkets({ fetchImpl: options.fetchImpl });
    if (listings === null) {
      memory = { listings: [], until: now + FAILURE_RETRY_SECONDS * 1000 };
      return [];
    }
    memory = { listings, until: now + LONGBOW_TTL_SECONDS * 1000 };
    await cache?.put(EDGE_KEY, Response.json(listings, { headers: { "Cache-Control": `public, max-age=${LONGBOW_TTL_SECONDS}` } }));
    return listings;
  } catch {
    return [];
  }
}

/** For tests: forget the in-memory copy. */
export function resetLongbowCache(): void {
  memory = null;
}
