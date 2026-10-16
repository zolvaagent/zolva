/**
 * The AI models an agent's co-pilot can use (OpenRouter ids), grouped in
 * tiers. Prices are USD per million tokens, read from the OpenRouter API on
 * 2026-10-16; the real charge for each call comes from OpenRouter's own usage
 * report, these numbers are only for estimates shown before launch.
 *
 * Free welcome credits only pay for Lite models (docs/ai-and-token-plan.md).
 */

export type AiTier = "lite" | "standard" | "pro" | "max";

export type AiModel = {
  id: string;
  label: string;
  tier: AiTier;
  inputPerMillion: number;
  outputPerMillion: number;
};

export const AI_MODELS: AiModel[] = [
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", tier: "lite", inputPerMillion: 0.1, outputPerMillion: 0.5 },
  { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", tier: "lite", inputPerMillion: 0.018, outputPerMillion: 0.684 },
  { id: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna", tier: "lite", inputPerMillion: 0.2, outputPerMillion: 1.2 },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash", tier: "standard", inputPerMillion: 0.825, outputPerMillion: 4.125 },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 mini", tier: "standard", inputPerMillion: 0.75, outputPerMillion: 4.5 },
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5", tier: "pro", inputPerMillion: 2, outputPerMillion: 10 },
  { id: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra", tier: "pro", inputPerMillion: 2, outputPerMillion: 12 },
  { id: "x-ai/grok-4.7", label: "Grok 4.7", tier: "pro", inputPerMillion: 2, outputPerMillion: 6 },
  { id: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5", tier: "max", inputPerMillion: 4, outputPerMillion: 20 },
];

export const TIER_LABELS: Record<AiTier, string> = { lite: "Lite", standard: "Standard", pro: "Pro", max: "Max" };

/** One review: the prompt is about this big, the answer about this. */
export const TYPICAL_INPUT_TOKENS = 3000;
export const TYPICAL_OUTPUT_TOKENS = 400;
/** The co-pilot is asked when a rule wants to trade; most strategies do that 6 to 30 times a month. */
export const TYPICAL_REVIEWS_PER_MONTH = 30;

/** Hard cap on the answer length, so one call can never cost much. */
export const MAX_OUTPUT_TOKENS = 700;

/** Welcome credits for a new account, once (micro-USD). */
export const WELCOME_CREDITS_MICRO = 500_000;

export const aiModel = (id: string | null | undefined) => AI_MODELS.find((model) => model.id === id) ?? null;

export const isLite = (id: string) => aiModel(id)?.tier === "lite";

/** USD for a call with these token counts. */
export function callCostUsd(model: AiModel, inputTokens: number, outputTokens: number): number {
  return (inputTokens * model.inputPerMillion + outputTokens * model.outputPerMillion) / 1_000_000;
}

/** Rough USD per month for an agent whose co-pilot is asked about TYPICAL_REVIEWS_PER_MONTH times. */
export function monthlyEstimateUsd(model: AiModel): number {
  return callCostUsd(model, TYPICAL_INPUT_TOKENS, TYPICAL_OUTPUT_TOKENS) * TYPICAL_REVIEWS_PER_MONTH;
}

/** The most one review can cost (a long prompt and the longest allowed answer). */
export function maxCallCostUsd(model: AiModel): number {
  return callCostUsd(model, TYPICAL_INPUT_TOKENS * 2, MAX_OUTPUT_TOKENS);
}

/** "$0.02" style; tiny amounts show as "< $0.01". */
export function formatCredits(usd: number): string {
  if (usd > 0 && usd < 0.01) return "< $0.01";
  return `$${usd.toFixed(2)}`;
}
