/**
 * Turns stored hourly candles into the clean, gap-free close series the
 * strategies run on. Used identically by the live tick and by backtests, so
 * both see the same prices.
 *
 * Two problems in the raw data (session 1.2 findings):
 * - Missing hours: GeckoTerminal has no candle for an hour without trades
 *   (RDDT misses 28% of its hours). The last accepted close is carried forward.
 * - Bad prints: thin pools produce spikes (GLD once printed $1,962 while
 *   trading around $380). A close more than 15% away from the median of the
 *   previous 24 accepted closes is treated as missing, unless the move holds
 *   for 3 hours in a row, in which case it is a real move and accepted.
 *
 * The filter only looks backwards, so a live agent and a backtest make the
 * same call on the same hour.
 */

export const HOUR_SECONDS = 3600;
export const OUTLIER_THRESHOLD = 0.15;
export const OUTLIER_WINDOW = 24;
/** Too little history to judge an outlier: accept the price. */
export const OUTLIER_MIN_WINDOW = 6;
/** A jump that persists this many hours in a row is a real move. */
export const OUTLIER_CONFIRM_HOURS = 3;

export type CloseCandle = {
  /** Start of the hour, unix seconds. */
  time: number;
  close: number;
};

export type CloseSeries = {
  /** Hour start times, unix seconds, one per hour without gaps. */
  times: number[];
  /** Close per hour; null before the token's first accepted price. */
  closes: (number | null)[];
  /** Hours whose raw close was rejected as an outlier. */
  rejected: number[];
  /** Hours with no candle at all, filled from the previous close. */
  filled: number[];
};

/**
 * @param candles   raw candles of one token, any order
 * @param fromTime  first hour of the series (inclusive, unix seconds)
 * @param toTime    last hour of the series (inclusive, unix seconds)
 */
export function buildCloseSeries(candles: CloseCandle[], fromTime: number, toTime: number): CloseSeries {
  const byTime = new Map(candles.map((candle) => [candle.time, candle.close]));
  const series: CloseSeries = { times: [], closes: [], rejected: [], filled: [] };
  const accepted: number[] = []; // recent accepted raw closes, for the median
  let last: number | null = null;
  let pending: number[] = []; // raw closes of the current run of rejected hours

  // Warm the median with candles before the window, so the first hours of a
  // backtest are filtered as strictly as later ones.
  for (const candle of candles.filter((item) => item.time < fromTime).sort((a, b) => a.time - b.time).slice(-OUTLIER_WINDOW)) {
    accepted.push(candle.close);
    last = candle.close;
  }

  for (let time = fromTime; time <= toTime; time += HOUR_SECONDS) {
    series.times.push(time);
    const raw = byTime.get(time);

    if (raw === undefined) {
      if (last !== null) series.filled.push(time);
      series.closes.push(last);
      continue;
    }

    if (isOutlier(raw, accepted)) {
      if (pending.length + 1 < OUTLIER_CONFIRM_HOURS) {
        pending.push(raw);
        series.rejected.push(time);
        series.closes.push(last);
        continue;
      }
      // The jump held: it is the new price level. Restart the median from the
      // confirmed hours, or the old level would keep rejecting the new one.
      accepted.splice(0, accepted.length, ...pending);
    }

    pending = [];
    accepted.push(raw);
    if (accepted.length > OUTLIER_WINDOW) accepted.shift();
    last = raw;
    series.closes.push(raw);
  }
  return series;
}

function isOutlier(price: number, recent: number[]): boolean {
  if (recent.length < OUTLIER_MIN_WINDOW) return false;
  const reference = median(recent);
  return Math.abs(price / reference - 1) > OUTLIER_THRESHOLD;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
