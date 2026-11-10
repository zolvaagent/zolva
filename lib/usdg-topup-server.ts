import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Hex } from "viem";

import { env } from "@/lib/env";
import { USDG } from "@/lib/live/contracts";
import { createChainClient } from "@/lib/prices/onchain";
import { MAX_PAYMENT_AGE_SECONDS, MAX_USDG_TOPUP, MIN_USDG_TOPUP, paidBy, quoteUsdgTopUp } from "@/lib/usdg-topup";
import { TopUpError } from "@/lib/zolva-topup-server";

export type UsdgTopUpInfo = {
  /** False until a receiving address is configured. */
  configured: boolean;
  usdg: string;
  payTo: string | null;
  minUsd: number;
  maxUsd: number;
};

/** What the "Top up with USDG" dialog needs before the user sends anything. */
export function usdgTopUpInfo(): UsdgTopUpInfo {
  const payTo = env.creditsPayTo;
  return { configured: payTo !== null, usdg: USDG, payTo, minUsd: MIN_USDG_TOPUP, maxUsd: MAX_USDG_TOPUP };
}

/**
 * Credits a USDG payment to the account: it must have succeeded, be at most a day old, and
 * send USDG from one of the account's wallets to Zolva's receiving address. Safe to call twice
 * with the same transaction (the second call credits nothing).
 */
export async function creditUsdgPayment(db: SupabaseClient, owner: string, txHash: string): Promise<{ creditsMicro: number; already: boolean }> {
  const payTo = env.creditsPayTo;
  if (!payTo) throw new TopUpError("USDG top-ups are not open yet.");
  const hash = txHash.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new TopUpError("That is not a transaction hash.");

  const { data: done } = await db.from("usdg_topups").select("owner, credits_micro").eq("tx_hash", hash).maybeSingle<{ owner: string; credits_micro: number }>();
  if (done) {
    if (done.owner !== owner) throw new TopUpError("This transaction was already credited to another account.");
    return { creditsMicro: Number(done.credits_micro), already: true };
  }

  const chain = createChainClient(env.robinhoodRpcUrl);
  const receipt = await chain.getTransactionReceipt({ hash: hash as Hex }).catch(() => null);
  if (!receipt) throw new TopUpError("The transaction is not confirmed yet. Wait a few seconds and try again.");
  if (receipt.status !== "success") throw new TopUpError("That transaction failed on chain, so no USDG was sent.");
  const block = await chain.getBlock({ blockNumber: receipt.blockNumber });
  if (Date.now() / 1000 - Number(block.timestamp) > MAX_PAYMENT_AGE_SECONDS) throw new TopUpError("Only payments from the last 24 hours can be credited.");

  const { data: extra } = await db.from("verified_wallets").select("address").eq("owner", owner);
  const wallets = [owner, ...(extra ?? []).map((row) => row.address as string)];
  const paid = paidBy(receipt.logs, USDG, payTo, wallets);
  if (!paid) throw new TopUpError("This transaction did not send USDG from your wallets to Zolva.");

  const quote = quoteUsdgTopUp(paid.raw);
  if (!quote.ok) {
    throw new TopUpError(
      quote.reason === "too_small"
        ? `The payment is less than $${MIN_USDG_TOPUP}, the smallest top-up. Contact Zolva for a refund.`
        : `The payment is more than $${MAX_USDG_TOPUP}, the largest top-up. Contact Zolva; it was not credited.`,
    );
  }
  const { data: granted, error } = await db.rpc("ai_grant_usdg", {
    p_owner: owner,
    p_tx_hash: hash,
    p_wallet: paid.wallet,
    p_pay_to: payTo,
    p_amount_raw: paid.raw.toString(),
    p_credits_micro: quote.creditsMicro,
    p_block_number: Number(receipt.blockNumber),
  });
  if (error) throw new Error(`Crediting the payment failed: ${error.message}`);
  return { creditsMicro: quote.creditsMicro, already: granted === false };
}
