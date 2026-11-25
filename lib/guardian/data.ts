import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { erc20Abi, formatUnits, type Hex } from "viem";

import { guardLevels, parseGuardSettings } from "@/lib/guardian/check";
import { getMarket } from "@/lib/data/market";
import { env } from "@/lib/env";
import { storedTier } from "@/lib/membership";
import { createChainClient, MULTICALL3 } from "@/lib/prices/onchain";
import { TIERS } from "@/lib/tiers";

/** A Stock Token (or ETH/BTC) a guard can watch: enabled, on the DEX, from the address allowlist. */
export type GuardianToken = { address: string; symbol: string; name: string; decimals: number };

export type GuardView = {
  id: string;
  wallet: string;
  tokenAddress: string;
  symbol: string;
  basisPrice: number;
  stopLossPct: number;
  takeProfitPct: number | null;
  stopPrice: number;
  takeProfitPrice: number | null;
  status: "armed" | "triggered";
  triggeredAt: string | null;
  createdAt: string;
};

export type AlertView = {
  id: number;
  guardianId: string;
  wallet: string;
  tokenAddress: string;
  symbol: string;
  kind: "stop_loss" | "take_profit";
  hour: string;
  price: number;
  basisPrice: number;
  quantity: number;
  reasoning: string;
  read: boolean;
};

export type Holding = { wallet: string; tokenAddress: string; symbol: string; name: string; quantity: number; price: number | null; valueUsd: number | null };

export type GuardianView = {
  wallets: string[];
  holdings: Holding[];
  guards: GuardView[];
  alerts: AlertView[];
  maxGuards: number;
  /** Start of the hour of the latest close (unix seconds), or null without prices. */
  pricedAt: number | null;
};

export class GuardianInputError extends Error {}

/** The account's own login wallet first, then its verified wallets (lowercase). */
export async function watchedWallets(db: SupabaseClient, owner: string): Promise<string[]> {
  const { data, error } = await db.from("verified_wallets").select("address").eq("owner", owner).order("verified_at");
  if (error) throw new Error(`Loading wallets failed: ${error.message}`);
  return [...new Set([owner, ...data.map((row) => String(row.address).toLowerCase())])];
}

export async function guardianTokens(db: SupabaseClient): Promise<GuardianToken[]> {
  const { data, error } = await db.from("tokens").select("address, symbol, name, token_decimals").eq("enabled", true).eq("venue", "uniswap").order("symbol");
  if (error) throw new Error(`Loading tokens failed: ${error.message}`);
  return data.map((row) => ({ address: String(row.address), symbol: String(row.symbol), name: String(row.name ?? row.symbol), decimals: Number(row.token_decimals ?? 18) }));
}

/** Latest and previous hourly close per token address (cleaned like the engine sees them), and that hour. */
export async function latestCloses(db: SupabaseClient): Promise<{ hour: number | null; closes: Map<string, { close: number; previous: number }> }> {
  const market = await getMarket(db, { hours: 3 });
  const closes = new Map<string, { close: number; previous: number }>();
  if (!market.hours) return { hour: null, closes };
  const last = market.hours - 1;
  for (const token of market.tokens) {
    const close = token.closes[last];
    const previous = token.closes[last - 1] ?? close;
    if (close !== null && close !== undefined && previous !== null && previous !== undefined) closes.set(token.address, { close, previous });
  }
  return { hour: market.startTs + last * 3600, closes };
}

/** Balances (in tokens) of each wallet x token pair, read in one multicall. Failed reads are left out. */
export async function readBalances(pairs: { wallet: string; token: GuardianToken }[]): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  if (!pairs.length) return balances;
  const chain = createChainClient(env.robinhoodRpcUrl);
  const results = await chain.multicall({
    multicallAddress: MULTICALL3,
    allowFailure: true,
    contracts: pairs.map(({ wallet, token }) => ({ address: token.address as Hex, abi: erc20Abi, functionName: "balanceOf" as const, args: [wallet as Hex] as const })),
  });
  results.forEach((result, index) => {
    if (result.status !== "success") return;
    const { wallet, token } = pairs[index];
    balances.set(balanceKey(wallet, token.address), Number(formatUnits(result.result as bigint, token.decimals)));
  });
  return balances;
}

