/**
 * Starting points for the Studio (2026-11-11). A first time visitor used to land on one market
 * and Momentum with an empty name; now they can start from one of three fixed themes, each
 * shown with its real 30 day backtest, and the Studio opens on the best of the three.
 *
 * The themes are fixed on purpose (not mined from every market and strategy), so the opening
 * result is a fair starting point rather than the luckiest combination of the month.
 */
import { buyAndHold, simulate } from "../engine/engine";
import { LOOKBACK_HOURS } from "../engine/strategies";
import type { Market } from "../data/market";

export const BACKTEST_HOURS = 30 * 24;
export const PRESET_MAX_POSITION_PCT = 33;
export const PRESET_STOP_LOSS_PCT = 8;
const PRESET_CAPITAL = 10_000;

export type PresetStrategy = "momentum" | "mean_reversion";

export type StudioPreset = {
  id: string;
  title: string;
  text: string;
  strategy: PresetStrategy;
  symbols: string[];
};

export const STUDIO_PRESETS: StudioPreset[] = [
  { id: "tech-dips", title: "Big tech dips", text: "Buys unusual dips in GOOGL, META and NVDA, sells the rebound.", strategy: "mean_reversion", symbols: ["GOOGL", "META", "NVDA"] },
  { id: "crypto-trend", title: "Crypto trend", text: "Rides BTC and ETH after a strong day, exits when the trend breaks.", strategy: "momentum", symbols: ["BTC", "ETH"] },
  { id: "index-steady", title: "Index rebounds", text: "Buys dips in SPY and QQQ, the broad market, and sells the recovery.", strategy: "mean_reversion", symbols: ["SPY", "QQQ"] },
];

export type ScoredPreset = StudioPreset & { returnPct: number; holdPct: number };

/** Whether a market has enough history for a 30 day backtest (the Studio's own rule). */
export function canBacktest(market: Market, symbol: string, lookback = LOOKBACK_HOURS): boolean {
  const token = market.tokens.find((item) => item.symbol === symbol);
  if (!token || token.firstIndex === null) return false;
  return market.hours - token.firstIndex >= BACKTEST_HOURS + lookback;
}

/** Each preset with its last 30 days, at the preset's default limits. Presets whose markets cannot be backtested are left out. */
export function scorePresets(market: Market): ScoredPreset[] {
  const fromIndex = market.hours - BACKTEST_HOURS;
  if (fromIndex < 0 || !market.tokens.length) return [];
  const times = market.tokens[0].closes.map((_, i) => market.startTs + i * 3600);
  return STUDIO_PRESETS.filter((preset) => preset.symbols.every((symbol) => canBacktest(market, symbol))).map((preset) => {
    const series = Object.fromEntries(preset.symbols.map((symbol) => [symbol, market.tokens.find((token) => token.symbol === symbol)!.closes]));
    const result = simulate({
      series,
      params: { strategy: preset.strategy, maxPositionPct: PRESET_MAX_POSITION_PCT, stopLossPct: PRESET_STOP_LOSS_PCT },
      capital: PRESET_CAPITAL,
      fromIndex,
      times,
    });
    const hold = buyAndHold(series, PRESET_CAPITAL, fromIndex);
    return { ...preset, returnPct: result.returnPct, holdPct: hold.returnPct };
  });
}

/** The preset the Studio opens on: the best 30 day return of the three, or null if none can run. */
export function openingPreset(scored: ScoredPreset[]): ScoredPreset | null {
  return scored.reduce<ScoredPreset | null>((best, preset) => (!best || preset.returnPct > best.returnPct ? preset : best), null);
}

const STRATEGY_LABELS: Record<string, string> = { momentum: "Momentum", mean_reversion: "Mean reversion", custom: "Custom" };

/** A ready name for a new agent, such as "GOOGL META NVDA Mean reversion" (at most 40 characters, the form's limit). */
export function suggestedName(strategy: string, symbols: string[]): string {
  const label = STRATEGY_LABELS[strategy] ?? "Agent";
  const full = symbols.length ? `${symbols.join(" ")} ${label}` : label;
  return full.length <= 40 ? full : `${symbols.slice(0, 2).join(" ")} ${label}`.slice(0, 40);
}
