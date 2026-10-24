import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listAgents, type AgentSummary } from "@/lib/data/agents";
import { getMarket, type AssetClass } from "@/lib/data/market";
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
  poolKind: "v3" | "v4";
  verifiedOfficial: boolean;
};

export type MarketOverview = {
  rows: MarketRow[];
  /** When the newest close was taken (end of the newest hour), unix seconds. */
  asOf: number;
  /** Whether the US regular session is open right now. */
  marketOpen: boolean;
};

type TokenInfo = { address: string; price_pool: string; pool_kind: "v3" | "v4"; verified_official: boolean };

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

/** Every enabled token (stocks and crypto) with its price stats, pool and agent count. */
export async function getMarketOverview(db: SupabaseClient): Promise<MarketOverview> {
  const [market, info, agents] = await Promise.all([getMarket(db), tokenInfo(db), listAgents(db)]);
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

/** One stock's page data, or null for an unknown symbol. */
export async function getMarketDetail(db: SupabaseClient, symbol: string): Promise<MarketDetail | null> {
  const [market, info, agents] = await Promise.all([getMarket(db), tokenInfo(db), listAgents(db)]);
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
    },
    closes: token.closes.slice(from) as number[],
    startTs: market.startTs + from * 3600,
    asOf: market.startTs + market.hours * 3600,
    marketOpen: isMarketHours(Date.now() / 1000),
    agents: trading,
  };
}
