import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { agentParams } from "@/lib/agents/plan";
import { ASK_MAX_INPUT_TOKENS, ASK_MAX_TOKENS, ASK_MODEL, ASK_SCHEMA, ASK_SYSTEM_PROMPT, askContext, askUserMessage, parseAnswer, parseHistory, parseQuestion } from "@/lib/ai/ask-agent";
import { aiModel, callCostUsd } from "@/lib/ai/models";
import { chatJson } from "@/lib/ai/openrouter";
import { getAgentDetail } from "@/lib/data/agents";
import { getCredits } from "@/lib/data/credits";
import { explainDecision } from "@/lib/engine/explain";
import { describeAgent } from "@/lib/engine/summary";
import { env } from "@/lib/env";
import { STRATEGY_NAMES } from "@/lib/format";
import { storedTier } from "@/lib/membership";
import { TIERS } from "@/lib/tiers";

const toMicro = (usd: number) => Math.round(usd * 1_000_000);
/** Hours of runs sent: the latest plus 7 days of trading decisions (holds are dropped in askContext). */
const RUN_HOURS = 7 * 24 + 1;

export type AskResult =
  | { ok: true; answer: string; followUps: string[]; costUsd: number; creditsUsd: number }
  | { ok: false; status: 400 | 402 | 404 | 429 | 500 | 502 | 503; error: string };

/**
 * "Ask your agent" (/api/agents/{id}/ask). Anyone logged in may ask about a published paper agent;
 * an owner may ask about any of their own agents. Paid from the asker's AI credits (Lite model, so
 * welcome credits work), limited per asker per day by the ZOLVA tier and by the global daily AI
 * budget. Every call is claimed and settled in the database (ai_generation_start / ai_generation_settle,
 * kind "ask"). Read only: nothing here changes an agent or touches the engine.
 */
export async function askAgent(client: SupabaseClient, asker: string, agentId: string, rawQuestion: unknown, rawHistory: unknown): Promise<AskResult> {
  const parsed = parseQuestion(rawQuestion);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  const detail = /^[0-9a-f-]{36}$/i.test(agentId) ? await getAgentDetail(client, agentId.toLowerCase()) : null;
  const isOwner = detail?.agent.owner === asker;
  const isPublic = detail?.agent.mode === "paper" && detail.agent.published_at !== null;
  // Same answer for unknown and private agents, so ids of private agents can't be probed.
  if (!detail || !(isOwner || isPublic)) return { ok: false, status: 404, error: "Agent not found." };

  const apiKey = env.openRouterKey;
  const model = aiModel(ASK_MODEL)!;
  if (!apiKey) return { ok: false, status: 503, error: "Asking agents is not available right now." };

  const maxCost = toMicro(callCostUsd(model, ASK_MAX_INPUT_TOKENS, ASK_MAX_TOKENS));
  const dayStart = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000).toISOString();
  const { data: spent } = await client.rpc("ai_spent_since", { p_from: dayStart });
  if (Number(spent ?? 0) + maxCost > toMicro(env.aiDailyBudgetUsd)) {
    return { ok: false, status: 429, error: "The AI is busy today. Please try again tomorrow." };
  }

  const credits = await getCredits(client, asker);
  if (toMicro(credits.freeUsd + credits.paidUsd) < maxCost) {
    return { ok: false, status: 402, error: "You are out of AI credits. Top up in Settings to keep asking." };
  }

  const { agent, summary } = detail;
  const params = agentParams(agent);
  const symbolOf = new Map(summary.tokens.map((token) => [token.address, token.symbol]));
  const symbol = (address: string) => symbolOf.get(address) ?? address;
  const context = askContext({
    name: agent.name,
    // The creator's own words reach a visitor only while the agent is published, as on its page.
    strategyPrompt: isOwner || agent.published_at ? agent.strategy_prompt : null,
    strategyName: STRATEGY_NAMES[agent.strategy] ?? agent.strategy,
    venue: summary.venue,
    mode: agent.mode,
    markets: summary.tokens.map((token) => token.symbol),
    howItTrades: describeAgent(params, { symbols: agent.token_addresses.map(symbol), mode: agent.mode, aiModel: agent.ai_model }),
    startCapitalUsd: summary.startCapital,
    valueUsd: summary.equity,
    returnPct: summary.returnPct,
    vsHoldingPts: summary.edge,
    maxDrawdownPct: summary.maxDrawdownPct,
    createdAt: summary.createdAt,
    positions: detail.positions.map((position) => ({ market: position.symbol, side: position.side, quantity: position.quantity, entryPrice: position.entryPrice, openedAt: position.openedAt })),
    trades: detail.trades.map((trade) => ({ ts: trade.ts, market: trade.symbol, side: trade.side, quantity: trade.quantity, price: trade.price, reason: trade.reason })),
    runs: [...detail.runs]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, RUN_HOURS)
      .map((run) => ({
        ts: run.ts,
        decisions: run.decisions.map((decision) => ({
          market: symbol(decision.token),
          action: decision.action,
          reasoning: decision.reasoning,
          price: decision.price ?? null,
          explanation: explainDecision(decision, params, symbol(decision.token))?.paragraphs ?? null,
          ai: decision.ai ? `${decision.ai.verdict}: ${decision.ai.reasoning}` : null,
        })),
      })),
    nowSeconds: Date.now() / 1000,
  });

  const dailyLimit = TIERS[await storedTier(client, asker)].askPerDay;
  const { data: generationId, error: startError } = await client.rpc("ai_generation_start", { p_owner: asker, p_model: model.id, p_daily_limit: dailyLimit, p_kind: "ask" });
  if (startError) {
    console.error(startError);
    return { ok: false, status: 500, error: "Something went wrong. Please try again." };
  }
  if (generationId === null) return { ok: false, status: 429, error: `You can ask ${dailyLimit} questions a day. Try again tomorrow.` };

  let reply;
  try {
    reply = await chatJson({ apiKey, model: model.id, system: ASK_SYSTEM_PROMPT, user: askUserMessage(context, parseHistory(rawHistory), parsed.question), schema: ASK_SCHEMA, maxTokens: ASK_MAX_TOKENS });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await client.rpc("ai_generation_settle", { p_id: generationId, p_status: "failed", p_input: 0, p_output: 0, p_cost_micro: 0, p_lite: true, p_note: message.slice(0, 200) });
    return { ok: false, status: 502, error: "The AI did not answer. Please try again." };
  }

  const parsedAnswer = parseAnswer(reply.content);
  const costUsd = reply.costUsd ?? callCostUsd(model, reply.inputTokens, reply.outputTokens);
  await client.rpc("ai_generation_settle", {
    p_id: generationId,
    p_status: parsedAnswer ? "done" : "failed",
    p_input: reply.inputTokens,
    p_output: reply.outputTokens,
    p_cost_micro: toMicro(costUsd),
    p_lite: true,
    p_note: parsedAnswer ? null : "unusable answer",
  });
  if (!parsedAnswer) return { ok: false, status: 502, error: "The AI answer was not usable. Please try again." };
  // What is left after this question, so the panel can show it.
  const after = await getCredits(client, asker);
  return { ok: true, answer: parsedAnswer.answer, followUps: parsedAnswer.followUps, costUsd, creditsUsd: after.freeUsd + after.paidUsd };
}

/** The asker's AI credits left (welcome plus paid), USD: shown in the Ask panel before a first question. */
export async function askCredits(client: SupabaseClient, asker: string): Promise<number> {
  const credits = await getCredits(client, asker);
  return credits.freeUsd + credits.paidUsd;
}
