import { buyAndHold, maxDrawdown, paramsLookback, simulate, type AgentParams } from "../engine/engine";
import { HOUR_SECONDS } from "../engine/series";
import type { Market, MarketToken } from "../data/market";
import { percent } from "../format";

/**
 * The Studio's "Check robustness": the same agent tested the way Zolva's research judges rules
 * (docs/perps-research.md), on all the history the database has instead of the 30 day backtest:
 * - month by month, one continuous run, each month against holding the same markets
 * - the same run at double costs
 * - the same rules on other markets of the same kind that the user did not pick
 * Pure: the route loads the market, this only runs the engine (`simulate`, so `runHour`).
 */

/** A month needs at least this many days in the window to be counted. */
export const MIN_MONTH_DAYS = 7;
/** A window needs at least this many days after the rules' look-back. */
export const MIN_WINDOW_DAYS = 30;
/** How many other market sets to test. */
export const OTHER_SETS = 2;

export type RunSummary = {
  symbols: string[];
  from: string;
  to: string;
  days: number;
  returnPct: number;
  holdPct: number;
  maxDrawdownPct: number;
  trades: number;
};

export type MonthResult = { month: string; days: number; returnPct: number; holdPct: number };

export type RobustnessReport =
  | { ok: false; reason: string }
  | {
      ok: true;
      history: RunSummary;
      months: MonthResult[];
      doubleCosts: RunSummary;
      otherMarkets: RunSummary[];
      /** Plain sentences for the Studio, in order. */
      summary: string[];
    };

type Window = { tokens: MarketToken[]; fromIndex: number; lastIndex: number };

const iso = (market: Market, index: number) => new Date((market.startTs + index * HOUR_SECONDS) * 1000).toISOString();
const signed = (value: number) => percent(value);

/** The hours where every market has a price and the rules' look-back is full; null when too short. */
function windowFor(market: Market, tokens: MarketToken[], params: AgentParams): Window | null {
  if (!tokens.length || tokens.some((token) => token.firstIndex === null)) return null;
  const fromIndex = Math.max(...tokens.map((token) => token.firstIndex!)) + paramsLookback(params);
  const lastIndex = market.hours - 1;
  return lastIndex - fromIndex + 1 >= MIN_WINDOW_DAYS * 24 ? { tokens, fromIndex, lastIndex } : null;
}

function run(market: Market, window: Window, agentParams: AgentParams, capital: number, costScale = 1) {
  // DCA's first buy is the window's first hour.
  const params = agentParams.dca ? { ...agentParams, dca: { ...agentParams.dca, startTs: market.startTs + window.fromIndex * HOUR_SECONDS } } : agentParams;
  const series = Object.fromEntries(window.tokens.map((token) => [token.address, token.closes]));
  const perps = params.venue === "perps";
  const result = simulate({
    series,
    params,
    capital,
    fromIndex: window.fromIndex,
    toIndex: window.lastIndex,
    times: market.tokens[0].closes.map((_, index) => market.startTs + index * HOUR_SECONDS),
    costScale,
    ...(perps ? { funding: Object.fromEntries(window.tokens.map((token) => [token.address, token.funding ?? []])) } : {}),
  });
  // Holding is the same benchmark as the Studio's 30 day backtest.
  const hold = buyAndHold(series, capital, window.fromIndex, window.lastIndex);
  const summary: RunSummary = {
    symbols: window.tokens.map((token) => token.symbol),
    from: iso(market, window.fromIndex),
    to: iso(market, window.lastIndex),
    days: Math.round((window.lastIndex - window.fromIndex + 1) / 24),
    returnPct: result.returnPct,
    holdPct: hold.returnPct,
    maxDrawdownPct: maxDrawdown(result.runs.map((hour) => hour.equity)) * 100,
    trades: result.fills.length,
  };
  return { summary, equity: result.runs.map((hour) => hour.equity), holdCurve: hold.curve };
}

