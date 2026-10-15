/**
 * Strategy rules. Each is a pure function of the recent closes: same input,
 * same decision, whether live or in a backtest.
 *
 * Thresholds were tuned on 30 days of real data (2026-10-15, see
 * docs/mvp-plan.md section 4). Faster settings (24h average, 1% entry) traded
 * 100+ times a month and lost to the 0.5% cost per trade.
 */

export type StrategyKey = "momentum" | "mean_reversion";

export type Signal = {
  action: "buy" | "sell" | "hold";
  reasoning: string;
  indicators: Record<string, number>;
};

/** Hours of history every strategy needs before its first decision. */
export const LOOKBACK_HOURS = 48;

export const MOMENTUM = {
  /** Buy when up more than this over 24h (and above the 48h average). */
  entryChange24h: 0.03,
  /** Sell when the price falls this far below the 48h average. */
  exitBelowAverage: 0.03,
} as const;

export const MEAN_REVERSION = {
  /** Buy when the z score versus the 48h average is below this. */
  entryZ: -2.5,
  /** Sell once the z score is back to at least this. */
  exitZ: 0.5,
} as const;

export const STRATEGY_LABELS: Record<StrategyKey, string> = {
  momentum: "Momentum",
  mean_reversion: "Mean reversion",
};

/**
 * @param window       closes, oldest first, ending with the current hour; at least LOOKBACK_HOURS + 1 long, no nulls
 * @param hasPosition  whether the agent holds this token now
 */
export function decide(strategy: StrategyKey, window: number[], hasPosition: boolean): Signal {
  return strategy === "momentum" ? momentum(window, hasPosition) : meanReversion(window, hasPosition);
}

function momentum(window: number[], hasPosition: boolean): Signal {
  const price = window[window.length - 1];
  const average = mean(window.slice(-LOOKBACK_HOURS));
  const change24h = price / window[window.length - 25] - 1;
  const indicators = { average48h: average, change24h };
  const pct = formatPercent(change24h);
  const gap = formatPercent(price / average - 1);

  if (!hasPosition && price > average && change24h > MOMENTUM.entryChange24h) {
    return { action: "buy", indicators, reasoning: `Up ${pct} in 24h and ${gap} above the 48h average. Strong trend, buying.` };
  }
  if (hasPosition && price < average * (1 - MOMENTUM.exitBelowAverage)) {
    return { action: "sell", indicators, reasoning: `Dropped to ${gap} versus the 48h average. Trend is broken, selling.` };
  }
  return {
    action: "hold",
    indicators,
    reasoning: hasPosition ? `Trend intact (${gap} versus the 48h average). Holding.` : `No strong trend (${pct} in 24h). Waiting.`,
  };
}

function meanReversion(window: number[], hasPosition: boolean): Signal {
  const price = window[window.length - 1];
  const recent = window.slice(-LOOKBACK_HOURS);
  const average = mean(recent);
  const deviation = standardDeviation(recent, average);
  const zScore = deviation > 0 ? (price - average) / deviation : 0;
  const indicators = { average48h: average, zScore };
  const z = zScore.toFixed(2);

  if (!hasPosition && zScore < MEAN_REVERSION.entryZ) {
    return { action: "buy", indicators, reasoning: `Price is unusually far below its 48h average (z ${z}). Buying the dip.` };
  }
  if (hasPosition && zScore >= MEAN_REVERSION.exitZ) {
    return { action: "sell", indicators, reasoning: `Price is back above its 48h average (z ${z}). Taking the rebound.` };
  }
  return {
    action: "hold",
    indicators,
    reasoning: hasPosition ? `Still below the 48h average (z ${z}). Waiting for the rebound.` : `Price is within the normal range (z ${z}). Waiting for a dip.`,
  };
}

export function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], average: number): number {
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

export function formatPercent(fraction: number): string {
  return `${fraction >= 0 ? "+" : ""}${(fraction * 100).toFixed(1)}%`;
}
