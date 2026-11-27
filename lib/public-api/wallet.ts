import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * GET /api/public/v1/agents/by-wallet/{address}: does this wallet belong to a Zolva agent?
 * Built for Rushr, which shows a "Runs on Zolva" badge on agent cards. The answer is only
 * true or false: never the owner, the user's wallet or anything else about the agent.
 *
 * "A Zolva agent" here means a trench agent that is registered on Rushr (it has a Rushr
 * handle) and has its own wallet. It stays true after the agent is paused or closed, since
 * the Rushr listing stays too. Agents still in setup have no Rushr handle yet, so they are false.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The address in lower case, or null when it is not a 20 byte hex address. */
export function parseWalletAddress(value: string): string | null {
  return ADDRESS.test(value) ? value.toLowerCase() : null;
}

export type WalletCheck = { zolva: boolean };

/** Looks the (already lower case) address up among the wallets of Zolva's Rushr agents. */
export async function walletBody(db: SupabaseClient, address: string): Promise<WalletCheck> {
  const { data, error } = await db
    .from("trench_agents")
    .select("id")
    .eq("wallet_address", address)
    .not("rushr_handle", "is", null)
    .limit(1);
  if (error) throw new Error(`Looking up the wallet failed: ${error.message}`);
  return { zolva: (data ?? []).length > 0 };
}
