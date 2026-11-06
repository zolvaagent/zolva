/**
 * The work behind the paid endpoints, pure so it is unit tested: a screener of every market
 * at the latest hour (/scan) and a backtest of a strategy on the last days (/backtest).
 * Both read the same cleaned hourly closes the agents trade on (lib/data/market.ts) and the
 * same engine (lib/engine), so a backtest here matches the Studio's for the same settings.
 */
import { buyAndHold, simulate, type AgentParams } from "../engine/engine";
import { indicatorValue, parseRules, rulesLookback, type Rules } from "../engine/rules";
import { mean } from "../engine/strategies";
import { changeOver } from "../markets";

/** Only what these functions read of lib/data/market.ts's Market, so tests can build one. */
export type MarketData = {
  startTs: number;
  hours: number;
  tokens: { address: string; symbol: string; name: string; assetClass: string; closes: (number | null)[] }[];
};

const round = (value: number, digits: number) => Number(value.toFixed(digits));
const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

/** Hours of history a market needs before it is scanned (the 48 hour z-score). */
const SCAN_MIN_HOURS = 49;

export type ScanRow = {
  symbol: string;
  name: string;
  address: string;
  assetClass: string;
  price: number;
  change1hPct: number | null;
  change24hPct: number | null;
  /** Distance from the 48 hour average in standard deviations: below -2.5 is where Dip Hunter buys. */
  zscore48h: number;
  /** 14 hour RSI, 0 to 100. */
  rsi14h: number;
  /** Price against its 24 hour average. */
  trend24h: "above" | "below";
};

/** Every market at the latest hour, deepest dip first. */
export function scanMarkets(market: MarketData) {
  const rows: ScanRow[] = [];
  for (const token of market.tokens) {
    const window = token.closes.filter((close): close is number => close !== null).slice(-169);
    if (window.length < SCAN_MIN_HOURS || token.closes.at(-1) == null) continue;
    const price = window[window.length - 1];
    const change1h = changeOver(token.closes, 1);
    const change24h = changeOver(token.closes, 24);
    rows.push({
      symbol: token.symbol,
      name: token.name,
      address: token.address,
      assetClass: token.assetClass,
      price: round(price, 6),
      change1hPct: change1h === null ? null : round(change1h, 2),
      change24hPct: change24h === null ? null : round(change24h, 2),
      zscore48h: round(indicatorValue({ kind: "zscore", hours: 48 }, window), 2),
      rsi14h: round(indicatorValue({ kind: "rsi", hours: 14 }, window), 1),
      trend24h: price >= mean(window.slice(-24)) ? "above" : "below",
    });
  }
  rows.sort((a, b) => a.zscore48h - b.zscore48h);
  return { asOf: iso(market.startTs + (market.hours - 1) * 3600), markets: rows };
}

// ---------------------------------------------------------------------------
// Backtest
// ---------------------------------------------------------------------------

export const BACKTEST_STRATEGIES = ["momentum", "mean_reversion", "custom"] as const;
export const BACKTEST_MAX_MARKETS = 3;
export const BACKTEST_MAX_DAYS = 30;

export type BacktestRequest = {
  strategy: (typeof BACKTEST_STRATEGIES)[number];
  rules: Rules | null;
  /** Token addresses (lowercase), resolved from symbols or addresses. */
  tokens: string[];
  capital: number;
  maxPositionPct: number;
  stopLossPct: number;
  days: number;
};

const numberIn = (value: unknown, min: number, max: number, fallback: number): number | null => {
  if (value === undefined) return fallback;
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
};

/**
 * Checks a backtest body before anything is charged. Markets are matched by contract
 * address or by symbol, always against Zolva's allowlist (the market's tokens), so a
 * lookalike token can never be backtested by mistake.
 */
