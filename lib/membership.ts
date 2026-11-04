import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { erc20Abi, type Hex } from "viem";

import { isLite } from "@/lib/ai/models";
import { env } from "@/lib/env";
import { createChainClient } from "@/lib/prices/onchain";
import { holdingsUsd, linkWalletMessage, nextMembership, tierForUsd, TIERS, type Tier, type TierLimits } from "@/lib/tiers";

/** A balance read stays fresh this long; "Refresh" reads again at once. */
const FRESH_MS = 10 * 60 * 1000;
/** Hours of prices in the average that values holdings. */
const AVERAGE_HOURS = 168;
const GECKO_TOKEN_URL = "https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/";

export type MembershipState = {
  /** False until ZOLVA_TOKEN_ADDRESS is set: everyone is Free and nothing is read. */
  configured: boolean;
  tier: Tier;
  limits: TierLimits;
  holdingsUsd: number;
  /** Raw summed balance in base units, as a string (it can exceed 2^53). */
  balance: string;
  /** 7 day average USD price, or null before the first price. */
  averagePrice: number | null;
  /** The login wallet first, then verified extra wallets. */
  wallets: { address: string; primary: boolean }[];
  checkedAt: number | null;
  /** Set while holdings are below the tier: the lower tier applies after this (unix seconds). */
  graceUntil: number | null;
};

type MembershipRow = { owner: string; tier: Tier; balance: string; holdings_usd: number; checked_at: string | null; grace_until: string | null };

async function extraWallets(db: SupabaseClient, owner: string): Promise<string[]> {
  const { data, error } = await db.from("verified_wallets").select("address").eq("owner", owner).order("verified_at");
  if (error) throw new Error(`Loading wallets failed: ${error.message}`);
  return data.map((row) => row.address as string);
}

/** Average of the last 7 days of hourly ZOLVA prices, or null with none yet. */
export async function averagePrice(db: SupabaseClient): Promise<number | null> {
  const since = new Date(Date.now() - AVERAGE_HOURS * 3600 * 1000).toISOString();
  const { data, error } = await db.from("zolva_prices").select("price").gte("ts", since);
  if (error) throw new Error(`Loading ZOLVA prices failed: ${error.message}`);
  if (!data.length) return null;
  return data.reduce((sum, row) => sum + Number(row.price), 0) / data.length;
}

function toState(row: MembershipRow | null, wallets: string[], owner: string, configured: boolean, price: number | null): MembershipState {
  const tier = configured ? (row?.tier ?? "free") : "free";
  return {
    configured,
    tier,
    limits: TIERS[tier],
    holdingsUsd: configured ? Number(row?.holdings_usd ?? 0) : 0,
    balance: configured ? String(row?.balance ?? "0") : "0",
    averagePrice: price,
    wallets: [{ address: owner, primary: true }, ...wallets.map((address) => ({ address, primary: false }))],
    checkedAt: row?.checked_at ? Date.parse(row.checked_at) / 1000 : null,
    graceUntil: configured && row?.grace_until ? Date.parse(row.grace_until) / 1000 : null,
  };
}

/**
 * The account's tier, reading balances from the chain when the last read is older
 * than 10 minutes (or always, with force). If the chain or the price cannot be
 * read, the stored tier is kept for now; with none stored the account is Free.
 */
export async function getMembership(db: SupabaseClient, owner: string, options: { force?: boolean } = {}): Promise<MembershipState> {
  const token = env.zolvaToken;
  // Before launch nothing is read, so this works even before the membership tables exist.
  if (!token) return toState(null, [], owner, false, null);
  const [{ data: row }, wallets] = await Promise.all([
    db.from("memberships").select("owner, tier, balance, holdings_usd, checked_at, grace_until").eq("owner", owner).maybeSingle<MembershipRow>(),
    extraWallets(db, owner),
  ]);

  const price = await averagePrice(db);
  const fresh = row?.checked_at && Date.now() - Date.parse(row.checked_at) < FRESH_MS;
  if (fresh && !options.force) return toState(row, wallets, owner, true, price);

  let raw = 0n;
  try {
    const chain = createChainClient(env.robinhoodRpcUrl);
    const balances = await Promise.all(
      [owner, ...wallets].map((wallet) => chain.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [wallet as Hex] })),
    );
    raw = balances.reduce((sum, value) => sum + value, 0n);
  } catch {
    return toState(row, wallets, owner, true, price);
  }

  const usd = holdingsUsd(raw, token.decimals, price);
  const now = Math.floor(Date.now() / 1000);
  const current = { tier: row?.tier ?? ("free" as Tier), graceUntil: row?.grace_until ? Date.parse(row.grace_until) / 1000 : null };
  const next = nextMembership(current, tierForUsd(usd), now);
  const saved: MembershipRow = {
    owner,
    tier: next.tier,
    balance: raw.toString(),
    holdings_usd: usd,
    checked_at: new Date(now * 1000).toISOString(),
    grace_until: next.graceUntil ? new Date(next.graceUntil * 1000).toISOString() : null,
  };
  const { error } = await db.from("memberships").upsert(saved, { onConflict: "owner" });
  if (error) throw new Error(`Saving the membership failed: ${error.message}`);
  return toState(saved, wallets, owner, true, price);
}

