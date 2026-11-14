/**
 * The Zolva trading engine.
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
 * - Dip hunter holds one position at a time: while it holds nothing it buys only
 *   the market furthest below its average, so other buy signals become holds.
 * - Spike fade shorts (paper only): the same one position rule, the market furthest above
 *   its average. A short sells borrowed tokens; its
 *   stop is the price rising stopLossPct above entry, and it pays SHORT_BORROW_APR out of
 *   its own locked cash (never free cash, which may not go below zero).
 * - Perps agents (venue "perps", Lighter on Robinhood Chain, paper only) pay PERPS_COST_RATE
 *   per fill instead of COST_RATE, and the market's hourly funding instead of the borrow
 *   rate. Funding also comes out of (or into) the position itself: a long loses quantity, a
 *   short's entry moves, so cash never goes below zero. Research: docs/perps-research.md.
 * - Dip + fade (perps, paper only) runs both one position rules side by side: at most one
 *   long (the deepest dip) and one short (the highest spike), each only while that side is
 *   empty, with the 7 day trend filter in strategies.ts.
 * - Bounce short (perps, paper only) follows spike fade's one position rule but enters the market
 *   with the deepest 7 day fall that is bouncing (see strategies.ts), not the highest z score.
 * - Volatility sizing (custom rules only, `params.sizing`): a buy uses equity x min(max position %,
 *   target / realised volatility) instead of the max position %. Once a day (00:00 UTC) an open
 *   position is resized to that share when it is more than RESIZE_BAND away from it; the resize
 *   pays the cost on the change only and keeps the first entry price, so the stop does not move.
 *   Research: docs/perps-research.md, "Round 2 on alt perps".
 */
import { evaluateRules, rulesLookback, type Rules } from "./rules.ts";
import { decide, presetLookback, type RuleCheck, type StrategyKey } from "./strategies.ts";

export const COST_RATE = 0.005;
/** Yearly borrow rate charged hourly on open shorts (Morpho was near 0% on 2026-11-03; cautious). */
export const SHORT_BORROW_APR = 0.1;
/** Cost per fill on Lighter perps: 0% fees today, 0.05% kept for slippage and a fee change. */
export const PERPS_COST_RATE = 0.0005;
/** Volatility sizing: resize once a day when the held size is more than this share away from the wanted size. */
export const RESIZE_BAND = 0.25;
const HOURS_PER_YEAR = 8760;

export type Venue = "dex" | "perps";

/** Cost per fill for an agent's venue. */
export function costRateFor(venue: Venue | undefined): number {
  return venue === "perps" ? PERPS_COST_RATE : COST_RATE;
}

export type AgentParams = {
  /** A preset, or "custom" with the user's own rules. */
  strategy: StrategyKey | "custom";
  rules?: Rules;
  /** Max share of equity in one token, 0 to 100. */
  maxPositionPct: number;
  /** Sell when a position is this far below its entry price (a short: above), 0 to 100. */
  stopLossPct: number;
  /** Where the agent trades: Uniswap stock and crypto tokens (default) or Lighter perps. */
  venue?: Venue;
  /**
   * Leverage of a short, 1 or more (default 1). Only bounce_short on perps uses it (the database
   * refuses it elsewhere): a short then opens a position of leverage x the margin it puts in.
   */
  leverage?: number;
  /**
   * Custom rules only: size each buy by volatility instead of a fixed share. Wanted share of
   * equity = min(maxPositionPct, targetPct / realised volatility), where realised volatility is
   * the population standard deviation of the last `hours` hourly log returns x sqrt(8760).
   */
  sizing?: VolTargetSizing;
};

export type VolTargetSizing = { kind: "volTarget"; targetPct: number; hours: number };

/** Hours of closes before an hour that runHour needs to decide on it. */
export function paramsLookback(params: AgentParams): number {
  const base = params.strategy === "custom" && params.rules ? rulesLookback(params.rules) : presetLookback(params.strategy as StrategyKey);
  return params.strategy === "custom" && params.sizing ? Math.max(base, params.sizing.hours + 1) : base;
}

/** Annualised volatility of the last `hours` hourly log returns at the end of `window` (closes, oldest first). */
export function realisedVolatility(window: number[], hours: number): number {
  const closes = window.slice(-hours - 1);
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) returns.push(Math.log(closes[i] / closes[i - 1]));
  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + value * value, 0) / returns.length - average * average;
  return Math.sqrt(Math.max(0, variance) * HOURS_PER_YEAR);
}

