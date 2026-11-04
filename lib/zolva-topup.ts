/**
 * Paying for AI credits with ZOLVA (docs/ai-and-token-plan.md section 11). The user's
 * wallet sends ZOLVA straight to the burn address; Zolva checks that transaction on
 * chain and adds paid credits. Zolva never holds the tokens. Pure: shared by the
 * server check, the payment dialog and the tests.
 */
import { decodeEventLog, erc20Abi, type Hex, type Log } from "viem";

import { holdingsUsd } from "./tiers";

/** Tokens sent here can never move again. */
export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
/** Paying in ZOLVA gives this much more credit than the same value in USDG. */
export const ZOLVA_BONUS = 0.1;
/** Smallest top-up, so gas is never a big share of it. */
export const MIN_TOPUP_USD = 1;
/** A burn older than this is not accepted (unix seconds). */
export const MAX_BURN_AGE_SECONDS = 24 * 3600;

/**
 * The price a burn is valued at: the lower of the latest hourly price and the 7 day
 * average, so buying after a crash cannot be credited at the older, higher average.
 */
export function topUpPrice(latest: number | null, average: number | null): number | null {
  const prices = [latest, average].filter((price): price is number => price !== null && price > 0);
  return prices.length ? Math.min(...prices) : null;
}

export type TopUpQuote = { ok: true; price: number; usd: number; creditsMicro: number } | { ok: false; reason: "no_price" | "too_small"; usd: number };

/** What a burn of `raw` base units is worth in credits (micro-USD), bonus included. */
export function quoteTopUp(raw: bigint, decimals: number, latest: number | null, average: number | null): TopUpQuote {
  const price = topUpPrice(latest, average);
  if (price === null) return { ok: false, reason: "no_price", usd: 0 };
  const usd = holdingsUsd(raw, decimals, price);
  if (usd < MIN_TOPUP_USD) return { ok: false, reason: "too_small", usd };
  return { ok: true, price, usd, creditsMicro: Math.floor(usd * (1 + ZOLVA_BONUS) * 1_000_000) };
}

/**
 * ZOLVA sent to the burn address in a transaction's logs, from one of the account's
 * wallets. Returns the total and the sending wallet, or null if there is none.
 */
export function burnedBy(logs: Pick<Log, "address" | "topics" | "data">[], token: string, wallets: string[]): { raw: bigint; wallet: string } | null {
  const own = new Set(wallets.map((wallet) => wallet.toLowerCase()));
  let raw = 0n;
  let wallet: string | null = null;
  for (const log of logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    let event;
    try {
      event = decodeEventLog({ abi: erc20Abi, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
    } catch {
      continue;
    }
    if (event.eventName !== "Transfer") continue;
    const from = event.args.from.toLowerCase();
    if (event.args.to.toLowerCase() !== BURN_ADDRESS.toLowerCase() || !own.has(from)) continue;
    raw += event.args.value;
    wallet ??= from;
  }
  return wallet && raw > 0n ? { raw, wallet } : null;
}
