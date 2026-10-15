/**
 * Per-stock numbers for the Markets pages, computed from the same cleaned
 * hourly closes the agents trade on. Pure, so it is unit tested and can run
 * on the server or the client.
 */

export type MarketStats = {
  price: number;
  /** Percent change over the last 1, 24 and 168 hours; null when there is not enough history. */
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  high7d: number;
  low7d: number;
  /** Typical size of a one hour move over the last 7 days (standard deviation, percent). */
  hourlyMovePct: number | null;
  /** The last 7 days of closes, oldest first, for sparklines. */
  week: number[];
};

const WEEK = 168;
const MONTH = 720;

/** Percent change from `hours` ago to the last close, or null without a price that far back. */
export function changeOver(closes: (number | null)[], hours: number): number | null {
  const last = closes.at(-1);
  const then = closes.at(-1 - hours);
  if (last == null || then == null || then <= 0) return null;
  return (last / then - 1) * 100;
}

/** Stats for one token, or null when it has no price yet. */
export function marketStats(closes: (number | null)[]): MarketStats | null {
  const price = closes.at(-1);
  if (price == null) return null;

  const week = closes.slice(-WEEK - 1).filter((close): close is number => close !== null);
  const moves: number[] = [];
  for (let i = 1; i < week.length; i++) moves.push((week[i] / week[i - 1] - 1) * 100);
  const mean = moves.reduce((sum, move) => sum + move, 0) / (moves.length || 1);
  const variance = moves.reduce((sum, move) => sum + (move - mean) ** 2, 0) / (moves.length || 1);

  return {
    price,
    change1h: changeOver(closes, 1),
    change24h: changeOver(closes, 24),
    change7d: changeOver(closes, WEEK),
    change30d: changeOver(closes, MONTH),
    high7d: Math.max(...week),
    low7d: Math.min(...week),
    hourlyMovePct: moves.length >= 24 ? Math.sqrt(variance) : null,
    week,
  };
}
