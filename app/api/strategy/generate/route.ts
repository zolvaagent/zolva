import { NextResponse, type NextRequest } from "next/server";

import { aiModel, callCostUsd } from "@/lib/ai/models";
import { chatJson } from "@/lib/ai/openrouter";
import {
  GENERATIONS_PER_DAY,
  PROMPT_MAX_LENGTH,
  PROMPT_MIN_LENGTH,
  STRATEGY_WRITER_MODEL,
  toRules,
  WRITER_MAX_INPUT_TOKENS,
  WRITER_MAX_TOKENS,
  WRITER_SCHEMA,
  WRITER_SYSTEM_PROMPT,
} from "@/lib/ai/strategy-writer";
import { BLOCKED_MESSAGE, countryFromHeaders, isBlockedCountry } from "@/lib/auth/geo";
import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getCredits } from "@/lib/data/credits";
import { db } from "@/lib/supabase";

const toMicro = (usd: number) => Math.round(usd * 1_000_000);

/**
 * Studio prompt mode: turns a plain words strategy into Custom rules.
 * Paid from the account's AI credits (Lite model, so free credits work),
 * limited per account per day and by the global daily AI budget.
 */
export async function POST(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (isBlockedCountry(countryFromHeaders(request.headers))) return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 451 });

  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < PROMPT_MIN_LENGTH || prompt.length > PROMPT_MAX_LENGTH) {
    return NextResponse.json({ error: `Describe your strategy in ${PROMPT_MIN_LENGTH} to ${PROMPT_MAX_LENGTH} characters.` }, { status: 400 });
  }

  const apiKey = env.openRouterKey;
  const model = aiModel(STRATEGY_WRITER_MODEL)!;
  if (!apiKey) return NextResponse.json({ error: "The AI strategy writer is not available right now." }, { status: 503 });

  const maxCost = toMicro(callCostUsd(model, WRITER_MAX_INPUT_TOKENS, WRITER_MAX_TOKENS));
  const client = db();
  const dayStart = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000).toISOString();
  const { data: spent } = await client.rpc("ai_spent_since", { p_from: dayStart });
  if (Number(spent ?? 0) + maxCost > toMicro(env.aiDailyBudgetUsd)) {
    return NextResponse.json({ error: "The AI is busy today. Please build your rules by hand or try again tomorrow." }, { status: 429 });
  }

  const credits = await getCredits(client, owner);
  if (toMicro(credits.freeUsd + credits.paidUsd) < maxCost) {
    return NextResponse.json({ error: "You are out of AI credits. Build your rules by hand instead." }, { status: 402 });
  }

  const { data: generationId, error: startError } = await client.rpc("ai_generation_start", { p_owner: owner, p_model: model.id, p_daily_limit: GENERATIONS_PER_DAY });
  if (startError) {
    console.error(startError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (generationId === null) {
    return NextResponse.json({ error: `You can generate ${GENERATIONS_PER_DAY} strategies a day. Edit the rules by hand or try again tomorrow.` }, { status: 429 });
  }

  let answer;
  try {
    answer = await chatJson({ apiKey, model: model.id, system: WRITER_SYSTEM_PROMPT, user: prompt, schema: WRITER_SCHEMA, maxTokens: WRITER_MAX_TOKENS });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await client.rpc("ai_generation_settle", { p_id: generationId, p_status: "failed", p_input: 0, p_output: 0, p_cost_micro: 0, p_lite: true, p_note: message.slice(0, 200) });
    return NextResponse.json({ error: "The AI did not answer. Please try again." }, { status: 502 });
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

  if (!result.ok) return NextResponse.json({ error: result.error, costUsd }, { status: 422 });
  return NextResponse.json({ rules: result.rules, notes: result.notes, summary: result.summary, costUsd });
}