/** Share of equity a volatility sized agent wants in one market, capped by the max position share. */
function wantedShare(sizing: VolTargetSizing, window: number[], maxShare: number): { share: number; volatility: number } {
  const volatility = realisedVolatility(window, sizing.hours);
  return { share: volatility > 0 ? Math.min(maxShare, sizing.targetPct / 100 / volatility) : maxShare, volatility };
}

/** Share of the margin a leveraged short may lose before it is liquidated. */
export const LIQUIDATION_LOSS = 0.95;

export type Position = {
  quantity: number;
  entryPrice: number;
  /** Hour the position was opened (unix seconds), for the max holding time. */
  openedAt?: number;
  /**
   * Set for a short: quantity is the borrowed tokens sold, entryPrice the sale price.
   * It is worth quantity x (2 x entryPrice - price): the cash it locked plus its gain.
   */
  side?: "short";
  /**
   * Set only for a leveraged short: the cash it locked after the opening cost. It is worth
   * margin + quantity x (entryPrice - price), never below zero, instead of the 1x formula above.
   */
  margin?: number;
  /**
   * Set only when the stop is measured from another price than entryPrice: a volatility sized short
   * that was resized (its entry, the P&L basis, moved to the resize price; the stop stays at the
   * first entry).
   */
  stopPrice?: number;
};

export type AgentState = {
  cash: number;
  /** Keyed by token id (address in the app, symbol in tests). */
  positions: Record<string, Position>;
};

export type Decision = {
  token: string;
  action: "buy" | "sell" | "short" | "cover" | "hold";
  reasoning: string;
  indicators?: Record<string, number>;
  /** Set when the AI co-pilot reviewed this hour's rule signal for the token. */
  ai?: { model: string; verdict: "approved" | "passed"; reasoning: string };
  /** The token's close this hour. Stored from 2026-11-14 on, for the decision log's details. */
  price?: number;
  /** Custom rules: every condition of the group checked this hour (see RuleCheck). */
  checks?: RuleCheck[];
  /** Lab short rules while flat: the short entry group's conditions. */
  shortChecks?: RuleCheck[];
  /** The position held when the hour started (after funding), if any. */
  position?: { entryPrice: number; heldHours: number | null; side?: "short"; stopPrice?: number };
};

export type RunHourOptions = {
  /**
   * Rule signals the AI co-pilot passed on, by token, with its reason. Only
   * signal trades can be cancelled; stop loss, take profit and max holding
   * time always execute.
   */
  veto?: ReadonlyMap<string, string>;
  /**
   * Perps only: funding per token and hour as a signed fraction (positive: longs pay
   * shorts), aligned with the closes. A missing hour counts as zero.
   */
  funding?: Record<string, (number | null)[]>;
};

