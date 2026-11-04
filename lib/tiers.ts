/**
 * ZOLVA holder tiers (docs/ai-and-token-plan.md section 11). Pure: no database,
 * no chain, so the same rules run in the app, the tests and the docs page.
 *
 * Holding ZOLVA (worth at the 7 day average price, across the account's
 * verified wallets) raises an account's limits. Nothing is staked or locked.
 * While the ZOLVA token address is not configured, everyone is on Free.
 */

export type Tier = "free" | "holder" | "pro";

export type TierLimits = {
  label: string;
  /** Holdings worth at least this many USD (7 day average price). */
  minUsd: number;
  /** Agents whose hourly AI reviews on a Lite model are free (oldest active first). */
  freeAiAgents: number;
  /** Active paper agents at once. */
  activeAgents: number;
  /** AI strategy writer tries per 24 hours. */
  writerPerDay: number;
};

export const TIERS: Record<Tier, TierLimits> = {
  free: { label: "Free", minUsd: 0, freeAiAgents: 0, activeAgents: 5, writerPerDay: 10 },
  holder: { label: "Holder", minUsd: 25, freeAiAgents: 1, activeAgents: 10, writerPerDay: 20 },
  pro: { label: "Pro", minUsd: 150, freeAiAgents: 3, activeAgents: 20, writerPerDay: 50 },
};

const ORDER: Tier[] = ["free", "holder", "pro"];

/** Days a lower tier waits before it applies, so a short dip does not cost a tier. */
export const GRACE_DAYS = 3;

/** The tier the holdings earn right now, ignoring the grace period. */
export function tierForUsd(usd: number): Tier {
  let tier: Tier = "free";
  for (const key of ORDER) if (usd >= TIERS[key].minUsd) tier = key;
  return tier;
}

const rank = (tier: Tier) => ORDER.indexOf(tier);

export type Membership = { tier: Tier; graceUntil: number | null };

/**
 * The tier to keep after a fresh balance read. A higher tier applies at once; a
 * lower one only after GRACE_DAYS, counted from the first read that showed it.
 * Coming back up during the grace period cancels it.
 *
 * @param current  what the account has now
 * @param earned   tierForUsd of the fresh holdings
 * @param now      unix seconds
 */
export function nextMembership(current: Membership, earned: Tier, now: number): Membership {
  if (rank(earned) >= rank(current.tier)) return { tier: earned, graceUntil: null };
  const graceUntil = current.graceUntil ?? now + GRACE_DAYS * 86_400;
  return now >= graceUntil ? { tier: earned, graceUntil: null } : { tier: current.tier, graceUntil };
}

/**
 * USD worth of a raw balance at the 7 day average price.
 *
 * @param raw       token balance in base units
 * @param decimals  token decimals
 * @param price     average USD price, or null when no price is known yet
 */
export function holdingsUsd(raw: bigint, decimals: number, price: number | null): number {
  if (price === null || price <= 0) return 0;
  // Split to keep precision for 18 decimal tokens before converting to a float.
  const unit = 10n ** BigInt(decimals);
  return (Number(raw / unit) + Number(raw % unit) / Number(unit)) * price;
}

/** The message a wallet signs to join an account (no transaction, no gas). */
export function linkWalletMessage(wallet: string, account: string, nonce: string): string {
  return [
    "Zolva: count this wallet's ZOLVA for my account.",
    "",
    `Wallet: ${wallet.toLowerCase()}`,
    `Account: ${account.toLowerCase()}`,
    `Nonce: ${nonce}`,
    "",
    "Signing is free and moves no funds.",
  ].join("\n");
}
