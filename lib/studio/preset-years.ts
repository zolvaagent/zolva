/**
 * Research's year by year backtests for the Studio's starting points and strategy cards (2026-11-16,
 * scripts/research-preset-years.mts, notes: grok-research-items.md). Spot cost (0.5% a fill), Studio
 * defaults (33% per market, 8% stop). Crypto: Binance hourly 2021 to 2026 (2026 to mid November). Stocks:
 * the last 730 days of hourly history only (2024 partial to 2026), the free hourly limit.
 * Fixed numbers: only Research updates them, after a new run.
 */

export type YearRow = { year: string; pct: number };
export type YearTable = { years: YearRow[]; hold: YearRow[]; worstDropPct: number; note: string };

const rows = (years: string[], values: number[]): YearRow[] => years.map((year, i) => ({ year, pct: values[i] }));
const CRYPTO_YEARS = ["2021", "2022", "2023", "2024", "2025", "2026"];
const STOCK_YEARS = ["2024", "2025", "2026"];

/** By starting point id (lib/studio/presets.ts). */
export const PRESET_YEARS: Record<string, YearTable> = {
  "crypto-trend": {
    years: rows(CRYPTO_YEARS, [9, -56, 23, 5, -33, -1]),
    hold: rows(CRYPTO_YEARS, [230, -66, 123, 83, -9, -30]),
    worstDropPct: 79,
    note: "BTC and ETH, 2021 to 2026",
  },
  "index-dca": {
    years: rows(STOCK_YEARS, [10, 12, 1]),
    hold: rows(STOCK_YEARS, [24, 18, 10]),
    worstDropPct: 9,
    note: "SPY and QQQ, 52 weekly buys a year, 2024 (partial) to 2026",
  },
  "tech-dca": {
    years: rows(STOCK_YEARS, [24, 28, -8]),
    hold: rows(STOCK_YEARS, [91, 39, -6]),
    worstDropPct: 20,
    note: "GOOGL, META and NVDA, 52 weekly buys a year, 2024 (partial) to 2026",
  },
};

/** One line per strategy card: BTC and ETH together, 2021 to 2026 (Research's crypto table). */
export const STRATEGY_YEARS_LINE: Record<string, string> = {
  momentum: "BTC and ETH backtest 2021–26: up in 3 of 6 years, worst drop 79%.",
  mean_reversion: "BTC and ETH backtest 2021–26: down in all 6 years.",
  dip_hunter: "BTC and ETH backtest 2021–26: down in all 6 years.",
  dca: "BTC and ETH backtest 2021–26: up in 3 of 6 years, worst drop 40%.",
};

/** Shown under the starting points. */
export const YEARS_DISCLAIMER = "Backtest at 0.5% a trade. Past years are not a promise; most simple rules lose to holding over time.";