export type Fill = {
  token: string;
  /** short opens a short, cover closes it. */
  side: "buy" | "sell" | "short" | "cover";
  quantity: number;
  price: number;
  costUsd: number;
  /** resize: a volatility sized position moved back toward its wanted size (not a round trip). */
  reason: "signal" | "stop_loss" | "take_profit" | "max_hold" | "resize";
  /** Entry price of the position a sell or cover closed, for win rate. */
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
  options: RunHourOptions = {},
): HourResult {
  const rules = params.strategy === "custom" ? params.rules : undefined;
  if (params.strategy === "custom" && !rules) throw new Error("Custom strategy without rules");
  const lookback = paramsLookback(params);
  // Volatility sizing is for custom (long only) rules; presets keep their fixed share.
  const sizing = rules ? params.sizing : undefined;
  const resizeHour = sizing !== undefined && hourTime % 86400 === 0;
  const tokens = Object.keys(series);
  const prices: Record<string, number | null> = Object.fromEntries(tokens.map((token) => [token, series[token][index] ?? null]));
  const equityBefore = equityAt(state, prices);
  const maxShare = params.maxPositionPct / 100;
  const stopDistance = params.stopLossPct / 100;
  const cost = costRateFor(params.venue);
  const leverage = params.strategy === "bounce_short" && params.venue === "perps" ? Math.max(1, params.leverage ?? 1) : 1;
  // A leveraged short is stopped at the stop, or liquidated earlier when the stop is wider than
  // LIQUIDATION_LOSS of the margin: whichever price comes first.
  const shortStop = Math.min(stopDistance, LIQUIDATION_LOSS / leverage);

  let cash = state.cash;
  const positions: Record<string, Position> = { ...state.positions };
  const decisions: Decision[] = [];
  const fills: Fill[] = [];
  // What each token's decision was based on, added to its decision at the end (decision log details).
  const context = new Map<string, Pick<Decision, "price" | "position" | "checks" | "shortChecks">>();
  // One position strategies: decided before the loop, from the positions held at the start of
  // the hour, so a sell this hour frees the slot for the next hour, not this one. Dip + fade
  // has one slot per side.
  const held = Object.values(state.positions);
  const holdsAny = held.length > 0;
  const holdsLong = held.some((position) => position.side !== "short");
  const holdsShort = held.some((position) => position.side === "short");
  const dipFade = params.strategy === "dip_fade";
  const preset = params.strategy as StrategyKey;
  const deepestDip = (params.strategy === "dip_hunter" && !holdsAny) || (dipFade && !holdsLong) ? findExtreme(preset, "buy", series, index, lookback, state) : null;
  const shortOnly = params.strategy === "spike_fade" || params.strategy === "bounce_short";
  const strongestSpike = (shortOnly && !holdsAny) || (dipFade && !holdsShort) ? findExtreme(preset, "short", series, index, lookback, state) : null;

  // Carrying costs for the hour that just passed, paid by the position itself, never from free
  // cash (a position can use all the cash, and cash may never go below zero).
  // - DEX shorts pay the borrow rate: lowering the entry by fee / (2 x quantity) lowers the
  //   short's value by exactly the fee.
  // - Perps pay or receive funding: payment = quantity x price x rate, positive rate from longs
  //   to shorts. A long's quantity shrinks by the payment; a short's entry moves by half of it.
  for (const token of tokens) {
    const position = positions[token];
    const price = prices[token];
    if (!position || price == null) continue;
    if (params.venue === "perps") {
      const rate = options.funding?.[token]?.[index] ?? 0;
      if (rate === 0) continue;
      positions[token] =
        position.margin !== undefined
          ? { ...position, margin: position.margin + position.quantity * price * rate }
          : position.side === "short"
            ? { ...position, entryPrice: position.entryPrice + (price * rate) / 2 }
            : { ...position, quantity: position.quantity * (1 - rate) };
    } else if (position.side === "short") {
      const fee = (position.quantity * price * SHORT_BORROW_APR) / (365 * 24);
      positions[token] = { ...position, entryPrice: position.entryPrice - fee / (2 * position.quantity) };
    }
  }

  for (const token of tokens) {
    const price = prices[token];
    const position = positions[token];
    const window = series[token].slice(Math.max(0, index - lookback), index + 1);

    if (price == null || window.length <= lookback || window.some((value) => value == null)) {
      decisions.push({ token, action: "hold", reasoning: "Not enough price history yet. Waiting." });
      continue;
    }

    context.set(token, {
      price,
      ...(position
        ? {
            position: {
              entryPrice: position.entryPrice,
              heldHours: position.openedAt === undefined ? null : Math.round((hourTime - position.openedAt) / 3600),
              ...(position.side === "short" ? { side: "short" as const } : {}),
              ...(position.stopPrice !== undefined ? { stopPrice: position.stopPrice } : {}),
            },
          }
        : {}),
    });

    if (position?.side === "short" && price >= (position.stopPrice ?? position.entryPrice) * (1 + (position.margin !== undefined ? shortStop : stopDistance))) {
      const fill = coverAll(token, position, price, "stop_loss", cost);
      cash += Math.max(0, shortValue(position, price) - fill.costUsd);
      delete positions[token];
      fills.push(fill);
      const liquidated = position.margin !== undefined && LIQUIDATION_LOSS / leverage < stopDistance;
      decisions.push({
        token,
        action: "cover",
        reasoning: liquidated
          ? `Liquidated: ${formatChange(price / position.entryPrice - 1)} above the short entry at ${leverage}x. Covering everything.`
          : `Stop loss hit: ${formatChange(price / position.entryPrice - 1)} above the short entry. Covering everything.`,
      });
      continue;
    }

    if (position && position.side !== "short" && price <= position.entryPrice * (1 - stopDistance)) {
      const fill = sellAll(token, position, price, "stop_loss", cost);
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
        const fill = sellAll(token, position, price, exit.reason, cost);
        cash += fill.quantity * price - fill.costUsd;
        delete positions[token];
        fills.push(fill);
        decisions.push({ token, action: "sell", reasoning: exit.reasoning });
        continue;
      }
    }

    const signal = rules
      ? evaluateRules(rules, window as number[], position ? (position.side === "short" ? "short" : true) : false, options.funding?.[token]?.slice(Math.max(0, index - lookback), index + 1))
      : decide(preset, window as number[], Boolean(position), position?.side === "short" ? "short" : "long");

    if (signal.checks) context.set(token, { ...context.get(token), checks: signal.checks, ...(signal.shortChecks ? { shortChecks: signal.shortChecks } : {}) });

    const wantsTrade = signal.action === "buy" || signal.action === "short" || ((signal.action === "sell" || signal.action === "cover") && position);
    const passed = wantsTrade ? options.veto?.get(token) : undefined;
    if (passed !== undefined) {
      decisions.push({ token, action: "hold", reasoning: `${signal.reasoning} The AI co-pilot passed: ${passed}`, indicators: signal.indicators });
      continue;
    }

    if (signal.action === "buy" && (params.strategy === "dip_hunter" || dipFade) && token !== deepestDip) {
      const reasoning = dipFade && holdsLong
        ? `${signal.reasoning.replace(" Buying the dip.", "")} Already long another market: one long at a time.`
        : !dipFade && holdsAny
        ? `${signal.reasoning.replace(" Buying the dip.", "")} Already holding another market: one position at a time.`
        : `${signal.reasoning.replace(" Buying the dip.", "")} Another market dipped deeper: buying that one instead.`;
      decisions.push({ token, action: "hold", reasoning, indicators: signal.indicators });
      continue;
    }

    if (signal.action === "short" && !rules && token !== strongestSpike) {
      const base = signal.reasoning.replace(/ Shorting the (spike|bounce)\./, "");
      const reasoning = dipFade && holdsShort
        ? `${base} Already short another market: one short at a time.`
        : !dipFade && holdsAny
        ? `${base} Already in another market: one position at a time.`
        : params.strategy === "bounce_short"
        ? `${base} Another market fell further over 7 days: shorting that one instead.`
        : `${base} Another market spiked higher: shorting that one instead.`;
      decisions.push({ token, action: "hold", reasoning, indicators: signal.indicators });
      continue;
    }

    if (signal.action === "short") {
      const share = sizing ? wantedShare(sizing, window as number[], maxShare).share : maxShare;
      const notional = Math.min(cash, equityBefore * share);
      if (notional < 1) {
        decisions.push({ token, action: "hold", reasoning: "Signal to short, but no cash left for the collateral. Holding." });
        continue;
      }
      cash -= notional;
      if (leverage > 1) {
        // The position is leverage x the margin put in; the opening cost is charged on the whole position.
        const exposure = notional * leverage;
        const quantity = exposure / price;
        positions[token] = { quantity, entryPrice: price, openedAt: hourTime, side: "short", margin: notional - exposure * cost };
        fills.push({ token, side: "short", quantity, price, costUsd: exposure * cost, reason: "signal" });
      } else {
        const quantity = (notional * (1 - cost)) / price;
        // Lab short rules keep their stop at this price even after funding or a resize moves the entry.
        positions[token] = { quantity, entryPrice: price, openedAt: hourTime, side: "short", ...(rules ? { stopPrice: price } : {}) };
        fills.push({ token, side: "short", quantity, price, costUsd: notional * cost, reason: "signal" });
      }
    } else if (signal.action === "cover" && position) {
      const fill = coverAll(token, position, price, "signal", cost);
      cash += Math.max(0, shortValue(position, price) - fill.costUsd);
      delete positions[token];
      fills.push(fill);
    } else if (signal.action === "buy") {
      const share = sizing ? wantedShare(sizing, window as number[], maxShare).share : maxShare;
      const notional = Math.min(cash, equityBefore * share);
      if (notional < 1) {
        decisions.push({ token, action: "hold", reasoning: "Signal to buy, but no cash left. Holding." });
        continue;
      }
      const quantity = (notional * (1 - cost)) / price;
      cash -= notional;
      // Entry price includes the cost, so stops and PnL measure what was actually paid.
      positions[token] = { quantity, entryPrice: notional / quantity, openedAt: hourTime };
      fills.push({ token, side: "buy", quantity, price, costUsd: notional * cost, reason: "signal" });
    } else if (signal.action === "sell" && position) {
      const fill = sellAll(token, position, price, "signal", cost);
      cash += fill.quantity * price - fill.costUsd;
      delete positions[token];
      fills.push(fill);
    }
    const decision: Decision = { token, action: signal.action, reasoning: signal.reasoning, indicators: signal.indicators };

    // Daily resize of a volatility sized position that is still open after this hour's signal.
    const open = positions[token];
    if (resizeHour && sizing && open && open.side !== "short") {
      const { share, volatility } = wantedShare(sizing, window as number[], maxShare);
      const wanted = equityAt({ cash, positions }, prices) * share;
      const held = open.quantity * price;
      if (wanted > 0 && Math.abs(held - wanted) > RESIZE_BAND * wanted) {
        const why = `Daily resize: volatility is ${(volatility * 100).toFixed(0)}% a year, so the target is ${(share * 100).toFixed(1)}% of equity`;
        if (held < wanted) {
          const spend = Math.min(cash, wanted - held);
          if (spend >= 1) {
            const quantity = (spend * (1 - cost)) / price;
            cash -= spend;
            // The first entry price stays, so the stop loss does not move.
            positions[token] = { ...open, quantity: open.quantity + quantity };
            fills.push({ token, side: "buy", quantity, price, costUsd: spend * cost, reason: "resize" });
            decisions.push({ ...decision, action: "buy", reasoning: `${signal.reasoning} ${why}: buying ${formatUsd(spend)} more.` });
            continue;
          }
        } else {
          const quantity = (held - wanted) / price;
          const gross = quantity * price;
          cash += gross * (1 - cost);
          positions[token] = { ...open, quantity: open.quantity - quantity };
          fills.push({ token, side: "sell", quantity, price, costUsd: gross * cost, reason: "resize", entryPrice: open.entryPrice });
          decisions.push({ ...decision, action: "sell", reasoning: `${signal.reasoning} ${why}: selling ${formatUsd(gross)}.` });
          continue;
        }
      }
    }
    // A short is resized by closing it and reopening at the wanted size at this price (its P&L basis
    // moves to this price); the stop stays at the first entry. Cost is paid on the change only.
    if (resizeHour && sizing && open && open.side === "short" && open.margin === undefined) {
      const { share, volatility } = wantedShare(sizing, window as number[], maxShare);
      const free = cash + shortValue(open, price);
      const held = open.quantity * price;
      // Never more than the cash can carry, cost included, so cash stays at or above zero.
      const wanted = Math.min(equityAt({ cash, positions }, prices) * share, (free + held * cost) / (1 + cost));
      if (wanted > 0 && Math.abs(held - wanted) > RESIZE_BAND * wanted) {
        const why = `Daily resize: volatility is ${(volatility * 100).toFixed(0)}% a year, so the target is ${(share * 100).toFixed(1)}% of equity`;
        const quantity = wanted / price;
        const change = Math.abs(quantity - open.quantity);
        const costUsd = change * price * cost;
        cash = free - wanted - costUsd;
        positions[token] = { quantity, entryPrice: price, openedAt: open.openedAt, side: "short", stopPrice: open.stopPrice ?? open.entryPrice };
        if (quantity > open.quantity) {
          fills.push({ token, side: "short", quantity: change, price, costUsd, reason: "resize" });
          decisions.push({ ...decision, action: "short", reasoning: `${signal.reasoning} ${why}: shorting ${formatUsd(change * price)} more.` });
        } else {
          fills.push({ token, side: "cover", quantity: change, price, costUsd, reason: "resize", entryPrice: open.entryPrice });
          decisions.push({ ...decision, action: "cover", reasoning: `${signal.reasoning} ${why}: covering ${formatUsd(change * price)}.` });
        }
        continue;
      }
    }
    decisions.push(decision);
  }

  const next = { cash, positions };
  const detailed = decisions.map((decision) => ({ ...decision, ...context.get(decision.token) }));
  return { state: next, decisions: detailed, fills, equity: equityAt(next, prices) };
}

