/**
 * A brand new listing has no hourly close yet: its page says when the first one lands instead of a 404.
 * The hourly tick stores the hour that just ended a few minutes past the hour (custom-worker.ts, minute 5).
 */

const HOUR_MS = 3_600_000;
/** Minutes past the hour the tick has normally stored the close by. */
const TICK_MINUTE = 10;

/**
 * When the first hourly close is expected (ms): the end of the first full hour at or after the token's
 * history start, plus the tick's delay. If that time has passed without a close, the next tick.
 */
export function firstCloseAt(historyStartMs: number | null, nowMs: number): number {
  const startHour = Math.ceil((historyStartMs ?? nowMs) / HOUR_MS) * HOUR_MS;
  const expected = startHour + HOUR_MS + TICK_MINUTE * 60_000;
  if (expected > nowMs) return expected;
  // Overdue (a missed tick): the next tick after now.
  return Math.floor(nowMs / HOUR_MS) * HOUR_MS + HOUR_MS + TICK_MINUTE * 60_000;
}
