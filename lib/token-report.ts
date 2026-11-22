/**
 * The public ZOLVA report (/token/report): what was burnt, what the swap fee has collected for the next
 * buyback, and how AI credits were granted and spent. This file is the pure part (classifying burns and
 * adding up ledger rows), shared by the server loader (lib/data/token-report.ts) and its tests.
 */

/** The launch transaction that burnt the dev share (also in the dev log, 2026-11-10). */
export const LAUNCH_BURN_TX = "0xda25f6ffb93f7b03c813b266e12f67d96a83f035a7c75db739b584d7f59d544c";

export type BurnKind = "launch" | "swap_fee" | "ai_credits" | "buyback";

export const BURN_LABELS: Record<BurnKind, string> = {
  launch: "Dev share at launch",
  swap_fee: "Swap fee on ZOLVA buys",
  ai_credits: "AI credits paid in ZOLVA",
  buyback: "Buybacks and other burns",
};

export type Burn = { txHash: string; from: string; amount: number; blockNumber: number; ts: number | null; kind: BurnKind };

/**
 * What a transfer of ZOLVA to the dead address was, from its transaction and sender:
 * - the launch transaction: the dev share
 * - sent by the swap router: the 0.25% fee on a ZOLVA buy, burnt in the swap
 * - a recorded ZOLVA credit top-up (zolva_topups): AI credits paid in ZOLVA
 * - anything else: buybacks (and any burn someone sends by hand)
 */
export function classifyBurn(txHash: string, from: string, options: { router: string; creditTxs: ReadonlySet<string> }): BurnKind {
  const tx = txHash.toLowerCase();
  if (tx === LAUNCH_BURN_TX) return "launch";
  if (from.toLowerCase() === options.router.toLowerCase()) return "swap_fee";
  if (options.creditTxs.has(tx)) return "ai_credits";
  return "buyback";
}

/** Totals per kind, in the order the page lists them. */
export function burnTotals(burns: Burn[]): { kind: BurnKind; amount: number; count: number }[] {
  return (Object.keys(BURN_LABELS) as BurnKind[]).map((kind) => {
    const own = burns.filter((burn) => burn.kind === kind);
    return { kind, amount: own.reduce((sum, burn) => sum + burn.amount, 0), count: own.length };
  });
}

/** One ai_ledger row (micro dollars: 1,000,000 = $1). */
export type LedgerRow = { bucket: "free" | "paid"; kind: string; delta_micro: number };

export type CreditTotals = {
  /** Free credits given to new accounts (welcome) and by hand. */
  freeGrantedUsd: number;
  /** Paid credits added: USDG and ZOLVA top-ups, and paid credits granted by hand. */
  paidAddedUsd: number;
  /** Spent on co-pilot reviews and strategy writing, from free and paid credits. */
  spentUsd: number;
};

/** Grants, top-ups and spending from the credit ledger, never per user. */
export function creditTotals(rows: LedgerRow[]): CreditTotals {
  let freeGrantedUsd = 0;
  let paidAddedUsd = 0;
  let spentUsd = 0;
  for (const row of rows) {
    const usd = Number(row.delta_micro) / 1_000_000;
    if (usd < 0) spentUsd -= usd;
    else if (row.bucket === "free") freeGrantedUsd += usd;
    else paidAddedUsd += usd;
  }
  return { freeGrantedUsd, paidAddedUsd, spentUsd };
}

/**
 * A Uniswap v4 position in ZOLVA's main pool whose position NFT was sent to the dead address: no one
 * can remove that liquidity again. Amounts are what the position holds at the pool's current price.
 */
export type LockedPosition = { tokenId: string; txHash: string; blockNumber: number; ts: number | null; eth: number; zolva: number; fullRange: boolean };

/** The ticks packed into a v4 PositionInfo word: tickLower in bits 8-31, tickUpper in bits 32-55. */
export function positionTicks(info: bigint): { tickLower: number; tickUpper: number } {
  return {
    tickLower: Number(BigInt.asIntN(24, (info >> 8n) & 0xffffffn)),
    tickUpper: Number(BigInt.asIntN(24, (info >> 32n) & 0xffffffn)),
  };
}

/**
 * Raw token amounts held by `liquidity` between two ticks at the pool's price (Uniswap's liquidity
 * math in floating point, which is plenty for a report). Below the range it is all token0, above it
 * all token1.
 */
export function positionAmounts(liquidity: bigint, sqrtPriceX96: bigint, tickLower: number, tickUpper: number): { amount0: number; amount1: number } {
  const L = Number(liquidity);
  const price = Number(sqrtPriceX96) / 2 ** 96;
  const lower = Math.sqrt(1.0001 ** tickLower);
  const upper = Math.sqrt(1.0001 ** tickUpper);
  if (price <= lower) return { amount0: L * (1 / lower - 1 / upper), amount1: 0 };
  if (price >= upper) return { amount0: 0, amount1: L * (upper - lower) };
  return { amount0: L * (1 / price - 1 / upper), amount1: L * (price - lower) };
}
