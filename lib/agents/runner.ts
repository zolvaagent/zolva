import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { withCopilot, type CopilotAgent } from "@/lib/agents/copilot-runner";
import { planAgentHours, type PositionRow } from "@/lib/agents/plan";
import { getMarket, RUNNER_MARKET_HOURS } from "@/lib/data/market";

export type RunnerResult = {
  agents: number;
  hoursWritten: number;
  /** Hours another tick had already written (harmless). */
  hoursSkipped: number;
  failed: { agentId: string; error: string }[];
  /** AI co-pilot skips and failures (the rules decided those hours). */
  copilot: { agentId: string; note: string }[];
};

/**
 * Runs every active paper agent on the hours since it last ran, up to the
 * newest stored price. Each hour is written atomically and at most once, so
 * running this twice (or two ticks at once) cannot double-trade.
 */
export async function runActiveAgents(db: SupabaseClient): Promise<RunnerResult> {
  // Perps included: Lab agents trade them on paper. The longer window covers the longest rule.
  const market = await getMarket(db, { perps: true, hours: RUNNER_MARKET_HOURS });
  const result: RunnerResult = { agents: 0, hoursWritten: 0, hoursSkipped: 0, failed: [], copilot: [] };
  if (!market.hours) return result;
  const latestTs = market.startTs + (market.hours - 1) * 3600;
  const closes = Object.fromEntries(market.tokens.map((token) => [token.address, token.closes]));
  const funding = Object.fromEntries(market.tokens.filter((token) => token.funding).map((token) => [token.address, token.funding!]));
  const symbols = Object.fromEntries(market.tokens.map((token) => [token.address, token.symbol]));

  const { data: agents, error } = await db
    .from("agents")
    .select("id, owner, name, ai_model, strategy_prompt, strategy, params, token_addresses, start_capital, cash, last_run_ts")
    .eq("status", "active")
    .eq("mode", "paper");
  if (error) throw new Error(`Loading agents failed: ${error.message}`);
  result.agents = agents.length;
  if (!agents.length) return result;

  const { data: positions, error: positionsError } = await db
    .from("positions")
    .select("agent_id, token_address, quantity, avg_entry_price, opened_at, side, margin, stop_price")
    .in(
      "agent_id",
      agents.map((agent) => agent.id),
    );
  if (positionsError) throw new Error(`Loading positions failed: ${positionsError.message}`);

  for (const agent of agents as CopilotAgent[]) {
    try {
      const own = (positions as (PositionRow & { agent_id: string })[]).filter((position) => position.agent_id === agent.id);
      const series = { startTs: market.startTs, closes, funding };
      const planned = planAgentHours(agent, own, series, latestTs);
      const { writes, note } = await withCopilot(db, agent, own, { ...series, symbols }, latestTs, planned);
      if (note) result.copilot.push({ agentId: agent.id, note });
      for (const hour of writes) {
        const { data: written, error: writeError } = await db.rpc("apply_agent_hour", {
          p_agent_id: agent.id,
          p_ts: hour.ts,
          p_cash: hour.cash,
          p_equity: hour.equity,
          p_hold_equity: hour.holdEquity,
          p_decisions: hour.decisions,
          p_positions: hour.positions,
          p_trades: hour.trades,
        });
        if (writeError) throw new Error(writeError.message);
        if (!written) {
          // Another tick got here first; its state is the truth from now on.
          result.hoursSkipped += 1;
          break;
        }
        result.hoursWritten += 1;
      }
    } catch (cause) {
      result.failed.push({ agentId: agent.id, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  return result;
}
