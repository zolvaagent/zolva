/**
 * The Sita trading engine.
 *
 * `runHour` is the single source of truth for one agent's decision in one
 * hour: the live tick calls it once per hour, and `simulate` (backtests) calls
 * it in a loop. Same code, same results.
 *
 * The engine decides and returns paper fills. For live agents (Phase 3) an
 * on-chain executor will turn the same decisions into swaps instead of using
 * these fills.
 *
 * Rules (docs/mvp-plan.md section 4):
 * - Strategy signals come from strategies.ts.
 * - Stop loss is checked every hour against the average entry price, which
 *   includes the cost paid.
 * - A buy uses min(cash, equity x max position %).
 * - Every fill pays COST_RATE (fees + slippage).
 */
import { evaluateRules, rulesLookback, type Rules } from "./rules.ts";
import { decide, LOOKBACK_HOURS, type StrategyKey } from "./strategies.ts";

export const COST_RATE = 0.005;

export type AgentParams = {
  /** A preset, or "custom" with the user's own rules. */
  strategy: StrategyKey | "custom";
  rules?: Rules;
  /** Max share of equity in one token, 0 to 100. */
  maxPositionPct: number;
  /** Sell when a position is this far below its entry price, 0 to 100. */
  stopLossPct: number;
};

export type Position = {
  quantity: number;
  entryPrice: number;
  /** Hour the position was opened (unix seconds), for the max holding time. */
  openedAt?: number;
};

export type AgentState = {
  cash: number;
  /** Keyed by token id (address in the app, symbol in tests). */
  positions: Record<string, Position>;
};

export type Decision = {
  token: string;
  action: "buy" | "sell" | "hold";
  reasoning: string;
  indicators?: Record<string, number>;
};

export type Fill = {
  token: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  costUsd: number;
  reason: "signal" | "stop_loss" | "take_profit" | "max_hold";
  /** Entry price of the position a sell closed, for win rate. */
  entryPrice?: number;
};

export type HourResult = {
  state: AgentState;
  decisions: Decision[];
  fills: Fill[];
  /** Equity after this hour's fills, at this hour's prices. */
  equity: number;
};

/**
 * One agent, one hour. Pure: returns a new state, never mutates the input.
 *
 * @param series  per token, aligned hourly closes (see series.ts); null = no price yet
 * @param index   the hour to decide on
 * @param hourTime start of that hour in unix seconds (backtests may leave the default)
 */
export function runHour(
  state: AgentState,
  params: AgentParams,
  series: Record<string, (number | null)[]>,
  index: number,
  hourTime: number = index * 3600,
): HourResult {
  const rules = params.strategy === "custom" ? params.rules : undefined;
  if (params.strategy === "custom" && !rules) throw new Error("Custom strategy without rules");
  const lookback = rules ? rulesLookback(rules) : LOOKBACK_HOURS;
  const tokens = Object.keys(series);
  const prices: Record<string, number | null> = Object.fromEntries(tokens.map((token) => [token, series[token][index] ?? null]));
  const equityBefore = equityAt(state, prices);
  const maxShare = params.maxPositionPct / 100;
  const stopDistance = params.stopLossPct / 100;

  let cash = state.cash;
  const positions: Record<string, Position> = { ...state.positions };
  const decisions: Decision[] = [];
  const fills: Fill[] = [];

  for (const token of tokens) {
    const price = prices[token];
    const position = positions[token];
    const window = series[token].slice(Math.max(0, index - lookback), index + 1);

    if (price == null || window.length <= lookback || window.some((value) => value == null)) {
      decisions.push({ token, action: "hold", reasoning: "Not enough price history yet. Waiting." });
      continue;
    }

    if (position && price <= position.entryPrice * (1 - stopDistance)) {
      const fill = sellAll(token, position, price, "stop_loss");
      cash += fill.quantity * price - fill.costUsd;
      delete positions[token];
      fills.push(fill);
      decisions.push({
        token,
        action: "sell",
        reasoning: `Stop loss hit: ${formatChange(price / position.entryPrice - 1)} from entry. Selling everything.`,
      });
      continue;
    }

    // Custom exits that do not depend on indicators.
    if (rules && position) {
      const heldHours = position.openedAt === undefined ? 0 : (hourTime - position.openedAt) / 3600;
      const exit: { reason: Fill["reason"]; reasoning: string } | null =
        rules.takeProfitPct && price >= position.entryPrice * (1 + rules.takeProfitPct / 100)
          ? { reason: "take_profit", reasoning: `Take profit hit: ${formatChange(price / position.entryPrice - 1)} from entry. Selling everything.` }
          : rules.maxHoldHours && heldHours >= rules.maxHoldHours
            ? { reason: "max_hold", reasoning: `Held for ${rules.maxHoldHours} hours, the maximum. Selling.` }
            : null;
      if (exit) {
        const fill = sellAll(token, position, price, exit.reason);
        cash += fill.quantity * price - fill.costUsd;
        delete positions[token];
        fills.push(fill);
        decisions.push({ token, action: "sell", reasoning: exit.reasoning });
        continue;
      }
    }

    const signal = rules
      ? evaluateRules(rules, window as number[], Boolean(position))
      : decide(params.strategy as StrategyKey, window as number[], Boolean(position));

    if (signal.action === "buy") {
      const notional = Math.min(cash, equityBefore * maxShare);
      if (notional < 1) {
        decisions.push({ token, action: "hold", reasoning: "Signal to buy, but no cash left. Holding." });
        continue;
      }
      const quantity = (notional * (1 - COST_RATE)) / price;
      cash -= notional;
      // Entry price includes the cost, so stops and PnL measure what was actually paid.
      positions[token] = { quantity, entryPrice: notional / quantity, openedAt: hourTime };
      fills.push({ token, side: "buy", quantity, price, costUsd: notional * COST_RATE, reason: "signal" });
    } else if (signal.action === "sell" && position) {
      const fill = sellAll(token, position, price, "signal");
      cash += fill.quantity * price - fill.costUsd;
      delete positions[token];
      fills.push(fill);
    }
    decisions.push({ token, action: signal.action, reasoning: signal.reasoning, indicators: signal.indicators });
  }

  const next = { cash, positions };
  return { state: next, decisions, fills, equity: equityAt(next, prices) };
}