export const balanceKey = (wallet: string, token: string) => `${wallet.toLowerCase()}:${token.toLowerCase()}`;

async function maxGuardsFor(db: SupabaseClient, owner: string): Promise<number> {
  return TIERS[await storedTier(db, owner)].guardsMax;
}

type GuardRow = { id: string; wallet: string; token_address: string; basis_price: number; stop_loss_pct: number; take_profit_pct: number | null; status: "armed" | "triggered"; triggered_at: string | null; created_at: string };
type AlertRow = { id: number; guardian_id: string; wallet: string; token_address: string; kind: "stop_loss" | "take_profit"; hour: string; price: number; basis_price: number; quantity: number; reasoning: string; read_at: string | null };

/** Everything the /guardian page shows: wallets, what they hold (read now), guards and the latest alerts. */
export async function loadGuardian(db: SupabaseClient, owner: string): Promise<GuardianView> {
  const [wallets, tokens, prices, maxGuards, guards, alerts] = await Promise.all([
    watchedWallets(db, owner),
    guardianTokens(db),
    latestCloses(db),
    maxGuardsFor(db, owner),
    db.from("guardians").select("id, wallet, token_address, basis_price, stop_loss_pct, take_profit_pct, status, triggered_at, created_at").eq("owner", owner).order("created_at"),
    db.from("guardian_alerts").select("id, guardian_id, wallet, token_address, kind, hour, price, basis_price, quantity, reasoning, read_at").eq("owner", owner).order("created_at", { ascending: false }).limit(50),
  ]);
  if (guards.error) throw new Error(`Loading guards failed: ${guards.error.message}`);
  if (alerts.error) throw new Error(`Loading alerts failed: ${alerts.error.message}`);
  const symbolOf = new Map(tokens.map((token) => [token.address, token]));

  // Holdings are read on chain each visit; a failed read shows no holdings rather than failing the page.
  let balances = new Map<string, number>();
  try {
    balances = await readBalances(wallets.flatMap((wallet) => tokens.map((token) => ({ wallet, token }))));
  } catch (cause) {
    console.error("Guardian balance read failed:", cause instanceof Error ? cause.name : "unknown");
  }
  const holdings: Holding[] = [];
  for (const wallet of wallets) {
    for (const token of tokens) {
      const quantity = balances.get(balanceKey(wallet, token.address)) ?? 0;
      // Dust (under a millionth of a token) is not worth a guard.
      if (quantity < 1e-6) continue;
      const price = prices.closes.get(token.address)?.close ?? null;
      holdings.push({ wallet, tokenAddress: token.address, symbol: token.symbol, name: token.name, quantity, price, valueUsd: price === null ? null : quantity * price });
    }
  }
  holdings.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  return {
    wallets,
    holdings,
    guards: (guards.data as GuardRow[]).map((row) => {
      const settings = { basisPrice: Number(row.basis_price), stopLossPct: Number(row.stop_loss_pct), takeProfitPct: row.take_profit_pct === null ? null : Number(row.take_profit_pct) };
      return {
        id: row.id,
        wallet: row.wallet,
        tokenAddress: row.token_address,
        symbol: symbolOf.get(row.token_address)?.symbol ?? "?",
        ...settings,
        ...guardLevels(settings),
        status: row.status,
        triggeredAt: row.triggered_at,
        createdAt: row.created_at,
      };
    }),
    alerts: (alerts.data as AlertRow[]).map((row) => ({
      id: Number(row.id),
      guardianId: row.guardian_id,
      wallet: row.wallet,
      tokenAddress: row.token_address,
      symbol: symbolOf.get(row.token_address)?.symbol ?? "?",
      kind: row.kind,
      hour: row.hour,
      price: Number(row.price),
      basisPrice: Number(row.basis_price),
      quantity: Number(row.quantity),
      reasoning: row.reasoning,
      read: row.read_at !== null,
    })),
    maxGuards,
    pricedAt: prices.hour,
  };
}