/** The stored tier, without reading the chain (for limits checked on every request). */
export async function storedTier(db: SupabaseClient, owner: string): Promise<Tier> {
  if (!env.zolvaToken) return "free";
  const { data } = await db.from("memberships").select("tier").eq("owner", owner).maybeSingle<{ tier: Tier }>();
  return data?.tier ?? "free";
}

/**
 * Whether this agent's hourly AI reviews are free under its owner's tier: the owner's
 * oldest active agents on a Lite model, up to the tier's freeAiAgents (0 on Free).
 */
export async function aiReviewCovered(db: SupabaseClient, agentId: string, owner: string): Promise<boolean> {
  const allowed = TIERS[await storedTier(db, owner)].freeAiAgents;
  if (!allowed) return false;
  const { data, error } = await db
    .from("agents")
    .select("id, ai_model")
    .eq("owner", owner)
    .eq("status", "active")
    .not("ai_model", "is", null)
    .order("created_at", { ascending: true });
  if (error) return false;
  return data
    .filter((row) => isLite(row.ai_model as string))
    .slice(0, allowed)
    .some((row) => row.id === agentId);
}

export class WalletLinkError extends Error {}

/**
 * Adds a wallet to an account after checking its signature over linkWalletMessage.
 * Smart contract wallets work too (ERC-1271, checked over RPC).
 */
export async function linkWallet(db: SupabaseClient, owner: string, wallet: string, nonce: string, signature: Hex): Promise<void> {
  const address = wallet.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new WalletLinkError("That is not a wallet address.");
  if (address === owner) throw new WalletLinkError("Your login wallet already counts.");
  const chain = createChainClient(env.robinhoodRpcUrl);
  const valid = await chain
    .verifyMessage({ address: address as Hex, message: linkWalletMessage(address, owner, nonce), signature })
    .catch(() => false);
  if (!valid) throw new WalletLinkError("The signature does not match this wallet.");

  const { data: existing } = await db.from("verified_wallets").select("owner").eq("address", address).maybeSingle<{ owner: string }>();
  if (existing && existing.owner !== owner) throw new WalletLinkError("This wallet already counts for another Zolva account. Remove it there first.");
  if (existing) return;
  const { error } = await db.from("verified_wallets").insert({ address, owner });
  if (error) throw new Error(`Saving the wallet failed: ${error.message}`);
}

export async function unlinkWallet(db: SupabaseClient, owner: string, wallet: string): Promise<void> {
  const { error } = await db.from("verified_wallets").delete().eq("owner", owner).eq("address", wallet.toLowerCase());
  if (error) throw new Error(`Removing the wallet failed: ${error.message}`);
}

/**
 * Hourly (from the cron tick): stores ZOLVA's USD price for the 7 day average and
 * re-reads accounts whose last read is older than an hour, so a grace period ends
 * on time. Best effort: GeckoTerminal sometimes refuses Cloudflare IPs.
 */
export async function hourlyMembershipUpkeep(db: SupabaseClient, hourTs: number): Promise<{ price: number | null; refreshed: number; note: string | null }> {
  const token = env.zolvaToken;
  if (!token) return { price: null, refreshed: 0, note: "ZOLVA token not configured" };

  let price: number | null = null;
  let note: string | null = null;
  try {
    const response = await fetch(`${GECKO_TOKEN_URL}${token.address}`, { headers: { Accept: "application/json" } });
    const body = (await response.json().catch(() => null)) as { data?: { attributes?: { price_usd?: string | null } } } | null;
    const value = Number(body?.data?.attributes?.price_usd);
    if (response.ok && Number.isFinite(value) && value > 0) {
      price = value;
      const { error } = await db.from("zolva_prices").upsert({ ts: new Date(hourTs * 1000).toISOString(), price }, { onConflict: "ts" });
      if (error) note = `saving the ZOLVA price failed: ${error.message}`;
    } else {
      note = `no ZOLVA price from GeckoTerminal (HTTP ${response.status})`;
    }
  } catch (cause) {
    note = `ZOLVA price fetch failed: ${cause instanceof Error ? cause.message : String(cause)}`;
  }

  const stale = new Date(Date.now() - 3600 * 1000).toISOString();
  const { data: rows } = await db.from("memberships").select("owner").or(`checked_at.is.null,checked_at.lt.${stale}`).limit(200);
  let refreshed = 0;
  for (const row of rows ?? []) {
    await getMembership(db, row.owner as string, { force: true }).catch(() => null);
    refreshed += 1;
  }
  return { price, refreshed, note };
}
