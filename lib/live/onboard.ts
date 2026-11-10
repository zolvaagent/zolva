import "server-only";

import { PrivyClient } from "@privy-io/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { erc20Abi, type Hex, type PublicClient } from "viem";

import { env } from "@/lib/env";
import { livePolicyRules, USDG } from "@/lib/live/contracts";

/**
 * Self-serve real money onboarding (2026-11-10). What the owner did by hand with
 * `npm run live:setup` and `live:agent`, for any user with a Privy embedded wallet:
 *
 * 1. prepare: create a Privy policy for this one wallet (only router approvals and
 *    Uniswap swaps of allowlisted tokens, paid back into the same wallet, on Robinhood
 *    Chain) and return it with Zolva's signer id.
 * 2. the browser adds Zolva's signer to the wallet with that policy (privy.addSigner).
 * 3. confirm: read the wallet from Privy and only allowlist it (live_wallets) once the
 *    signer is really on it with exactly that policy.
 *
 * The database then accepts a live agent for the wallet (live_agent_guard), and the
 * hourly runner trades it under the global limits in live_settings.
 */

export class LiveOnboardError extends Error {}

type Signer = { signerId: string; privy: PrivyClient };

/** Zolva's signer and a Privy client, or a clear error when real money is not configured. */
function signer(): Signer {
  const config = env.privy;
  const signerId = env.privySignerId;
  if (!config || !signerId || !env.privyAuthorizationKey) throw new LiveOnboardError("Real money trading is not available right now.");
  return { signerId, privy: new PrivyClient({ appId: config.appId, appSecret: config.appSecret }) };
}

/** The Privy embedded wallet behind an address, or an error for external wallets. */
async function embeddedWallet(privy: PrivyClient, address: string) {
  const found = (await privy.wallets().list({ address, chain_type: "ethereum" })).data?.[0];
  if (!found) throw new LiveOnboardError("Real money needs a wallet made by Zolva. Log in with email or Google to get one.");
  return found;
}

/** Tokens a live agent may trade: USDG and every enabled market with a v3 USDG pool. */
async function liveTokens(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from("tokens").select("address").eq("enabled", true).eq("pool_kind", "v3");
  if (error) throw new Error(`Loading tokens failed: ${error.message}`);
  return [USDG, ...data.map((row) => row.address.toLowerCase())];
}

/** Step 1: a fresh policy for this wallet. Returns what the browser needs to add the signer. */
export async function prepareLiveWallet(db: SupabaseClient, owner: string): Promise<{ signerId: string; policyId: string }> {
  const { signerId, privy } = signer();
  await embeddedWallet(privy, owner);
  const policy = await privy.policies().create({
    version: "1.0",
    chain_type: "ethereum",
    name: `Zolva live ${owner.slice(0, 8)}`,
    // The SDK types each condition as a union; the rule objects follow it field for field.
    rules: livePolicyRules(owner, await liveTokens(db)) as never,
  });
  return { signerId, policyId: policy.id };
}

/** Step 3: allowlist the wallet once Zolva's signer is on it with this policy. */
export async function confirmLiveWallet(db: SupabaseClient, owner: string, policyId: unknown): Promise<void> {
  if (typeof policyId !== "string" || !policyId) throw new LiveOnboardError("Unknown request.");
  const { signerId, privy } = signer();
  const wallet = await embeddedWallet(privy, owner);
  const signers = (wallet.additional_signers ?? []) as { signer_id: string; override_policy_ids?: string[] }[];
  const granted = signers.some((item) => item.signer_id === signerId && (item.override_policy_ids ?? []).includes(policyId));
  if (!granted) throw new LiveOnboardError("Zolva's signer is not on your wallet yet. Approve it in the Privy window, then try again.");
  const { error } = await db
    .from("live_wallets")
    .upsert({ address: owner, privy_wallet_id: wallet.id, policy_id: policyId, note: "self-serve" }, { onConflict: "address" });
  if (error) throw new Error(`Allowlisting failed: ${error.message}`);
}

export type LiveStatus = {
  /** Allowlisted, so a live agent can be launched. */
  enabled: boolean;
  /** USDG in the wallet (token units) and ETH for gas (ether). */
  usdg: number;
  eth: number;
  /** Limits from live_settings. */
  maxCapitalUsd: number;
  dailyVolumeUsd: number;
  /** Real money is switched on globally. */
  open: boolean;
  /** The owner already runs a live agent (one at a time). */
  hasActiveLiveAgent: boolean;
};

/** Everything the Studio needs to show the real money steps for a wallet. */
export async function liveStatus(db: SupabaseClient, chain: PublicClient, owner: string): Promise<LiveStatus> {
  const [listed, settings, active, usdgRaw, ethWei] = await Promise.all([
    db.from("live_wallets").select("address").eq("address", owner).maybeSingle(),
    db.from("live_settings").select("enabled, max_agent_capital_usd, daily_volume_usd").eq("id", 1).single(),
    db.from("agents").select("id", { count: "exact", head: true }).eq("owner", owner).eq("mode", "live").eq("status", "active"),
    chain.readContract({ address: USDG as Hex, abi: erc20Abi, functionName: "balanceOf", args: [owner as Hex] }).catch(() => 0n),
    chain.getBalance({ address: owner as Hex }).catch(() => 0n),
  ]);
  if (settings.error) throw new Error(`Loading live settings failed: ${settings.error.message}`);
  return {
    enabled: Boolean(listed.data),
    usdg: Number(usdgRaw) / 1e6,
    eth: Number(ethWei) / 1e18,
    maxCapitalUsd: Number(settings.data.max_agent_capital_usd),
    dailyVolumeUsd: Number(settings.data.daily_volume_usd),
    open: Boolean(settings.data.enabled),
    hasActiveLiveAgent: (active.count ?? 0) > 0,
  };
}
