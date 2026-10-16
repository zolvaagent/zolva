/**
 * The owner's AI budget for one agent: at most `limit` USD in total, until an
 * expiry date. Whichever runs out first (this limit, the date, or the
 * account's credits) stops the co-pilot; the agent keeps trading on its rules.
 * A limit may be larger than the balance: it is a cap, nothing is reserved.
 * Enforced in the database by ai_claim_review.
 */
import { monthlyEstimateUsd, type AiModel } from "./models.ts";

export const AI_LIMIT_MIN_USD = 0.01;
export const AI_LIMIT_MAX_USD = 1000;

/** How long a budget lasts, in days, as offered in the UI. */
export const AI_EXPIRY_DAYS = [7, 30, 90, 365] as const;
export const DEFAULT_EXPIRY_DAYS = 30;

/** Suggested limit: about three months of typical use, rounded up to 5 cents. */
export function suggestedLimitUsd(model: AiModel): number {
  return Math.max(0.05, Math.ceil(monthlyEstimateUsd(model) * 3 * 20) / 20);
}

export type AiLimit = { limitMicro: number; expiresAt: string };

/** Validates untrusted { limitUsd, expiryDays } input. */
export function parseAiLimit(limitUsd: unknown, expiryDays: unknown, now = Date.now()): { ok: true; value: AiLimit } | { ok: false; error: string } {
  const usd = Number(limitUsd);
  if (limitUsd === null || limitUsd === "" || !Number.isFinite(usd) || usd < AI_LIMIT_MIN_USD || usd > AI_LIMIT_MAX_USD) {
    return { ok: false, error: `Set an AI limit between $${AI_LIMIT_MIN_USD} and $${AI_LIMIT_MAX_USD}.` };
  }
  const days = Number(expiryDays);
  if (!(AI_EXPIRY_DAYS as readonly number[]).includes(days)) return { ok: false, error: "Pick how long the AI limit lasts." };
  return { ok: true, value: { limitMicro: Math.round(usd * 1_000_000), expiresAt: new Date(now + days * 86_400_000).toISOString() } };
}
