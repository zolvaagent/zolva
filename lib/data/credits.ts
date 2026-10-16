import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { WELCOME_CREDITS_MICRO } from "@/lib/ai/models";

export type Credits = {
  /** Welcome credits left, USD (Lite models only). */
  freeUsd: number;
  /** Paid credits left, USD (any model). */
  paidUsd: number;
};

/**
 * A signed-in account's AI credits. Accounts that signed in before credits
 * existed (and kept their session) get their one-time welcome credits here;
 * the database grants them at most once, so calling this often is safe.
 * Only call it with the session's own address.
 */
export async function getCredits(db: SupabaseClient, owner: string): Promise<Credits> {
  const load = () => db.from("ai_credits").select("free_micro, paid_micro, welcome_granted_at").eq("owner", owner).maybeSingle();
  let { data, error } = await load();
  if (error) throw new Error(`Loading AI credits failed: ${error.message}`);
  if (!data?.welcome_granted_at) {
    const { data: granted } = await db.rpc("ai_grant_welcome", { p_owner: owner, p_amount_micro: WELCOME_CREDITS_MICRO });
    if (Number(granted) > 0) ({ data, error } = await load());
  }
  return { freeUsd: Number(data?.free_micro ?? 0) / 1_000_000, paidUsd: Number(data?.paid_micro ?? 0) / 1_000_000 };
}
