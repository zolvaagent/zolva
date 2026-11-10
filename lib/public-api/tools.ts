/**
 * Filters for the MCP tools (lib/public-api/mcp.ts), applied to the cached public API
 * bodies. Pure, so the same body serves every filter and the logic is tested.
 */
import type { PublicAgent } from "./format";

export const AGENT_SORTS = ["return", "vs_holding", "drawdown"] as const;
export type AgentSort = (typeof AGENT_SORTS)[number];

export function filterAgents(
  agents: PublicAgent[],
  options: { strategy?: string; market?: string; venue?: "spot" | "perps"; sortBy?: AgentSort; limit?: number },
): PublicAgent[] {
  const market = options.market?.toUpperCase();
  const sortBy = options.sortBy ?? "return";
  return agents
    .filter((agent) => !options.strategy || agent.strategy === options.strategy)
    .filter((agent) => !market || agent.markets.includes(market))
    .filter((agent) => !options.venue || agent.venue === options.venue)
    .sort((a, b) =>
      sortBy === "vs_holding" ? b.vsHoldingPts - a.vsHoldingPts : sortBy === "drawdown" ? a.maxDrawdownPct - b.maxDrawdownPct : b.returnPct - a.returnPct,
    )
    .slice(0, options.limit ?? 20);
}

export function filterByAssetClass<T extends { assetClass: string; venue?: string }>(markets: T[], assetClass?: string, venue?: string): T[] {
  return markets.filter((market) => (!assetClass || market.assetClass === assetClass) && (!venue || market.venue === venue));
}

export function filterTrades<T extends { market: string; agentId: string }>(trades: T[], options: { market?: string; agentId?: string; limit?: number }): T[] {
  const market = options.market?.toUpperCase();
  return trades
    .filter((trade) => !market || trade.market === market)
    .filter((trade) => !options.agentId || trade.agentId === options.agentId.toLowerCase())
    .slice(0, options.limit ?? 50);
}