/** Calendar months (UTC) of one continuous run; each month's change from the end of the month before. */
function monthsOf(market: Market, window: Window, equity: number[], holdCurve: number[], capital: number): MonthResult[] {
  const months: MonthResult[] = [];
  let start = 0;
  for (let offset = 0; offset < equity.length; offset++) {
    const month = iso(market, window.fromIndex + offset).slice(0, 7);
    const next = offset + 1 < equity.length ? iso(market, window.fromIndex + offset + 1).slice(0, 7) : null;
    if (next === month) continue;
    const days = (offset - start + 1) / 24;
    if (days >= MIN_MONTH_DAYS) {
      const base = start === 0 ? capital : equity[start - 1];
      const holdBase = start === 0 ? capital : holdCurve[start - 1];
      months.push({ month, days: Math.round(days), returnPct: (equity[offset] / base - 1) * 100, holdPct: (holdCurve[offset] / holdBase - 1) * 100 });
    }
    start = offset + 1;
  }
  return months;
}

/**
 * Other markets of the same kind (venue and asset class) the user did not pick, longest history first:
 * each set swaps every picked market for a different one of its kind.
 */
export function otherMarketSets(market: Market, picked: MarketToken[], sets = OTHER_SETS): MarketToken[][] {
  const used = new Set(picked.map((token) => token.address));
  const candidates = market.tokens
    .filter((token) => token.firstIndex !== null && !used.has(token.address))
    .sort((a, b) => a.firstIndex! - b.firstIndex! || a.symbol.localeCompare(b.symbol));
  const out: MarketToken[][] = [];
  for (let set = 0; set < sets; set++) {
    const chosen: MarketToken[] = [];
    for (const pick of picked) {
      const next = candidates.find((token) => token.venue === pick.venue && token.assetClass === pick.assetClass && !used.has(token.address));
      if (!next) return out;
      used.add(next.address);
      chosen.push(next);
    }
    out.push(chosen);
  }
  return out;
}

/** `addresses`: the picked markets by token address (never by symbol: same-name clones exist). */
export function checkRobustness(market: Market, addresses: string[], params: AgentParams, capital = 10_000): RobustnessReport {
  const picked = addresses.map((address) => market.tokens.find((token) => token.address === address)).filter((token): token is MarketToken => Boolean(token));
  if (picked.length !== addresses.length || !picked.length) return { ok: false, reason: "Pick markets first." };
  if (picked.some((token) => (token.venue === "lighter") !== (params.venue === "perps"))) return { ok: false, reason: "These markets don't match the venue." };
  const window = windowFor(market, picked, params);
  if (!window) return { ok: false, reason: `Not enough history yet: these markets need at least ${MIN_WINDOW_DAYS} days of prices after the rules' look-back.` };

  const base = run(market, window, params, capital);
  const months = monthsOf(market, window, base.equity, base.holdCurve, capital);
  const doubleCosts = run(market, window, params, capital, 2).summary;
  const otherMarkets = otherMarketSets(market, picked)
    .map((tokens) => windowFor(market, tokens, params))
    .filter((other): other is Window => other !== null)
    .map((other) => run(market, other, params, capital).summary);

  const history = base.summary;
  const positive = months.filter((month) => month.returnPct > 0).length;
  const beat = months.filter((month) => month.returnPct > month.holdPct).length;
  const summary = [
    `Positive in ${positive} of ${months.length} months; beat holding in ${beat}.`,
    `Over all ${history.days} days: ${signed(history.returnPct)} (holding ${signed(history.holdPct)}), worst drop ${history.maxDrawdownPct.toFixed(1)}%.`,
    `At double costs: ${signed(doubleCosts.returnPct)}${doubleCosts.returnPct > 0 ? ", still positive" : ""}.`,
    otherMarkets.length
      ? `On markets you did not pick: ${otherMarkets.map((other) => `${other.symbols.join(" + ")} ${signed(other.returnPct)} (holding ${signed(other.holdPct)})`).join("; ")}.`
      : "No other markets of the same kind have enough history to compare.",
  ];
  if (months.length < 6) summary.push(`Only ${months.length} months of history: a weak test, so read it as a warning sign, not a promise.`);
  return { ok: true, history, months, doubleCosts, otherMarkets, summary };
}