export function parseBacktestRequest(body: unknown, market: MarketData): { request: BacktestRequest; errors: [] } | { request: null; errors: string[] } {
  const errors: string[] = [];
  const input = (body ?? {}) as Record<string, unknown>;

  const strategy = input.strategy as BacktestRequest["strategy"];
  if (!BACKTEST_STRATEGIES.includes(strategy)) errors.push(`strategy must be one of ${BACKTEST_STRATEGIES.join(", ")}`);

  let rules: Rules | null = null;
  if (strategy === "custom") {
    const parsed = parseRules(input.rules);
    if (parsed.rules) rules = parsed.rules;
    else errors.push(...parsed.errors.map((error) => `rules: ${error}`));
  }

  const tokens: string[] = [];
  const markets = input.markets;
  if (!Array.isArray(markets) || markets.length < 1 || markets.length > BACKTEST_MAX_MARKETS) {
    errors.push(`markets must list 1 to ${BACKTEST_MAX_MARKETS} symbols or token addresses`);
  } else {
    for (const item of markets) {
      const key = typeof item === "string" ? item.trim().toLowerCase() : "";
      const token = market.tokens.find((candidate) => candidate.address.toLowerCase() === key || candidate.symbol.toLowerCase() === key);
      if (!token) errors.push(`Unknown market: ${String(item)}. See /api/public/v1/markets for the list.`);
      else if (!tokens.includes(token.address)) tokens.push(token.address);
    }
  }

  const capital = numberIn(input.capital, 1_000, 1_000_000, 10_000);
  const maxPositionPct = numberIn(input.maxPositionPct, 10, 100, 33);
  const stopLossPct = numberIn(input.stopLossPct, 2, 25, 8);
  const days = numberIn(input.days, 1, BACKTEST_MAX_DAYS, BACKTEST_MAX_DAYS);
  if (capital === null) errors.push("capital must be a number from 1000 to 1000000");
  if (maxPositionPct === null) errors.push("maxPositionPct must be a number from 10 to 100");
  if (stopLossPct === null) errors.push("stopLossPct must be a number from 2 to 25");
  if (days === null || !Number.isInteger(days)) errors.push(`days must be a whole number from 1 to ${BACKTEST_MAX_DAYS}`);

  if (errors.length) return { request: null, errors };
  return { request: { strategy, rules, tokens, capital: capital!, maxPositionPct: maxPositionPct!, stopLossPct: stopLossPct!, days: days! }, errors: [] };
}

/** Replays the request on the market's last `days` and compares it with holding the same markets. */
export function runBacktest(request: BacktestRequest, market: MarketData) {
  const tokens = request.tokens.map((address) => market.tokens.find((token) => token.address === address)!);
  const series = Object.fromEntries(tokens.map((token) => [token.address, token.closes]));
  const times = Array.from({ length: market.hours }, (_, index) => market.startTs + index * 3600);
  const fromIndex = market.hours - request.days * 24;
  const params: AgentParams = { strategy: request.strategy, rules: request.rules ?? undefined, maxPositionPct: request.maxPositionPct, stopLossPct: request.stopLossPct };

  const result = simulate({ series, params, capital: request.capital, fromIndex, times });
  const hold = buyAndHold(series, request.capital, fromIndex);
  const symbolOf = new Map(tokens.map((token) => [token.address, token.symbol]));
  // The engine's reason for each fill, from that hour's decision on the token.
  const reasonOf = new Map(result.runs.flatMap((run) => run.decisions.map((decision) => [`${run.index}|${decision.token}`, decision.reasoning] as const)));

  return {
    from: iso(times[fromIndex]),
    to: iso(times[market.hours - 1]),
    settings: {
      strategy: request.strategy,
      rules: request.rules,
      markets: tokens.map((token) => token.symbol),
      capital: request.capital,
      maxPositionPct: request.maxPositionPct,
      stopLossPct: request.stopLossPct,
      lookbackHours: request.rules ? rulesLookback(request.rules) : 48,
    },
    result: {
      finalEquity: round(result.finalEquity, 2),
      returnPct: round(result.returnPct, 2),
      holdReturnPct: round(hold.returnPct, 2),
      /** Return minus holding the same markets, in percentage points. */
      edgePts: round(result.returnPct - hold.returnPct, 2),
      maxDrawdownPct: round(result.maxDrawdownPct, 2),
      winRatePct: result.winRatePct === null ? null : round(result.winRatePct, 1),
      roundTrips: result.roundTrips,
    },
    trades: result.fills.map((fill) => ({
      at: iso(times[fill.index]),
      market: symbolOf.get(fill.token) ?? fill.token,
      side: fill.side,
      price: round(fill.price, 6),
      reason: fill.reason,
      reasoning: reasonOf.get(`${fill.index}|${fill.token}`) ?? null,
    })),
    /** Equity every 4 hours: [time, agent, holding]. */
    equity: result.runs
      .map((run, i) => [iso(times[run.index]), round(run.equity, 2), round(hold.curve[i] ?? request.capital, 2)] as const)
      .filter((_, i, list) => i % 4 === 0 || i === list.length - 1),
    costs: "Every trade pays 0.5% for fees and slippage, as on the leaderboard. Paper results; past results do not predict future ones.",
  };
}
