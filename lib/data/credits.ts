import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type Credits = {
  /** Welcome credits left, USD (Lite models only). */
  freeUsd: number;
  /** Paid credits left, USD (any model). */
  paidUsd: number;
};

/** An account's AI credits; zero for accounts that never got any. */
export async function getCredits(db: SupabaseClient, owner: string): Promise<Credits> {
  const { data, error } = await db.from("ai_credits").select("free_micro, paid_micro").eq("owner", owner).maybeSingle();
  if (error) throw new Error(`Loading AI credits failed: ${error.message}`);
  return { freeUsd: Number(data?.free_micro ?? 0) / 1_000_000, paidUsd: Number(data?.paid_micro ?? 0) / 1_000_000 };
}
