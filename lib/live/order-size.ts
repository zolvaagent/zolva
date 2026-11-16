/**
 * How much a live order moves (lib/live/runner.ts). Pure, so it is unit tested.
 *
 * - A full exit (signal, stop loss, take profit, max hold, manual) sells everything the agent holds.
 * - A daily resize (volatility sizing) sells only the part the engine asked for.
 * Either way never more than the wallet holds; the caller caps it at the on-chain balance.
 */

/** Live orders under this many dollars are skipped (gas and slippage would be a large share), except full exits. */
export const MIN_LIVE_ORDER_USD = 5;

/** Tokens to sell: the fill's own quantity for a resize, the whole holding otherwise. */
export function liveSellQuantity(fill: { quantity: number; reason: string }, held: number | null): number {
  if (fill.reason === "resize") return held === null ? fill.quantity : Math.min(fill.quantity, held);
  return held ?? fill.quantity;
}

/**
 * Why a live order is too small to send, or null. A full exit always goes out, however small, so a
 * stop loss or an exit rule is never held back.
 */
export function tooSmallReason(order: { side: "buy" | "sell"; reason: string; usd: number }): string | null {
  const fullExit = order.side === "sell" && order.reason !== "resize";
  if (fullExit || order.usd >= MIN_LIVE_ORDER_USD) return null;
  return `order of $${order.usd.toFixed(2)} is under the $${MIN_LIVE_ORDER_USD} live minimum`;
}
