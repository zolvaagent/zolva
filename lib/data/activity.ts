import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isHouseOwner } from "@/lib/agents/house";
import { summarize, type ActivityHour, type ActivityPass, type ActivitySummary, type ActivityTrade } from "@/lib/activity";

/** Hours of history on the activity page. */
export const ACTIVITY_HOURS = 48;

export type Activity = {
  hours: ActivityHour[];
  trades: ActivityTrade[];
  /** Rule signals the AI co-pilot passed on. */
  passes: ActivityPass[];
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
    side: "buy" | "sell" | "short" | "cover";
    quantity: number;
    price: number;
    cost_usd: number;
    reason: ActivityTrade["reason"];
    reasoning: string | null;
    ai_verdict?: "approved" | "passed" | null;
    ai_model?: string | null;
  }[];
  /** Missing before migration 20261116000200_activity_ai_verdicts. */
  passes?: { ts: string; agent_id: string; agent_name: string; owner: string; symbol: string; ai_model: string; ai_reasoning: string }[];
};

/** Every paper agent's hourly checks and trades over the last two days. */
export async function getActivity(db: SupabaseClient): Promise<Activity> {
  const now = Math.floor(Date.now() / 1000);
  const { data, error } = await db.rpc("agent_activity", { p_from: new Date((now - ACTIVITY_HOURS * 3600) * 1000).toISOString() });
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
    ai: trade.ai_verdict && trade.ai_model ? { verdict: trade.ai_verdict, model: trade.ai_model } : null,
  }));
  const passes = (raw.passes ?? []).map((pass) => ({
    ts: Date.parse(pass.ts) / 1000,
    agentId: pass.agent_id,
    agentName: pass.agent_name,
    isHouse: isHouseOwner(pass.owner),
    symbol: pass.symbol,
    model: pass.ai_model,
    reasoning: pass.ai_reasoning,
  }));
  return { hours, trades, passes, lastDay: summarize(hours, trades, now - 24 * 3600), builtAt: now };
}
