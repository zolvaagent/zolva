import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { firstCloseAt } from "@/lib/listing";
import { listAgents, type AgentSummary } from "@/lib/data/agents";
import { getMarket, type AssetClass, type MarketToken, type MarketVenue } from "@/lib/data/market";
import { isMarketHours } from "@/lib/format";
import { marketStats, type MarketStats } from "@/lib/markets";

export type MarketRow = {
  address: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  stats: MarketStats;
  /** Active agents (anyone's) trading this token. */
  agents: number;
  pool: string;
  poolKind: "v3" | "v4" | "lighter";
  verifiedOfficial: boolean;
  /** uniswap: a token on the DEX; lighter: a perp (paper only, Lab agents). */
  venue: MarketVenue;
  /** Perps only: funding as a yearly rate, at the last hour and averaged over 7 days; positive when longs pay. */
  funding: { lastYearly: number | null; weekYearly: number | null } | null;
};

export type MarketOverview = {
  rows: MarketRow[];
  /** When the newest close was taken (end of the newest hour), unix seconds. */
  asOf: number;
  /** Whether the US regular session is open right now. */
  marketOpen: boolean;
};

type TokenInfo = { address: string; price_pool: string; pool_kind: MarketRow["poolKind"]; verified_official: boolean };

const HOURS_PER_YEAR = 24 * 365;

/** A perp's funding as yearly rates; null for DEX tokens. */
function fundingOf(token: MarketToken): MarketRow["funding"] {
  if (token.venue !== "lighter" || !token.funding) return null;
  const known = token.funding.filter((rate): rate is number => rate !== null);
  const week = known.slice(-168);
  return {
    lastYearly: known.length ? known[known.length - 1] * HOURS_PER_YEAR : null,
    weekYearly: week.length ? (week.reduce((sum, rate) => sum + rate, 0) / week.length) * HOURS_PER_YEAR : null,
  };
}

/** Perps are left out unless asked for: the public API stays on DEX tokens for now. */
type MarketOptions = { perps?: boolean };

async function tokenInfo(db: SupabaseClient): Promise<Map<string, TokenInfo>> {
  const { data, error } = await db.from("tokens").select("address, price_pool, pool_kind, verified_official").eq("enabled", true);
  if (error) throw new Error(`Loading tokens failed: ${error.message}`);
  return new Map((data as TokenInfo[]).map((token) => [token.address, token]));
}

function activeAgentsBySymbol(agents: AgentSummary[]): Map<string, AgentSummary[]> {
  const bySymbol = new Map<string, AgentSummary[]>();
  for (const agent of agents) {
    if (agent.status !== "active") continue;
    for (const token of agent.tokens) bySymbol.set(token.symbol, [...(bySymbol.get(token.symbol) ?? []), agent]);
  }
  return bySymbol;
}

/** Every enabled token (stocks, crypto and, when asked, perps) with its price stats, pool and agent count. */
export async function getMarketOverview(db: SupabaseClient, options: MarketOptions = {}): Promise<MarketOverview> {
  const [market, info, agents] = await Promise.all([getMarket(db, options), tokenInfo(db), listAgents(db)]);
  const bySymbol = activeAgentsBySymbol(agents);
  const rows: MarketRow[] = [];
  for (const token of market.tokens) {
    const stats = marketStats(token.closes);
    const pool = info.get(token.address);
    if (!stats || !pool) continue;
    rows.push({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      assetClass: token.assetClass,
      stats,
      agents: bySymbol.get(token.symbol)?.length ?? 0,
      pool: pool.price_pool,
      poolKind: pool.pool_kind,
      verifiedOfficial: pool.verified_official,
      venue: token.venue,
      funding: fundingOf(token),
    });
  }
  return { rows, asOf: market.startTs + market.hours * 3600, marketOpen: isMarketHours(Date.now() / 1000) };
}

export type MarketDetail = {
  row: MarketRow;
  /** Up to the last 30 days of hourly closes (plus one), oldest first. */
  closes: number[];
  /** Unix seconds of closes[0]. */
  startTs: number;
  asOf: number;
  marketOpen: boolean;
  agents: AgentSummary[];
};

const DETAIL_HOURS = 721;

/** An allowlisted token with no hourly close yet (a brand new listing). */
export type UnpricedListing = { address: string; symbol: string; name: string; verifiedOfficial: boolean; /** When the first hourly close is expected (ms). */ firstCloseAtMs: number };

/**
 * The listing behind /markets/<symbol> when it has no hourly close yet, or null (unknown, disabled, or it
 * has prices, in which case getMarketDetail is the one to use). Looked up by the allowlist's symbol.
 */
export async function getUnpricedListing(db: SupabaseClient, symbol: string): Promise<UnpricedListing | null> {
  if (!/^[A-Za-z0-9]{1,12}$/.test(symbol)) return null;
  const { data: token, error } = await db
    .from("tokens")
    .select("address, symbol, name, history_start, verified_official")
    .eq("symbol", symbol.toUpperCase())
    .eq("enabled", true)
    .neq("venue", "lighter")
    .maybeSingle();
  if (error || !token) return null;
  const { count } = await db.from("candles").select("ts", { count: "exact", head: true }).eq("token_address", token.address);
  if ((count ?? 0) > 0) return null;
  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    verifiedOfficial: token.verified_official === true,
    firstCloseAtMs: firstCloseAt(token.history_start ? Date.parse(token.history_start) : null, Date.now()),
  };
}

/** One stock's page data, or null for an unknown symbol. */
export async function getMarketDetail(db: SupabaseClient, symbol: string, options: MarketOptions = {}): Promise<MarketDetail | null> {
  const [market, info, agents] = await Promise.all([getMarket(db, options), tokenInfo(db), listAgents(db)]);
  const token = market.tokens.find((item) => item.symbol === symbol.toUpperCase());
  const pool = token && info.get(token.address);
  const stats = token && marketStats(token.closes);
  if (!token || !pool || !stats) return null;

  const trading = (activeAgentsBySymbol(agents).get(token.symbol) ?? []).sort((a, b) => b.returnPct - a.returnPct);
  // Drop the hours before the token's first price, so the chart starts at real data.
  const from = Math.max(token.closes.length - DETAIL_HOURS, token.firstIndex ?? 0);
  return {
    row: {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      assetClass: token.assetClass,
      stats,
      agents: trading.length,
      pool: pool.price_pool,
      poolKind: pool.pool_kind,
      verifiedOfficial: pool.verified_official,
      venue: token.venue,
      funding: fundingOf(token),
    },
    closes: token.closes.slice(from) as number[],
    startTs: market.startTs + from * 3600,
    asOf: market.startTs + market.hours * 3600,
    marketOpen: isMarketHours(Date.now() / 1000),
    agents: trading,
  };
}
