import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isLabOwner } from "@/lib/agents/house";
import { positionPnl } from "@/lib/agents/open-positions";
import { listAgents } from "@/lib/data/agents";
import { getMarket } from "@/lib/data/market";
import { isPerpSymbol } from "@/lib/format";

/** One open position of a public paper agent, valued at the latest hourly close. */
export type OpenPosition = {
  agentId: string;
  agentName: string;
  owner: string;
  isHouse: boolean;
  isLab: boolean;
  /** Paused agents keep their positions open (the stop loss does not run). */
  paused: boolean;
  venue: "spot" | "perps";
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  /** Latest hourly close; the entry price when the market has no close yet. */
  price: number;
  /** Unix seconds, or null for positions opened before the time was stored. */
  openedAt: number | null;
  valueUsd: number;
  pnlUsd: number;
  pnlPct: number;
};

export type OpenPositions = {
  positions: OpenPosition[];
  /** Public paper agents, to say how many hold something. */
  agents: number;
  /** Hour of the closes used (unix seconds), or null without prices. */
  pricedAt: number | null;
};

type PositionRow = { agent_id: string; token_address: string; quantity: number; avg_entry_price: number; side: string; margin: number | null; opened_at: string | null };

/**
 * Every open position of every public paper agent (active and paused), with its unrealised P&L at the
 * latest hourly close: the same closes and basis as the agent pages. Trench agents are separate.
 */
export async function loadOpenPositions(db: SupabaseClient): Promise<OpenPositions> {
  const [agents, market] = await Promise.all([listAgents(db), getMarket(db, { perps: true })]);
  if (!agents.length) return { positions: [], agents: 0, pricedAt: null };
  const { data, error } = await db
    .from("positions")
    .select("agent_id, token_address, quantity, avg_entry_price, side, margin, opened_at")
    .in(
      "agent_id",
      agents.map((agent) => agent.id),
    );
  if (error) throw new Error(`Loading open positions failed: ${error.message}`);

  const last = market.hours - 1;
  const tokens = new Map(market.tokens.map((token) => [token.address, { symbol: token.symbol, close: last >= 0 ? token.closes[last] : null }]));
  const agentOf = new Map(agents.map((agent) => [agent.id, agent]));

  const positions = (data as PositionRow[]).flatMap((row): OpenPosition[] => {
    const agent = agentOf.get(row.agent_id);
    if (!agent) return [];
    const token = tokens.get(row.token_address);
    const side = row.side === "short" ? "short" : "long";
    const held = { quantity: Number(row.quantity), entryPrice: Number(row.avg_entry_price), side, margin: row.margin === null ? null : Number(row.margin) } as const;
    const price = token?.close ?? held.entryPrice;
    const symbol = token?.symbol ?? "?";
    return [
      {
        agentId: agent.id,
        agentName: agent.name,
        owner: agent.owner,
        isHouse: agent.isHouse,
        isLab: isLabOwner(agent.owner),
        paused: agent.status === "paused",
        venue: isPerpSymbol(symbol) ? "perps" : "spot",
        symbol,
        side,
        quantity: held.quantity,
        entryPrice: held.entryPrice,
        price,
        openedAt: row.opened_at ? Date.parse(row.opened_at) / 1000 : null,
        ...positionPnl(held, price),
      },
    ];
  });

  return {
    positions: positions.sort((a, b) => b.pnlPct - a.pnlPct),
    agents: agents.length,
    pricedAt: market.hours ? market.startTs + last * 3600 : null,
  };
}
