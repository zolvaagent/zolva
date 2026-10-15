import "server-only";

import { isHouseOwner } from "@/lib/agents/house";
import { summarize, type ActivityHour, type ActivitySummary, type ActivityTrade } from "@/lib/activity";
import { db } from "@/lib/supabase";

/** Hours of history on the activity page. */
export const ACTIVITY_HOURS = 48;

export type Activity = {
  hours: ActivityHour[];
  trades: ActivityTrade[];
  /** Totals for the last 24 hours. */
  lastDay: ActivitySummary;
  /** Unix seconds when the report was built. */
  builtAt: number;
};

type RawActivity = {
  hours: { ts: string; checked: number; buys: number; sells: number }[];
  trades: {
    ts: string;
    agent_id: string;
    agent_name: string;
    owner: string;
    strategy: string;
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
    price: number;
    cost_usd: number;
    reason: ActivityTrade["reason"];
    reasoning: string | null;
  }[];
};

/** Every paper agent's hourly checks and trades over the last two days. */
export async function getActivity(): Promise<Activity> {
  const now = Math.floor(Date.now() / 1000);
  const { data, error } = await db().rpc("agent_activity", { p_from: new Date((now - ACTIVITY_HOURS * 3600) * 1000).toISOString() });
  if (error) throw new Error(`Loading activity failed: ${error.message}`);
  const raw = data as RawActivity;

  const hours = raw.hours.map((hour) => ({ ts: Date.parse(hour.ts) / 1000, checked: Number(hour.checked), buys: Number(hour.buys), sells: Number(hour.sells) }));
  const trades = raw.trades.map((trade) => ({
    ts: Date.parse(trade.ts) / 1000,
    agentId: trade.agent_id,
    agentName: trade.agent_name,
    isHouse: isHouseOwner(trade.owner),
    strategy: trade.strategy,
    symbol: trade.symbol,
    side: trade.side,
    quantity: Number(trade.quantity),
    price: Number(trade.price),
    costUsd: Number(trade.cost_usd),
    reason: trade.reason,
    reasoning: trade.reasoning,
  }));
  return { hours, trades, lastDay: summarize(hours, trades, now - 24 * 3600), builtAt: now };
}
