/**
 * Filters for the MCP tools (lib/public-api/mcp.ts), applied to the cached public API
 * bodies. Pure, so the same body serves every filter and the logic is tested.
 */
import { z } from "zod";

import { DECISION_HOURS, type PublicAgent } from "./format";

export const AGENT_SORTS = ["return", "vs_holding", "drawdown"] as const;

/**
 * The five keyless MCP tools: name, title, description and inputs. lib/public-api/mcp.ts
 * registers them with their handlers, and /docs/mcp renders its tool table from here.
 */
export const READ_TOOLS = {
  list_agents: {
    title: "List agents",
    description: "Published Zolva agents with their return, return vs simply holding the same markets, worst drop and trade count. Paper trading only.",
    inputSchema: {
      strategy: z.enum(["momentum", "mean_reversion", "dip_hunter", "spike_fade", "dip_fade", "bounce_short", "custom"]).optional().describe("Only agents using this strategy"),
      market: z.string().max(17).optional().describe("Only agents watching this market symbol, such as NVDA, ETH or BTC-PERP"),
      venue: z.enum(["spot", "perps"]).optional().describe("Only spot agents (tokens, long only) or only perps agents (Lighter, long or short)"),
      sortBy: z.enum(AGENT_SORTS).optional().describe("return (default, highest first), vs_holding (most ahead of holding first) or drawdown (smallest worst drop first)"),
      limit: z.number().int().min(1).max(50).optional().describe("How many agents to return, default 20"),
    },
  },
  get_agent: {
    title: "Get agent",
    description: `One published agent: settings, hourly value vs holding for 7 days, open positions, latest trades, and every decision of the last ${DECISION_HOURS} hours with its reason.`,
    inputSchema: { id: z.string().uuid().describe("The agent id from list_agents") },
  },
  list_markets: {
    title: "List markets",
    description: "Every market Zolva prices on Robinhood Chain: latest hourly price, 1 hour to 30 day changes, a 7 day sparkline and how many agents trade it. Perps (venue perps, symbols like BTC-PERP) also carry their funding rate. Spot tokens that Longbow (Morpho Blue lending) accepts as collateral for USDG carry longbow: { lltvPct, url }, otherwise null.",
    inputSchema: {
      assetClass: z.enum(["stock", "crypto"]).optional().describe("Only stocks or only crypto"),
      venue: z.enum(["spot", "perps"]).optional().describe("Only spot tokens or only Lighter perps"),
    },
  },
  get_market: {
    title: "Get market",
    description: "One market: up to 30 days of hourly closes, the published agents trading it, and its Longbow lending market if any (longbow: { lltvPct, url } or null).",
    inputSchema: { symbol: z.string().min(1).max(17).describe("Market symbol, such as NVDA, SPY, ETH or BTC-PERP") },
  },
  recent_activity: {
    title: "Recent trades",
    description: "Trades by published agents over the last 48 hours, newest first, each with the agent's own reason.",
    inputSchema: {
      market: z.string().max(17).optional().describe("Only trades in this market, such as NVDA or BTC-PERP"),
      agentId: z.string().uuid().optional().describe("Only trades by this agent"),
      limit: z.number().int().min(1).max(200).optional().describe("How many trades to return, default 50"),
    },
  },
};

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
