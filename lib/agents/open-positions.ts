/**
 * Open positions across agents (/activity "Open positions"): what one position is worth at a price and
 * its unrealised P&L. The same basis as the ledger (lib/agents/ledger.ts): a long's basis is quantity x
 * average entry (which includes trading costs), a short's is its margin when it has one, otherwise
 * quantity x entry, and a short is valued with the engine's shortValue. Pure, so it is unit tested.
 */
import { longValue, shortValue, type Position } from "../engine/engine.ts";

export type HeldPosition = { quantity: number; entryPrice: number; side: "long" | "short"; margin: number | null };

export function positionPnl(position: HeldPosition, price: number): { valueUsd: number; basisUsd: number; pnlUsd: number; pnlPct: number } {
  const valueUsd =
    position.side === "short"
      ? shortValue({ quantity: position.quantity, entryPrice: position.entryPrice, side: "short", ...(position.margin !== null ? { margin: position.margin } : {}) } satisfies Position, price)
      : longValue({ quantity: position.quantity, entryPrice: position.entryPrice, ...(position.margin !== null ? { margin: position.margin } : {}) }, price);
  // A margined position (leveraged short, Lab portfolio sleeve) is measured on the margin it locked.
  const basisUsd = position.margin !== null ? position.margin : position.quantity * position.entryPrice;
  const pnlUsd = valueUsd - basisUsd;
  return { valueUsd, basisUsd, pnlUsd, pnlPct: basisUsd > 0 ? (pnlUsd / basisUsd) * 100 : 0 };
}