/**
 * The one market a one-position strategy may enter this hour, among those not held: for a
 * buy the lowest z score below the entry level (dip hunter, dip + fade's long), for a short
 * the highest above it (spike fade, dip + fade's short). A market whose signal is blocked
 * (dip + fade's trend filter) is not a candidate.
 */
function findExtreme(
  strategy: StrategyKey,
  entry: "buy" | "short",
  series: Record<string, (number | null)[]>,
  index: number,
  lookback: number,
  state: AgentState,
): string | null {
  // A short wants the highest z score: compare on the flipped sign.
  const sign = entry === "buy" ? 1 : -1;
  let best: { token: string; score: number } | null = null;
  for (const token of Object.keys(series)) {
    if (state.positions[token]) continue;
    const window = series[token].slice(Math.max(0, index - lookback), index + 1);
    if (series[token][index] == null || window.length <= lookback || window.some((value) => value == null)) continue;
    const signal = decide(strategy, window as number[], false);
    // Bounce short enters the market with the deepest 7 day fall; the others rank on the z score.
    const score = strategy === "bounce_short" ? signal.indicators.trend7d : sign * signal.indicators.zScore;
    if (signal.action === entry && (!best || score < best.score)) best = { token, score };
  }
  return best?.token ?? null;
}

function coverAll(token: string, position: Position, price: number, reason: Fill["reason"], cost: number): Fill {
  const gross = position.quantity * price;
  return { token, side: "cover", quantity: position.quantity, price, costUsd: gross * cost, reason, entryPrice: position.entryPrice };
}

