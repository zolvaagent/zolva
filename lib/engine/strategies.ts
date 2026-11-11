/**
 * Strategy rules. Each is a pure function of the recent closes: same input,
 * same decision, whether live or in a backtest.
 *
 * Thresholds were tuned on 30 days of real data (2026-10-15, see
 * docs/mvp-plan.md section 4). Faster settings (24h average, 1% entry) traded
 * 100+ times a month and lost to the 0.5% cost per trade.
 */

/**
 * dip_hunter uses the mean reversion signal on every market but holds one position at a
 * time: the engine lets it buy only the deepest dip, and only while it holds nothing
 * (see runHour). Research: docs/down-market-research.md.
 *
 * spike_fade is mean reversion turned upside down: it shorts the market furthest above its
 * average, one position at a time, and covers when the price falls back. Paper only.
 * Research: docs/shorting-research.md.
 *
 * dip_fade goes long and short: one long slot (the deepest dip) and one short slot (the
 * highest spike) at the same time, with a 7 day trend filter: no short while a market is up
 * more than 5% over 7 days, no long while it is down more than 5%. Perps only, paper only.
 * Research: docs/perps-research.md, "Long and short in one agent".
 */
export type StrategyKey = "momentum" | "mean_reversion" | "dip_hunter" | "spike_fade" | "dip_fade";

export type Signal = {
  /** short opens a short position, cover closes it (spike_fade and dip_fade only). */
  action: "buy" | "sell" | "short" | "cover" | "hold";
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

export const SPIKE_FADE = {
  /** Short when the z score versus the 48h average is above this. */
  entryZ: 2.5,
  /** Cover once the z score is back to at most this. */
  exitZ: -0.5,
} as const;

export const DIP_FADE = {
  /** Hours the trend filter looks back (7 days); also dip_fade's history before its first decision. */
  trendHours: 168,
  /** No short while up more than this over trendHours, no long while down more than this. */
  trendLimit: 0.05,
} as const;

export const STRATEGY_LABELS: Record<StrategyKey, string> = {
  momentum: "Momentum",
  mean_reversion: "Mean reversion",
  dip_hunter: "Dip hunter",
  spike_fade: "Spike fade",
  dip_fade: "Dip + fade",
};

/** Hours of history a preset needs before its first decision. */
export function presetLookback(strategy: StrategyKey): number {
  return strategy === "dip_fade" ? DIP_FADE.trendHours : LOOKBACK_HOURS;
}

/**
 * @param window       closes, oldest first, ending with the current hour; at least LOOKBACK_HOURS + 1 long, no nulls
 * @param hasPosition  whether the agent holds this token now (for spike_fade: is short it)
 * @param side         dip_fade only: the side of the position held in this token
 */
export function decide(strategy: StrategyKey, window: number[], hasPosition: boolean, side?: "long" | "short"): Signal {
  if (strategy === "momentum") return momentum(window, hasPosition);
  if (strategy === "spike_fade") return spikeFade(window, hasPosition);
  if (strategy === "dip_fade") return dipFade(window, hasPosition ? (side ?? "long") : null);
  return meanReversion(window, hasPosition);
}

/**
 * Dip + fade on one market: the mean reversion signal for a long, the spike fade signal for a
 * short, each blocked when the 7 day trend runs against it. The window must hold at least
 * DIP_FADE.trendHours + 1 closes.
 */
function dipFade(window: number[], held: "long" | "short" | null): Signal {
  const price = window[window.length - 1];
  const trend = price / window[window.length - 1 - DIP_FADE.trendHours] - 1;
  if (held === "long") {
    const signal = meanReversion(window, true);
    return { ...signal, indicators: { ...signal.indicators, trend7d: trend } };
  }
  if (held === "short") {
    const signal = spikeFade(window, true);
    return { ...signal, indicators: { ...signal.indicators, trend7d: trend } };
  }
  const dip = meanReversion(window, false);
  const spike = spikeFade(window, false);
  const indicators = { ...dip.indicators, trend7d: trend };
  const week = formatPercent(trend);
  if (dip.action === "buy") {
    return trend >= -DIP_FADE.trendLimit
      ? { ...dip, indicators }
      : { action: "hold", indicators, reasoning: `${dip.reasoning.replace(" Buying the dip.", "")} But it is ${week} over 7 days: no long against the trend.` };
  }
  if (spike.action === "short") {
    return trend <= DIP_FADE.trendLimit
      ? { ...spike, indicators }
      : { action: "hold", indicators, reasoning: `${spike.reasoning.replace(" Shorting the spike.", "")} But it is ${week} over 7 days: no short against the trend.` };
  }
  return { action: "hold", indicators, reasoning: `Price is within the normal range (z ${dip.indicators.zScore.toFixed(2)}). Waiting for a dip or a spike.` };
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

function spikeFade(window: number[], isShort: boolean): Signal {
  const price = window[window.length - 1];
  const recent = window.slice(-LOOKBACK_HOURS);
  const average = mean(recent);
  const deviation = standardDeviation(recent, average);
  const zScore = deviation > 0 ? (price - average) / deviation : 0;
  const indicators = { average48h: average, zScore };
  const z = zScore.toFixed(2);

  if (!isShort && zScore > SPIKE_FADE.entryZ) {
    return { action: "short", indicators, reasoning: `Price is unusually far above its 48h average (z ${z}). Shorting the spike.` };
  }
  if (isShort && zScore <= SPIKE_FADE.exitZ) {
    return { action: "cover", indicators, reasoning: `Price is back below its 48h average (z ${z}). Covering the short.` };
  }
  return {
    action: "hold",
    indicators,
    reasoning: isShort ? `Still above the level to cover (z ${z}). Staying short.` : `Price is within the normal range (z ${z}). Waiting for a spike.`,
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
