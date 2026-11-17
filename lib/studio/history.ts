/**
 * How much price history a Studio market needs, and why a new one can't be picked yet. A newly
 * listed token (an IPO like $ANT) has only hours of prices: DCA can start from its first priced hour,
 * rule strategies need a full backtest window plus their lookback. Pure, so it is unit tested.
 */

/** The Studio replays the last 30 days. */
export const BACKTEST_HOURS = 30 * 24;

/** Hours of prices a market needs before the Studio lets this strategy use it. */
export function hoursNeeded(dca: boolean, lookback: number): number {
  return dca ? 1 : BACKTEST_HOURS + lookback;
}

/** "36 hours" under three days, "5 days" from there on. */
export function hoursText(hours: number): string {
  if (hours < 72) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.floor(hours / 24)} days`;
}

/** Why a market with `has` hours of prices can't be used yet. */
export function tooNewReason(symbol: string, has: number, need: number, strategyLabel: string): string {
  if (has === 0) return `${symbol} has no price yet.`;
  return `${symbol} has ${hoursText(has)} of prices. ${strategyLabel} needs ${hoursText(need)} (a 30 day backtest plus its rule's history). DCA can use it now.`;
}