function sellAll(token: string, position: Position, price: number, reason: Fill["reason"], cost: number): Fill {
  const gross = position.quantity * price;
  return { token, side: "sell", quantity: position.quantity, price, costUsd: gross * cost, reason, entryPrice: position.entryPrice };
}

/** Cash plus positions at the given prices (a short: locked cash plus gain); a token without a price is valued at its entry. */
export function equityAt(state: AgentState, prices: Record<string, number | null>): number {
  let equity = state.cash;
  for (const [token, position] of Object.entries(state.positions)) {
    const price = prices[token] ?? position.entryPrice;
    equity += position.side === "short" ? shortValue(position, price) : position.quantity * price;
  }
  return equity;
}

/**
 * What an open short is worth: the cash it locked plus its gain. A 1x short locked quantity x entry;
 * a leveraged short locked its margin and cannot lose more than that.
 */
export function shortValue(position: Position, price: number): number {
  return position.margin === undefined
    ? position.quantity * (2 * position.entryPrice - price)
    : Math.max(0, position.margin + position.quantity * (position.entryPrice - price));
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
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
  /** Perps funding per token and hour (see RunHourOptions.funding). */
  funding?: Record<string, (number | null)[]>;
}): SimulationResult {
  const tokens = Object.keys(options.series);
  const lastIndex = options.toIndex ?? options.series[tokens[0]].length - 1;
  let state: AgentState = { cash: options.capital, positions: {} };
  const runs: SimulationRun[] = [];
  const fills: (Fill & { index: number })[] = [];

  for (let index = options.fromIndex; index <= lastIndex; index++) {
    const hour = runHour(state, options.params, options.series, index, options.times?.[index] ?? index * 3600, { funding: options.funding });
    state = hour.state;
    fills.push(...hour.fills.map((fill) => ({ ...fill, index })));
    runs.push({ index, equity: hour.equity, cash: state.cash, decisions: hour.decisions });
  }

  const finalEquity = runs.length ? runs[runs.length - 1].equity : options.capital;
  const cost = costRateFor(options.params.venue);
  // A resize is not a round trip: only full exits count toward the win rate.
  const profits = fills
    .filter((fill) => (fill.side === "sell" || fill.side === "cover") && fill.reason !== "resize")
    .map((fill) =>
      fill.side === "sell" ? fill.price * (1 - cost) - (fill.entryPrice ?? fill.price) : (fill.entryPrice ?? fill.price) - fill.price * (1 + cost),
    );
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
export function buyAndHold(series: Record<string, (number | null)[]>, capital: number, fromIndex: number, toIndex?: number, cost: number = COST_RATE) {
  const tokens = Object.keys(series);
  const lastIndex = toIndex ?? series[tokens[0]].length - 1;
  const share = capital / tokens.length;
  const curve: number[] = [];
  for (let index = fromIndex; index <= lastIndex; index++) {
    let equity = 0;
    for (const token of tokens) {
      const start = series[token][fromIndex];
      const now = series[token][index];
      equity += start && now ? share * (1 - cost) * (now / start) : share;
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
