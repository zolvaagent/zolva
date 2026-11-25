/**
 * Wallet Guardian: one guard (a stop loss and an optional take profit on a token the user holds in
 * their own wallet), checked on one hourly close. The decision is the engine's: the holding is
 * mirrored as a position and run through runHour, the one decision function for these markets
 * (CLAUDE.md), with rules that never buy and every token vetoed as a second lock. Only the engine's
 * stop loss and take profit can fire. Pure, so it is unit tested; lib/guardian/runner.ts does the
 * reading and writing.
 */
import { runHour, type AgentParams } from "../engine/engine.ts";
import type { RuleGroup } from "../engine/rules.ts";

export const STOP_LOSS_MIN = 1;
export const STOP_LOSS_MAX = 90;
export const TAKE_PROFIT_MAX = 1000;

export type Guard = {
  /** Balance held, in tokens. */
  quantity: number;
  /** USD price the stop and take profit are measured from. */
  basisPrice: number;
  stopLossPct: number;
  takeProfitPct: number | null;
};

export type GuardResult = { kind: "stop_loss" | "take_profit"; reasoning: string } | null;

// An "any" group with no conditions is never met: no buy signal, no rule exit.
const NEVER: RuleGroup = { join: "any", conditions: [] };

/** Engine settings for a guard: custom rules that never trade on signals, plus its stop and take profit. */
export function guardParams(guard: Pick<Guard, "stopLossPct" | "takeProfitPct">): AgentParams {
  return {
    strategy: "custom",
    rules: { entry: NEVER, exit: NEVER, takeProfitPct: guard.takeProfitPct, maxHoldHours: null },
    maxPositionPct: 100,
    stopLossPct: guard.stopLossPct,
    venue: "dex",
  };
}

/**
 * Whether the guard fires on this hour's close. `previousClose` is the hour before (the rules need
 * two closes to look at; it does not change the outcome). Null when it holds.
 */
export function checkGuard(guard: Guard, previousClose: number, close: number, hourTime: number): GuardResult {
  if (!(guard.quantity > 0) || !(close > 0) || !(previousClose > 0)) return null;
  const token = "held";
  const result = runHour(
    { cash: 0, positions: { [token]: { quantity: guard.quantity, entryPrice: guard.basisPrice } } },
    guardParams(guard),
    // The engine wants a short history before it decides (rulesLookback: 2 hours before this one);
    // repeating the previous close is enough, as no rule reads it.
    { [token]: [previousClose, previousClose, close] },
    2,
    hourTime,
    // Second lock: even if a signal ever said buy, the veto turns it into a hold.
    { veto: new Map([[token, "Wallet Guardian only watches; it never buys."]]) },
  );
  const fill = result.fills.find((candidate) => candidate.token === token && candidate.side === "sell");
  if (!fill) return null;
  const decision = result.decisions.find((candidate) => candidate.token === token && candidate.action === "sell");
  if (fill.reason !== "stop_loss" && fill.reason !== "take_profit") return null;
  return { kind: fill.reason, reasoning: decision?.reasoning ?? "" };
}

/** The price at which each limit fires, for showing on the page. */
export function guardLevels(guard: Pick<Guard, "basisPrice" | "stopLossPct" | "takeProfitPct">): { stopPrice: number; takeProfitPrice: number | null } {
  return {
    stopPrice: guard.basisPrice * (1 - guard.stopLossPct / 100),
    takeProfitPrice: guard.takeProfitPct === null ? null : guard.basisPrice * (1 + guard.takeProfitPct / 100),
  };
}

/** Validates a guard's settings from a form or API body. */
export function parseGuardSettings(input: { stopLossPct?: unknown; takeProfitPct?: unknown; basisPrice?: unknown }):
  | { ok: true; stopLossPct: number; takeProfitPct: number | null; basisPrice: number | null }
  | { ok: false; error: string } {
  const stop = Number(input.stopLossPct);
  if (!Number.isFinite(stop) || stop < STOP_LOSS_MIN || stop > STOP_LOSS_MAX) return { ok: false, error: `Set a stop loss between ${STOP_LOSS_MIN}% and ${STOP_LOSS_MAX}%.` };
  const rawTake = input.takeProfitPct;
  const take = rawTake === null || rawTake === undefined || rawTake === "" ? null : Number(rawTake);
  if (take !== null && (!Number.isFinite(take) || take <= 0 || take > TAKE_PROFIT_MAX)) return { ok: false, error: `Take profit must be above 0% and at most ${TAKE_PROFIT_MAX}%, or empty.` };
  const rawBasis = input.basisPrice;
  const basis = rawBasis === null || rawBasis === undefined || rawBasis === "" ? null : Number(rawBasis);
  if (basis !== null && (!Number.isFinite(basis) || basis <= 0)) return { ok: false, error: "The price you measure from must be above 0." };
  return { ok: true, stopLossPct: stop, takeProfitPct: take, basisPrice: basis };
}
