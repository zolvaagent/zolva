import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Hex } from "viem";

import { env } from "@/lib/env";
import { averagePrice } from "@/lib/membership";
import { createChainClient } from "@/lib/prices/onchain";
import { BURN_ADDRESS, burnedBy, MAX_BURN_AGE_SECONDS, MIN_TOPUP_USD, quoteTopUp, ZOLVA_BONUS } from "@/lib/zolva-topup";

export class TopUpError extends Error {}

/** The newest hourly ZOLVA price, or null before the first one. */
export async function latestPrice(db: SupabaseClient): Promise<number | null> {
  const { data } = await db.from("zolva_prices").select("price").order("ts", { ascending: false }).limit(1).maybeSingle<{ price: number }>();
  return data ? Number(data.price) : null;
}

export type TopUpInfo = {
  /** False until ZOLVA_TOKEN_ADDRESS is set. */
  configured: boolean;
  token: string | null;
  decimals: number;
  burnAddress: string;
  /** The price a burn is valued at right now (lower of latest and 7 day average), or null. */
  price: number | null;
  minUsd: number;
  bonus: number;
};

/** What the payment dialog needs to show an estimate before the user sends anything. */
export async function topUpInfo(db: SupabaseClient): Promise<TopUpInfo> {
  const token = env.zolvaToken;
  const base = { burnAddress: BURN_ADDRESS, minUsd: MIN_TOPUP_USD, bonus: ZOLVA_BONUS };
  if (!token) return { ...base, configured: false, token: null, decimals: 18, price: null };
  const [latest, average] = await Promise.all([latestPrice(db), averagePrice(db)]);
  const prices = [latest, average].filter((price): price is number => price !== null);
  return { ...base, configured: true, token: token.address, decimals: token.decimals, price: prices.length ? Math.min(...prices) : null };
}

/**
 * Credits a burn transaction to the account: it must have succeeded, be at most a day
 * old, and send ZOLVA from one of the account's wallets to the burn address. Safe to
 * call twice with the same transaction (the second call credits nothing).
 */
export async function creditBurn(db: SupabaseClient, owner: string, txHash: string): Promise<{ creditsMicro: number; usd: number; already: boolean }> {
  const token = env.zolvaToken;
  if (!token) throw new TopUpError("Paying with ZOLVA starts when the ZOLVA token launches.");
  const hash = txHash.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new TopUpError("That is not a transaction hash.");

  const { data: done } = await db.from("zolva_topups").select("owner, credits_micro, usd").eq("tx_hash", hash).maybeSingle<{ owner: string; credits_micro: number; usd: number }>();
  if (done) {
    if (done.owner !== owner) throw new TopUpError("This transaction was already credited to another account.");
    return { creditsMicro: Number(done.credits_micro), usd: Number(done.usd), already: true };
  }

  const chain = createChainClient(env.robinhoodRpcUrl);
  const receipt = await chain.getTransactionReceipt({ hash: hash as Hex }).catch(() => null);
  if (!receipt) throw new TopUpError("The transaction is not confirmed yet. Wait a few seconds and try again.");
  if (receipt.status !== "success") throw new TopUpError("That transaction failed on chain, so no ZOLVA was burned.");
  const block = await chain.getBlock({ blockNumber: receipt.blockNumber });
  if (Date.now() / 1000 - Number(block.timestamp) > MAX_BURN_AGE_SECONDS) throw new TopUpError("Only burns from the last 24 hours can be credited.");

  const { data: extra } = await db.from("verified_wallets").select("address").eq("owner", owner);
  const wallets = [owner, ...(extra ?? []).map((row) => row.address as string)];
  const burned = burnedBy(receipt.logs, token.address, wallets);
  if (!burned) throw new TopUpError("This transaction did not send ZOLVA from your wallets to the burn address.");

  const [latest, average] = await Promise.all([latestPrice(db), averagePrice(db)]);
  const quote = quoteTopUp(burned.raw, token.decimals, latest, average);
  if (!quote.ok) {
    throw new TopUpError(
      quote.reason === "no_price"
        ? "There is no ZOLVA price yet, so the burn cannot be valued. It stays claimable for 24 hours; try again later."
        : `The burn is worth less than $${MIN_TOPUP_USD}, the smallest top-up.`,
    );
  }
  const { data: granted, error } = await db.rpc("ai_grant_zolva", {
    p_owner: owner,
    p_tx_hash: hash,
    p_wallet: burned.wallet,
    p_amount_raw: burned.raw.toString(),
    p_price: quote.price,
    p_usd: quote.usd,
    p_credits_micro: quote.creditsMicro,
    p_block_number: Number(receipt.blockNumber),
  });
  if (error) throw new Error(`Crediting the burn failed: ${error.message}`);
  return { creditsMicro: quote.creditsMicro, usd: quote.usd, already: granted === false };
}
