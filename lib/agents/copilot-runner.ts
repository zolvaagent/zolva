import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { planAgentHours, type AgentRow, type HourWrite, type MarketSeries, type PositionRow } from "@/lib/agents/plan";
import { buildPrompt, parseReviews, REVIEW_SCHEMA, SYSTEM_PROMPT, type ProposedTrade } from "@/lib/ai/copilot";
import { aiModel, callCostUsd, isLite, maxCallCostUsd } from "@/lib/ai/models";
import { chatJson } from "@/lib/ai/openrouter";
import { env } from "@/lib/env";
import { isMarketHours } from "@/lib/format";

const HOUR = 3600;
const toMicro = (usd: number) => Math.round(usd * 1_000_000);

export type CopilotAgent = AgentRow & { owner: string; name: string; ai_model: string | null };

export type CopilotNote = { agentId: string; note: string };

/**
 * Lets the agent's AI co-pilot review the newest planned hour, if its rules
 * want to trade then. Returns the hours to write: the same plan when the
 * co-pilot is off, out of credits or fails (the rules decide), or the plan
 * re-run with the co-pilot's vetoes and its reviews attached to the decisions.
 *
 * Only the newest hour is reviewed; catch-up hours after a missed tick run on
 * the rules alone, so an outage never turns into a burst of paid calls.
 */
export async function withCopilot(
  db: SupabaseClient,
  agent: CopilotAgent,
  positions: PositionRow[],
  market: MarketSeries & { symbols: Record<string, string> },
  latestTs: number,
  writes: HourWrite[],
): Promise<{ writes: HourWrite[]; note: string | null }> {
  const model = aiModel(agent.ai_model);
  const apiKey = env.openRouterKey;
  const last = writes.at(-1);
  if (!model || !apiKey || !last || Date.parse(last.ts) / 1000 !== latestTs) return { writes, note: null };

  // Only rule signals are reviewed; forced exits (stop loss and friends) always run.
  const signalTrades = last.trades.filter((trade) => trade.reason === "signal");
  if (!signalTrades.length) return { writes, note: null };

  const dayStart = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000).toISOString();
  const { data: spent, error: spentError } = await db.rpc("ai_spent_since", { p_from: dayStart });
  if (spentError) return { writes, note: `co-pilot skipped: ${spentError.message}` };
  if (Number(spent) + toMicro(maxCallCostUsd(model)) > toMicro(env.aiDailyBudgetUsd)) return { writes, note: "co-pilot skipped: daily AI budget reached" };

  const { data: credits } = await db.from("ai_credits").select("free_micro, paid_micro").eq("owner", agent.owner).maybeSingle();
  const free = Number(credits?.free_micro ?? 0);
  const paid = Number(credits?.paid_micro ?? 0);
  const usable = isLite(model.id) ? free + paid : paid;
  if (usable < toMicro(maxCallCostUsd(model))) return { writes, note: "co-pilot skipped: not enough AI credits" };

  const { data: claimed, error: claimError } = await db.rpc("ai_claim", { p_agent_id: agent.id, p_owner: agent.owner, p_ts: last.ts, p_model: model.id });
  // Another tick is reviewing (or reviewed) this hour: let the rules write it, the first write wins.
  if (claimError || !claimed) return { writes, note: "co-pilot skipped: hour already claimed" };

  // State before the newest hour: the previous planned hour, or what is stored.
  const before = writes.length > 1 ? writes[writes.length - 2] : null;
  const cashBefore = before ? before.cash : Number(agent.cash);
  const positionsBefore = before ? before.positions : positions;
  const index = (latestTs - market.startTs) / HOUR;

  const trades: ProposedTrade[] = signalTrades.map((trade) => {
    const decision = last.decisions.find((item) => item.token === trade.token_address);
    const held = positionsBefore.find((position) => position.token_address === trade.token_address);
    const closes = (market.closes[trade.token_address] ?? []).slice(0, index + 1);
    return {
      token: trade.token_address,
      symbol: market.symbols[trade.token_address] ?? trade.token_address,
      side: trade.side,
      price: trade.price,
      ruleReasoning: decision?.reasoning ?? "",
      indicators: decision?.indicators,
      closes,
      position:
        trade.side === "sell" && held
          ? { entryPrice: Number(held.avg_entry_price), heldHours: held.opened_at ? (latestTs - Date.parse(held.opened_at) / 1000) / HOUR : null }
          : undefined,
    };
  });

  const prompt = buildPrompt({
    agentName: agent.name,
    strategy: agent.strategy,
    rules: agent.params.rules,
    maxPositionPct: Number(agent.params.max_position_pct),
    stopLossPct: Number(agent.params.stop_loss_pct),
    cash: cashBefore,
    equity: before ? before.equity : Number(agent.cash),
    openPositions: positionsBefore.length,
    marketOpen: isMarketHours(latestTs + HOUR / 2),
    trades,
  });

  let answer;
  try {
    answer = await chatJson({ apiKey, model: model.id, system: SYSTEM_PROMPT, user: prompt, schema: REVIEW_SCHEMA });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await db.rpc("ai_settle", { p_agent_id: agent.id, p_ts: last.ts, p_status: "failed", p_input: 0, p_output: 0, p_cost_micro: 0, p_lite: isLite(model.id), p_note: message.slice(0, 200) });
    return { writes, note: `co-pilot failed, rules decided: ${message}` };
  }

  const costUsd = answer.costUsd ?? callCostUsd(model, answer.inputTokens, answer.outputTokens);
  const { reviews, valid } = parseReviews(answer.content, trades);
  await db.rpc("ai_settle", {
    p_agent_id: agent.id,
    p_ts: last.ts,
    p_status: valid ? "done" : "failed",
    p_input: answer.inputTokens,
    p_output: answer.outputTokens,
    p_cost_micro: toMicro(costUsd),
    p_lite: isLite(model.id),
    p_note: valid ? null : "unreadable answer, rules decided",
  });
  if (!valid) return { writes, note: "co-pilot answer unreadable, rules decided" };

  const veto = new Map(reviews.filter((review) => !review.approve).map((review) => [review.token, review.reasoning]));
  const reviewed = veto.size ? planAgentHours(agent, positions, market, latestTs, { ts: latestTs, veto }) : writes;
  const newest = reviewed.at(-1)!;
  for (const review of reviews) {
    const decision = newest.decisions.find((item) => item.token === review.token);
    if (decision) decision.ai = { model: model.id, verdict: review.approve ? "approved" : "passed", reasoning: review.reasoning };
  }
  return { writes: reviewed, note: null };
}
