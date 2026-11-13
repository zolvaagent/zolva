import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { aiModel, callCostUsd } from "@/lib/ai/models";
import { chatJson } from "@/lib/ai/openrouter";
import {
  PROMPT_MAX_LENGTH,
  PROMPT_MIN_LENGTH,
  STRATEGY_WRITER_MODEL,
  toRules,
  WRITER_MAX_INPUT_TOKENS,
  WRITER_MAX_TOKENS,
  WRITER_SCHEMA,
  WRITER_SYSTEM_PROMPT,
} from "@/lib/ai/strategy-writer";
import { getCredits } from "@/lib/data/credits";
import { env } from "@/lib/env";
import { storedTier } from "@/lib/membership";
import type { Rules } from "@/lib/engine/rules";
import { TIERS } from "@/lib/tiers";

const toMicro = (usd: number) => Math.round(usd * 1_000_000);

export type WriteStrategyResult =
  | { ok: true; rules: Rules; notes: string; summary: string; costUsd: number }
  | { ok: false; status: 400 | 402 | 422 | 429 | 500 | 502 | 503; error: string; costUsd?: number };

/**
 * Turns plain words into Custom rules: the Studio's prompt mode (/api/strategy/generate)
 * and the API's write_strategy tool both call this. Paid from the account's AI credits
 * (Lite model, so free credits work), limited per account per day by the ZOLVA tier and
 * by the global daily AI budget. Every call is claimed and settled in the database
 * (ai_generation_start / ai_generation_settle). The rules always pass parseRules.
 */
export async function writeStrategy(client: SupabaseClient, owner: string, rawPrompt: unknown): Promise<WriteStrategyResult> {
  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim() : "";
  if (prompt.length < PROMPT_MIN_LENGTH || prompt.length > PROMPT_MAX_LENGTH) {
    return { ok: false, status: 400, error: `Describe your strategy in ${PROMPT_MIN_LENGTH} to ${PROMPT_MAX_LENGTH} characters.` };
  }

  const apiKey = env.openRouterKey;
  const model = aiModel(STRATEGY_WRITER_MODEL)!;
  if (!apiKey) return { ok: false, status: 503, error: "The AI strategy writer is not available right now." };

  const maxCost = toMicro(callCostUsd(model, WRITER_MAX_INPUT_TOKENS, WRITER_MAX_TOKENS));
  const dayStart = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000).toISOString();
  const { data: spent } = await client.rpc("ai_spent_since", { p_from: dayStart });
  if (Number(spent ?? 0) + maxCost > toMicro(env.aiDailyBudgetUsd)) {
    return { ok: false, status: 429, error: "The AI is busy today. Please build your rules by hand or try again tomorrow." };
  }

  const credits = await getCredits(client, owner);
  if (toMicro(credits.freeUsd + credits.paidUsd) < maxCost) {
    return { ok: false, status: 402, error: "You are out of AI credits. Build your rules by hand instead." };
  }

  // Tries per day follow the account's ZOLVA tier (10 on Free).
  const dailyLimit = TIERS[await storedTier(client, owner)].writerPerDay;
  const { data: generationId, error: startError } = await client.rpc("ai_generation_start", { p_owner: owner, p_model: model.id, p_daily_limit: dailyLimit });
  if (startError) {
    console.error(startError);
    return { ok: false, status: 500, error: "Something went wrong. Please try again." };
  }
  if (generationId === null) {
    return { ok: false, status: 429, error: `You can generate ${dailyLimit} strategies a day. Edit the rules by hand or try again tomorrow.` };
  }

  let answer;
  try {
    answer = await chatJson({ apiKey, model: model.id, system: WRITER_SYSTEM_PROMPT, user: prompt, schema: WRITER_SCHEMA, maxTokens: WRITER_MAX_TOKENS });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await client.rpc("ai_generation_settle", { p_id: generationId, p_status: "failed", p_input: 0, p_output: 0, p_cost_micro: 0, p_lite: true, p_note: message.slice(0, 200) });
    return { ok: false, status: 502, error: "The AI did not answer. Please try again." };
  }

  const result = toRules(answer.content);
  const costUsd = answer.costUsd ?? callCostUsd(model, answer.inputTokens, answer.outputTokens);
  await client.rpc("ai_generation_settle", {
    p_id: generationId,
    p_status: result.ok ? "done" : "failed",
    p_input: answer.inputTokens,
    p_output: answer.outputTokens,
    p_cost_micro: toMicro(costUsd),
    p_lite: true,
    p_note: result.ok ? null : result.error.slice(0, 200),
  });

  if (!result.ok) return { ok: false, status: 422, error: result.error, costUsd };
  return { ok: true, rules: result.rules, notes: result.notes, summary: result.summary, costUsd };
}
