/**
 * Self-serve AI credit top-up in USDG. The user's wallet sends USDG to Zolva's receiving
 * address; Zolva checks that transaction on chain and adds paid credits, 1 USDG = $1.
 * Pure: shared by the server check, the payment dialog and the tests.
 */
import { decodeEventLog, erc20Abi, type Hex, type Log } from "viem";

/** USDG has 6 decimals, so one base unit is exactly one micro-dollar of credit. */
export const USDG_TOPUP_DECIMALS = 6;
/** Smallest top-up, so gas is never a big share of it. */
export const MIN_USDG_TOPUP = 1;
/** Largest single top-up: credits are for AI reviews, so a bigger transfer is likely a mistake. */
export const MAX_USDG_TOPUP = 500;
/** A payment older than this is not accepted (unix seconds). */
export const MAX_PAYMENT_AGE_SECONDS = 24 * 3600;

/**
 * USDG sent to `payTo` in a transaction's logs, from one of the account's wallets.
 * Returns the total and the sending wallet, or null if there is none.
 */
export function paidBy(logs: Pick<Log, "address" | "topics" | "data">[], usdg: string, payTo: string, wallets: string[]): { raw: bigint; wallet: string } | null {
  const own = new Set(wallets.map((wallet) => wallet.toLowerCase()));
  let raw = 0n;
  let wallet: string | null = null;
  for (const log of logs) {
    if (log.address.toLowerCase() !== usdg.toLowerCase()) continue;
    let event;
    try {
      event = decodeEventLog({ abi: erc20Abi, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
    } catch {
      continue;
    }
    if (event.eventName !== "Transfer") continue;
    const from = event.args.from.toLowerCase();
    if (event.args.to.toLowerCase() !== payTo.toLowerCase() || !own.has(from)) continue;
    raw += event.args.value;
    wallet ??= from;
  }
  return wallet && raw > 0n ? { raw, wallet } : null;
}

/** Credits (micro-dollars) for a USDG payment, or why it cannot be credited. */
export function quoteUsdgTopUp(raw: bigint): { ok: true; creditsMicro: number } | { ok: false; reason: "too_small" | "too_large" } {
  const usd = Number(raw) / 10 ** USDG_TOPUP_DECIMALS;
  if (usd < MIN_USDG_TOPUP) return { ok: false, reason: "too_small" };
  if (usd > MAX_USDG_TOPUP) return { ok: false, reason: "too_large" };
  return { ok: true, creditsMicro: Number(raw) };
}
