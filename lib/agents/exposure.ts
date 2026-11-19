/**
 * How much of the time an agent held a position, from its hourly runs: an hour counts as invested when
 * the agent's value differs from its cash, i.e. a position (long or short) was open at the end of the
 * hour. Sitting in cash is a choice too, and this shows how often the agent made it.
 */

/** Value and cash this close are rounding, not a position (fees and float dust). */
const DUST_SHARE = 0.001;

export type Exposure = { hours: number; investedHours: number; investedPct: number };

export function exposure(runs: readonly { equity: number; cash: number }[]): Exposure | null {
  if (!runs.length) return null;
  const investedHours = runs.filter((run) => Math.abs(run.equity - run.cash) > Math.max(0.01, Math.abs(run.equity) * DUST_SHARE)).length;
  return { hours: runs.length, investedHours, investedPct: (investedHours / runs.length) * 100 };
}