/** Sets a guard on a token in one of the account's wallets. Basis defaults to the latest close. */
export async function createGuard(db: SupabaseClient, owner: string, input: { wallet?: unknown; tokenAddress?: unknown; stopLossPct?: unknown; takeProfitPct?: unknown; basisPrice?: unknown }): Promise<void> {
  const settings = parseGuardSettings(input);
  if (!settings.ok) throw new GuardianInputError(settings.error);
  const wallet = typeof input.wallet === "string" ? input.wallet.toLowerCase() : "";
  const tokenAddress = typeof input.tokenAddress === "string" ? input.tokenAddress.toLowerCase() : "";
  const [wallets, tokens, maxGuards, { count }] = await Promise.all([
    watchedWallets(db, owner),
    guardianTokens(db),
    maxGuardsFor(db, owner),
    db.from("guardians").select("id", { count: "exact", head: true }).eq("owner", owner),
  ]);
  // Only wallets the account proved it owns, and only allowlisted tokens (never by symbol).
  if (!wallets.includes(wallet)) throw new GuardianInputError("That wallet is not linked to your account.");
  if (!tokens.some((token) => token.address === tokenAddress)) throw new GuardianInputError("That token cannot be guarded.");
  if ((count ?? 0) >= maxGuards) throw new GuardianInputError(`You can set up to ${maxGuards} guards. Remove one first, or hold more ZOLVA for a higher limit.`);
  let basis = settings.basisPrice;
  if (basis === null) {
    basis = (await latestCloses(db)).closes.get(tokenAddress)?.close ?? null;
    if (basis === null) throw new GuardianInputError("No price for that token yet. Enter the price to measure from.");
  }
  const { error } = await db.from("guardians").insert({ owner, wallet, token_address: tokenAddress, basis_price: basis, stop_loss_pct: settings.stopLossPct, take_profit_pct: settings.takeProfitPct });
  if (error) {
    if (error.code === "23505") throw new GuardianInputError("That token in that wallet already has a guard. Edit it instead.");
    throw new Error(`Saving the guard failed: ${error.message}`);
  }
}

/** Changes a guard's limits or basis; saving also re-arms a triggered guard. */
export async function updateGuard(db: SupabaseClient, owner: string, id: string, input: { stopLossPct?: unknown; takeProfitPct?: unknown; basisPrice?: unknown }): Promise<void> {
  const settings = parseGuardSettings(input);
  if (!settings.ok) throw new GuardianInputError(settings.error);
  const changes: Record<string, unknown> = { stop_loss_pct: settings.stopLossPct, take_profit_pct: settings.takeProfitPct, status: "armed", triggered_at: null };
  if (settings.basisPrice !== null) changes.basis_price = settings.basisPrice;
  const { data, error } = await db.from("guardians").update(changes).eq("id", id).eq("owner", owner).select("id");
  if (error) throw new Error(`Updating the guard failed: ${error.message}`);
  if (!data.length) throw new GuardianInputError("Guard not found.");
}

export async function deleteGuard(db: SupabaseClient, owner: string, id: string): Promise<void> {
  const { data, error } = await db.from("guardians").delete().eq("id", id).eq("owner", owner).select("id");
  if (error) throw new Error(`Removing the guard failed: ${error.message}`);
  if (!data.length) throw new GuardianInputError("Guard not found.");
}

export async function unreadAlertCount(db: SupabaseClient, owner: string): Promise<number> {
  const { count, error } = await db.from("guardian_alerts").select("id", { count: "exact", head: true }).eq("owner", owner).is("read_at", null);
  if (error) throw new Error(`Counting alerts failed: ${error.message}`);
  return count ?? 0;
}

export async function markAlertsRead(db: SupabaseClient, owner: string): Promise<void> {
  const { error } = await db.from("guardian_alerts").update({ read_at: new Date().toISOString() }).eq("owner", owner).is("read_at", null);
  if (error) throw new Error(`Updating alerts failed: ${error.message}`);
}
