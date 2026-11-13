import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { activityBody, agentBody, agentsBody, marketBody, marketsBody, TTL } from "./data";
import { DECISION_HOURS, DISCLAIMER } from "./format";
import { cachedBody } from "./http";
import { AGENT_SORTS, filterAgents, filterByAssetClass, filterTrades } from "./tools";

/**
 * Zolva's MCP server (docs: /docs/mcp): the public API as five read-only tools, so AI
 * assistants can read published agents, their decisions, markets and trades. Same data,
 * same cache and same rules as /api/public/v1: paper agents only, no wallets, no login.
 */

const INSTRUCTIONS = [
  "Zolva runs trading agents for tokenized US stocks and crypto (ETH, BTC) on Robinhood Chain, plus research agents on Lighter perps (BTC-PERP and others). Every agent here trades virtual money (paper trading).",
  "Spot agents buy and sell tokens (long only). Perps agents (venue perps) can be long or short, with no leverage, and pay or earn hourly funding.",
  "Each agent decides once an hour and explains every buy, sell, short, cover or hold in plain words; get_agent returns the last 24 hours of those reasons.",
  "Compare an agent's return with holding the same markets (vsHoldingPts) before calling it good. Results are hypothetical and not investment advice.",
].join(" ");

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const json = (body: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(body) }] });
const notFound = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "zolva", title: "Zolva", version: "1.0.0", websiteUrl: "https://zolvaagent.app" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "list_agents",
    {
      title: "List agents",
      description: "Published Zolva agents with their return, return vs simply holding the same markets, worst drop and trade count. Paper trading only.",
      inputSchema: {
        strategy: z.enum(["momentum", "mean_reversion", "dip_hunter", "spike_fade", "dip_fade", "custom"]).optional().describe("Only agents using this strategy"),
        market: z.string().max(17).optional().describe("Only agents watching this market symbol, such as NVDA, ETH or BTC-PERP"),
        venue: z.enum(["spot", "perps"]).optional().describe("Only spot agents (tokens, long only) or only perps agents (Lighter, long or short)"),
        sortBy: z.enum(AGENT_SORTS).optional().describe("return (default, highest first), vs_holding (most ahead of holding first) or drawdown (smallest worst drop first)"),
        limit: z.number().int().min(1).max(50).optional().describe("How many agents to return, default 20"),
      },
      annotations: READ_ONLY,
    },
    async (input) => {
      const body = await cachedBody("agents", TTL.agents, agentsBody);
      const agents = filterAgents(body?.agents ?? [], input);
      return json({ agents, matching: agents.length, total: body?.count ?? 0, disclaimer: DISCLAIMER });
    },
  );

  server.registerTool(
    "get_agent",
    {
      title: "Get agent",
      description: `One published agent: settings, hourly value vs holding for 7 days, open positions, latest trades, and every decision of the last ${DECISION_HOURS} hours with its reason.`,
      inputSchema: { id: z.string().uuid().describe("The agent id from list_agents") },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const body = await cachedBody(`agents/${id.toLowerCase()}`, TTL.agents, () => agentBody(id));
      return body ? json(body) : notFound("No published agent has this id. Private agents and real money agents are not available.");
    },
  );

  server.registerTool(
    "list_markets",
    {
      title: "List markets",
      description: "Every market Zolva prices on Robinhood Chain: latest hourly price, 1 hour to 30 day changes, a 7 day sparkline and how many agents trade it. Perps (venue perps, symbols like BTC-PERP) also carry their funding rate. Spot tokens that Longbow (Morpho Blue lending) accepts as collateral for USDG carry longbow: { lltvPct, url }, otherwise null.",
      inputSchema: {
        assetClass: z.enum(["stock", "crypto"]).optional().describe("Only stocks or only crypto"),
        venue: z.enum(["spot", "perps"]).optional().describe("Only spot tokens or only Lighter perps"),
      },
      annotations: READ_ONLY,
    },
    async ({ assetClass, venue }) => {
      const body = await cachedBody("markets", TTL.markets, marketsBody);
      return json({ ...body, markets: filterByAssetClass(body?.markets ?? [], assetClass, venue) });
    },
  );

  server.registerTool(
    "get_market",
    {
      title: "Get market",
      description: "One market: up to 30 days of hourly closes, the published agents trading it, and its Longbow lending market if any (longbow: { lltvPct, url } or null).",
      inputSchema: { symbol: z.string().min(1).max(17).describe("Market symbol, such as NVDA, SPY, ETH or BTC-PERP") },
      annotations: READ_ONLY,
    },
    async ({ symbol }) => {
      const body = await cachedBody(`markets/${symbol.toUpperCase()}`, TTL.markets, () => marketBody(symbol));
      return body ? json(body) : notFound(`Zolva has no market called ${symbol}. Use list_markets for the symbols.`);
    },
  );

  server.registerTool(
    "recent_activity",
    {
      title: "Recent trades",
      description: "Trades by published agents over the last 48 hours, newest first, each with the agent's own reason.",
      inputSchema: {
        market: z.string().max(17).optional().describe("Only trades in this market, such as NVDA or BTC-PERP"),
        agentId: z.string().uuid().optional().describe("Only trades by this agent"),
        limit: z.number().int().min(1).max(200).optional().describe("How many trades to return, default 50"),
      },
      annotations: READ_ONLY,
    },
    async (input) => {
      const body = await cachedBody("activity", TTL.activity, activityBody);
      const trades = filterTrades(body?.trades ?? [], input);
      return json({ trades, hours: body?.hours ?? 48, disclaimer: DISCLAIMER });
    },
  );

  return server;
}