function sellAll(token: string, position: Position, price: number, reason: Fill["reason"]): Fill {
  const gross = position.quantity * price;
  return { token, side: "sell", quantity: position.quantity, price, costUsd: gross * COST_RATE, reason, entryPrice: position.entryPrice };
}

/** Cash plus positions at the given prices; a token without a price is valued at its entry. */
export function equityAt(state: AgentState, prices: Record<string, number | null>): number {
  let equity = state.cash;
  for (const [token, position] of Object.entries(state.positions)) {
    equity += position.quantity * (prices[token] ?? position.entryPrice);
  }
  return equity;
}

function formatChange(fraction: number): string {
  return `${fraction >= 0 ? "+" : ""}${(fraction * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Backtests
// ---------------------------------------------------------------------------

export type SimulationRun = { index: number; equity: number; cash: number; decisions: Decision[] };

export type SimulationResult = {
  runs: SimulationRun[];
  fills: (Fill & { index: number })[];
  state: AgentState;
  finalEquity: number;
  returnPct: number;
  maxDrawdownPct: number;
  /** Share of closed round trips that made money after costs; null with none. */
  winRatePct: number | null;
  roundTrips: number;
};

/** Runs `runHour` for every hour from `fromIndex` to `toIndex` (inclusive). */
export function simulate(options: {
  series: Record<string, (number | null)[]>;
  params: AgentParams;
  capital: number;
  fromIndex: number;
  toIndex?: number;
  /** Hour start per index (unix seconds); defaults to index x 3600. */
  times?: number[];
}): SimulationResult {
  const tokens = Object.keys(options.series);
  const lastIndex = options.toIndex ?? options.series[tokens[0]].length - 1;
  let state: AgentState = { cash: options.capital, positions: {} };
  const runs: SimulationRun[] = [];
  const fills: (Fill & { index: number })[] = [];

  for (let index = options.fromIndex; index <= lastIndex; index++) {
    const hour = runHour(state, options.params, options.series, index, options.times?.[index] ?? index * 3600);
    state = hour.state;
    fills.push(...hour.fills.map((fill) => ({ ...fill, index })));
    runs.push({ index, equity: hour.equity, cash: state.cash, decisions: hour.decisions });
  }

  const finalEquity = runs.length ? runs[runs.length - 1].equity : options.capital;
  const profits = fills.filter((fill) => fill.side === "sell").map((fill) => fill.price * (1 - COST_RATE) - (fill.entryPrice ?? fill.price));
  return {
    runs,
    fills,
    state,
    finalEquity,
    returnPct: (finalEquity / options.capital - 1) * 100,
    maxDrawdownPct: maxDrawdown(runs.map((run) => run.equity)) * 100,
    winRatePct: profits.length ? (profits.filter((profit) => profit > 0).length / profits.length) * 100 : null,
    roundTrips: profits.length,
  };
}

/** Equal-weight buy and hold of the same tokens, paying the cost once, for comparison. */
export function buyAndHold(series: Record<string, (number | null)[]>, capital: number, fromIndex: number, toIndex?: number) {
  const tokens = Object.keys(series);
  const lastIndex = toIndex ?? series[tokens[0]].length - 1;
  const share = capital / tokens.length;
  const curve: number[] = [];
  for (let index = fromIndex; index <= lastIndex; index++) {
    let equity = 0;
    for (const token of tokens) {
      const start = series[token][fromIndex];
      const now = series[token][index];
      equity += start && now ? share * (1 - COST_RATE) * (now / start) : share;
    }
    curve.push(equity);
  }
  return { curve, returnPct: ((curve[curve.length - 1] ?? capital) / capital - 1) * 100 };
}

export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    worst = Math.max(worst, (peak - value) / peak);
  }
  return worst;
}
