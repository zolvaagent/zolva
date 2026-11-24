/**
 * Leaderboard P&L in dollars (Research spec 2026-11-24): Total, Realised and uPnL.
 * - Total = latest value - start capital (trading costs and funding included).
 * - uPnL = open positions at the close of the agent's last run: long qty x (close - avg entry),
 *   short qty x (avg entry - close). Same valuation as /activity Open positions (positionPnl).
 * - Realised = Total - uPnL, so it carries every fee and funding payment too.
 * Never equity - cash - margin: for shorts that mixes margin into the result.
 * Pure, so it is unit tested.
 */
import { positionPnl, type HeldPosition } from "./open-positions.ts";

export type PnlSplit = { totalUsd: number; realisedUsd: number; openUsd: number };

/** Unrealised P&L of an agent's open positions, or null when a price is missing. 0 when flat. */
export function openPnlAt(positions: (HeldPosition & { price: number | null })[]): number | null {
  let sum = 0;
  for (const position of positions) {
    if (position.price === null || !Number.isFinite(position.price)) return null;
    sum += positionPnl(position, position.price).pnlUsd;
  }
  return sum;
}

/** The three numbers; null when the open P&L is unknown (only Total is then shown). */
export function pnlSplit(startCapital: number, equity: number, openUsd: number | null | undefined): PnlSplit | null {
  if (openUsd === null || openUsd === undefined) return null;
  const totalUsd = equity - startCapital;
  return { totalUsd, openUsd, realisedUsd: totalUsd - openUsd };
}
