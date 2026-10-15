// Sita paper-trading engine (prototype).
//
// Runs one agent over hourly closes and returns its equity curve, trades and
// decision log. The real app will run this same logic once per hour on the
// server; a backtest is simply the same loop over past hours.
//
// Rules match docs/mvp-plan.md section 4:
//   Momentum:       buy when price > 48h average and up > 3% over 24h; sell when 3% below the average.
//   Mean reversion: buy when z score vs the 48h average < -2.5; sell when it is back to >= 0.5.
//
// Thresholds were tuned on 30 days of real data (2026-10-15). Faster settings
// (24h average, 1% entry) traded 100+ times a month and lost to the 0.5% cost.
//   Stop loss checked every hour against the average entry price (cost included).
//   Every fill pays 0.5% (fees + slippage).
(function (root) {
  "use strict";

  const COST_RATE = 0.005;
  const WARMUP_HOURS = 48;

  const STRATEGIES = {
    momentum: {
      label: "Momentum",
      decide(window, price, hasPosition) {
        const average = mean(window.slice(-48));
        const change24h = price / window[window.length - 25] - 1;
        const indicators = { average48h: average, change24h };
        const pct = formatPercent(change24h);
        const gap = formatPercent(price / average - 1);
        if (!hasPosition && price > average && change24h > 0.03) {
          return { action: "buy", indicators, reasoning: `Up ${pct} in 24h and ${gap} above the 48h average. Strong trend, buying.` };
        }
        if (hasPosition && price < average * 0.97) {
          return { action: "sell", indicators, reasoning: `Dropped to ${gap} versus the 48h average. Trend is broken, selling.` };
        }
        return {
          action: "hold",
          indicators,
          reasoning: hasPosition
            ? `Trend intact (${gap} versus the 48h average). Holding.`
            : `No strong trend (${pct} in 24h). Waiting.`,
        };
      },
    },
    mean_reversion: {
      label: "Mean reversion",
      decide(window, price, hasPosition) {
        const recent = window.slice(-48);
        const average = mean(recent);
        const deviation = standardDeviation(recent, average);
        const zScore = deviation > 0 ? (price - average) / deviation : 0;
        const indicators = { average48h: average, zScore };
        const z = zScore.toFixed(2);
        if (!hasPosition && zScore < -2.5) {
          return { action: "buy", indicators, reasoning: `Price is unusually far below its 48h average (z ${z}). Buying the dip.` };
        }
        if (hasPosition && zScore >= 0.5) {
          return { action: "sell", indicators, reasoning: `Price is back above its 48h average (z ${z}). Taking the rebound.` };
        }
        return {
          action: "hold",
          indicators,
          reasoning: hasPosition
            ? `Still below the 48h average (z ${z}). Waiting for the rebound.`
            : `Price is within the normal range (z ${z}). Waiting for a dip.`,
        };
      },
    },
  };

  /**
   * @param {object} options
   * @param {{symbol: string, closes: (number|null)[]}[]} options.tokens  aligned hourly closes
   * @param {"momentum"|"mean_reversion"} options.strategy
   * @param {number} options.capital            starting virtual USD
   * @param {number} options.maxPositionPct     max share of equity per token, 0 to 100
   * @param {number} options.stopLossPct        stop distance below entry, 0 to 100
   * @param {number} options.fromIndex          first hour the agent may act on
   * @param {number} [options.toIndex]          last hour (inclusive), defaults to the latest
   */
  function simulate(options) {
    // "custom" runs the user's rules (options.rules); the presets keep their own code.
    const custom = options.strategy === "custom";
    const strategy = STRATEGIES[options.strategy];
    const warmup = custom ? rulesLookback(options.rules) : WARMUP_HOURS;
    const lastIndex = options.toIndex ?? options.tokens[0].closes.length - 1;
    const maxShare = options.maxPositionPct / 100;
    const stopDistance = options.stopLossPct / 100;

    let cash = options.capital;
    const positions = {}; // symbol -> { quantity, entryPrice, openedIndex }
    const trades = [];
    const runs = [];

    for (let index = options.fromIndex; index <= lastIndex; index++) {
      const prices = {};
      for (const token of options.tokens) prices[token.symbol] = token.closes[index];
      const equityBefore = equityAt(cash, positions, prices);
      const decisions = [];

      for (const token of options.tokens) {
        const price = prices[token.symbol];
        const position = positions[token.symbol];
        const window = token.closes.slice(Math.max(0, index - warmup), index + 1);

        if (price == null || window.length <= warmup || window.some((value) => value == null)) {
          decisions.push({ symbol: token.symbol, action: "hold", reasoning: "Not enough price history yet. Waiting." });
          continue;
        }

        if (position && price <= position.entryPrice * (1 - stopDistance)) {
          cash += sell(trades, index, token.symbol, position, price, "stop_loss");
          delete positions[token.symbol];
          decisions.push({
            symbol: token.symbol,
            action: "sell",
            reasoning: `Stop loss hit: ${formatPercent(price / position.entryPrice - 1)} from entry. Selling everything.`,
          });
          continue;
        }

        // Custom exits that do not depend on indicators: take profit and max holding time.
        if (custom && position) {
          const takeProfit = options.rules.takeProfitPct;
          const maxHold = options.rules.maxHoldHours;
          if (takeProfit && price >= position.entryPrice * (1 + takeProfit / 100)) {
            cash += sell(trades, index, token.symbol, position, price, "take_profit");
            delete positions[token.symbol];
            decisions.push({ symbol: token.symbol, action: "sell", reasoning: `Take profit hit: ${formatPercent(price / position.entryPrice - 1)} from entry. Selling everything.` });
            continue;
          }
          if (maxHold && index - position.openedIndex >= maxHold) {
            cash += sell(trades, index, token.symbol, position, price, "max_hold");
            delete positions[token.symbol];
            decisions.push({ symbol: token.symbol, action: "sell", reasoning: `Held for ${maxHold} hours, the maximum. Selling.` });
            continue;
          }
        }

        const decision = custom ? evaluateRules(options.rules, window, Boolean(position)) : strategy.decide(window, price, Boolean(position));
        if (decision.action === "buy") {
          const notional = Math.min(cash, equityBefore * maxShare);
          if (notional < 1) {
            decisions.push({ symbol: token.symbol, action: "hold", reasoning: "Signal to buy, but no cash left. Holding." });
            continue;
          }
          const quantity = (notional * (1 - COST_RATE)) / price;
          cash -= notional;
          // Entry price includes the cost, so stops and PnL measure what was actually paid.
          positions[token.symbol] = { quantity, entryPrice: notional / quantity, openedIndex: index };
          trades.push({ index, symbol: token.symbol, side: "buy", quantity, price, costUsd: notional * COST_RATE, reason: "signal" });
        } else if (decision.action === "sell") {
          cash += sell(trades, index, token.symbol, position, price, "signal");
          delete positions[token.symbol];
        }
        decisions.push({ symbol: token.symbol, action: decision.action, reasoning: decision.reasoning, indicators: decision.indicators });
      }

      runs.push({ index, equity: equityAt(cash, positions, prices), cash, decisions });
    }

    const equities = runs.map((run) => run.equity);
    const finalEquity = equities[equities.length - 1] ?? options.capital;
    const closedTrades = pairRoundTrips(trades);
    return {
      runs,
      trades,
      positions,
      cash,
      finalEquity,
      returnPct: (finalEquity / options.capital - 1) * 100,
      maxDrawdownPct: maxDrawdown(equities) * 100,
      winRatePct: closedTrades.length ? (closedTrades.filter((profit) => profit > 0).length / closedTrades.length) * 100 : null,
      roundTrips: closedTrades.length,
    };
  }

  /** Equal-weight buy and hold of the same tokens, for comparison. */
  function buyAndHold(tokens, capital, fromIndex, toIndex) {
    const last = toIndex ?? tokens[0].closes.length - 1;
    const share = capital / tokens.length;
    const curve = [];
    for (let index = fromIndex; index <= last; index++) {
      let equity = 0;
      for (const token of tokens) {
        const start = token.closes[fromIndex];
        const now = token.closes[index];
        equity += start && now ? share * (1 - COST_RATE) * (now / start) : share;
      }
      curve.push(equity);
    }
    return { curve, returnPct: (curve[curve.length - 1] / capital - 1) * 100 };
  }

  function sell(trades, index, symbol, position, price, reason) {
    const gross = position.quantity * price;
    trades.push({ index, symbol, side: "sell", quantity: position.quantity, price, costUsd: gross * COST_RATE, reason, entryPrice: position.entryPrice });
    return gross * (1 - COST_RATE);
  }

  function pairRoundTrips(trades) {
    return trades.filter((trade) => trade.side === "sell").map((trade) => trade.price * (1 - COST_RATE) - trade.entryPrice);
  }

  function equityAt(cash, positions, prices) {
    let equity = cash;
    for (const symbol in positions) equity += positions[symbol].quantity * (prices[symbol] ?? positions[symbol].entryPrice);
    return equity;
  }

  function maxDrawdown(values) {
    let peak = -Infinity;
    let worst = 0;
    for (const value of values) {
      peak = Math.max(peak, value);
      worst = Math.max(worst, (peak - value) / peak);
    }
    return worst;
  }

  function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function standardDeviation(values, average) {
    return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
  }

  function formatPercent(fraction) {
    const value = (fraction * 100).toFixed(1);
    return `${fraction >= 0 ? "+" : ""}${value}%`;
  }

  // -------------------------------------------------------------------------
  // Custom strategies: rules built in the Forge
  //
  // rules = {
  //   entry: { join: "all" | "any", conditions: Condition[] },   1 to 3 conditions
  //   exit:  { join: "all" | "any", conditions: Condition[] },   0 to 3 conditions
  //   takeProfitPct: number | null,   sell when this far above entry
  //   maxHoldHours:  number | null,   sell after this many hours
  // }
  // Condition = { left: Indicator, op: "above" | "below" | "crossesAbove" | "crossesBelow",
  //               right: Indicator (+ optional offsetPct) | { kind: "value", value } }
  // Price-like indicators compare with each other; the others compare with a number.
  // -------------------------------------------------------------------------

  const INDICATORS = {
    price: { label: "Price", unit: "price", periods: null },
    sma: { label: "Average", unit: "price", periods: [12, 24, 48, 72] },
    high: { label: "Highest", unit: "price", periods: [12, 24, 48, 72] },
    low: { label: "Lowest", unit: "price", periods: [12, 24, 48, 72] },
    change: { label: "Change", unit: "pct", periods: [1, 4, 12, 24, 48, 72] },
    zscore: { label: "Z score", unit: "z", periods: [24, 48, 72] },
    rsi: { label: "RSI", unit: "rsi", periods: [14, 24] },
  };

  const OPERATORS = { above: "above", below: "below", crossesAbove: "crosses above", crossesBelow: "crosses below" };

  const RULE_TEMPLATES = {
    momentum: {
      entry: {
        join: "all",
        conditions: [
          { left: { kind: "price" }, op: "above", right: { kind: "sma", hours: 48 } },
          { left: { kind: "change", hours: 24 }, op: "above", right: { kind: "value", value: 3 } },
        ],
      },
      exit: { join: "any", conditions: [{ left: { kind: "price" }, op: "below", right: { kind: "sma", hours: 48, offsetPct: -3 } }] },
      takeProfitPct: null,
      maxHoldHours: null,
    },
    mean_reversion: {
      entry: { join: "all", conditions: [{ left: { kind: "zscore", hours: 48 }, op: "below", right: { kind: "value", value: -2.5 } }] },
      exit: { join: "any", conditions: [{ left: { kind: "zscore", hours: 48 }, op: "above", right: { kind: "value", value: 0.5 } }] },
      takeProfitPct: null,
      maxHoldHours: null,
    },
    // Checked on 30 days of real data: about 11 trades a month. A 24h version
    // traded 149 times and lost 36% to costs.
    breakout: {
      entry: { join: "all", conditions: [{ left: { kind: "price" }, op: "crossesAbove", right: { kind: "high", hours: 72 } }] },
      exit: { join: "any", conditions: [{ left: { kind: "price" }, op: "below", right: { kind: "sma", hours: 48, offsetPct: -2 } }] },
      takeProfitPct: 12,
      maxHoldHours: null,
    },
  };

  /** Hours of history the rules need (largest period, plus one hour for "crosses"). */
  function rulesLookback(rules) {
    let hours = 2;
    for (const condition of [...rules.entry.conditions, ...rules.exit.conditions]) {
      const cross = condition.op === "crossesAbove" || condition.op === "crossesBelow" ? 1 : 0;
      for (const side of [condition.left, condition.right]) {
        if (side.hours) hours = Math.max(hours, side.hours + 1 + cross);
      }
    }
    return hours;
  }

  /** Value of an indicator at the end of `window` (closes, oldest first). */
  function indicatorValue(indicator, window) {
    const price = window[window.length - 1];
    const recent = (hours) => window.slice(-hours);
    switch (indicator.kind) {
      case "price":
        return price;
      case "sma":
        return mean(recent(indicator.hours));
      case "high":
        return Math.max(...window.slice(-indicator.hours - 1, -1));
      case "low":
        return Math.min(...window.slice(-indicator.hours - 1, -1));
      case "change":
        return (price / window[window.length - 1 - indicator.hours] - 1) * 100;
      case "zscore": {
        const values = recent(indicator.hours);
        const average = mean(values);
        const deviation = standardDeviation(values, average);
        return deviation > 0 ? (price - average) / deviation : 0;
      }
      case "rsi": {
        const values = window.slice(-indicator.hours - 1);
        let gains = 0;
        let losses = 0;
        for (let i = 1; i < values.length; i++) {
          const move = values[i] - values[i - 1];
          if (move > 0) gains += move;
          else losses -= move;
        }
        return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
      }
      default:
        throw new Error(`Unknown indicator ${indicator.kind}`);
    }
  }

  function sideValue(side, window) {
    if (side.kind === "value") return side.value;
    return indicatorValue(side, window) * (1 + (side.offsetPct || 0) / 100);
  }

  function checkCondition(condition, window) {
    const left = sideValue(condition.left, window);
    const right = sideValue(condition.right, window);
    let met;
    if (condition.op === "above") met = left > right;
    else if (condition.op === "below") met = left < right;
    else {
      const previous = window.slice(0, -1);
      const leftBefore = sideValue(condition.left, previous);
      const rightBefore = sideValue(condition.right, previous);
      met = condition.op === "crossesAbove" ? leftBefore <= rightBefore && left > right : leftBefore >= rightBefore && left < right;
    }
    return { met, text: describeCondition(condition, left, right) };
  }

  function evaluateRules(rules, window, hasPosition) {
    const group = hasPosition ? rules.exit : rules.entry;
    if (!group.conditions.length) {
      return { action: "hold", reasoning: "Holding until take profit, stop loss or max holding time." };
    }
    const checks = group.conditions.map((condition) => checkCondition(condition, window));
    const met = group.join === "all" ? checks.every((check) => check.met) : checks.some((check) => check.met);
    if (met) {
      const reasons = checks.filter((check) => check.met).map((check) => check.text).join("; ");
      return hasPosition ? { action: "sell", reasoning: `Sell rule met: ${reasons}. Selling.` } : { action: "buy", reasoning: `Buy rule met: ${reasons}. Buying.` };
    }
    const missing = checks.find((check) => !check.met);
    return {
      action: "hold",
      reasoning: hasPosition ? `Holding. Not yet: ${missing.text}.` : `Waiting. Not yet: ${missing.text}.`,
    };
  }

  /** "price $735.20 above 48h average $721.00", "24h change +1.2% above +3.0%". */
  function describeCondition(condition, leftValue, rightValue) {
    // A plain number is shown in the unit of the indicator it is compared with.
    const unit = INDICATORS[condition.left.kind].unit;
    return `${describeSide(condition.left, leftValue, unit)} ${OPERATORS[condition.op]} ${describeSide(condition.right, rightValue, unit)}`;
  }

  function describeSide(side, value, unit) {
    if (side.kind === "value") return formatUnit(unit, value);
    const meta = INDICATORS[side.kind];
    const name = side.hours ? `${side.hours}h ${meta.label.toLowerCase()}` : meta.label.toLowerCase();
    const offset = side.offsetPct ? ` ${side.offsetPct > 0 ? "+" : "−"}${Math.abs(side.offsetPct)}%` : "";
    return `${name}${offset} ${formatUnit(meta.unit, value)}`;
  }

  function formatUnit(unit, value) {
    if (unit === "price") return `$${value >= 10 ? value.toFixed(2) : value.toPrecision(4)}`;
    if (unit === "pct") return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
    if (unit === "z") return value.toFixed(2);
    return value.toFixed(0);
  }

  /** Problems that stop a rule set from launching, in plain words. */
  function validateRules(rules) {
    const errors = [];
    if (!rules.entry.conditions.length) errors.push("Add at least one buy rule.");
    if (rules.entry.conditions.length > 3 || rules.exit.conditions.length > 3) errors.push("Use at most 3 rules per side.");
    if (!rules.exit.conditions.length && !rules.takeProfitPct && !rules.maxHoldHours) {
      errors.push("Add a sell rule, a take profit or a max holding time, or the agent only sells on its stop loss.");
    }
    for (const condition of [...rules.entry.conditions, ...rules.exit.conditions]) {
      if (condition.right.kind === "value" && !Number.isFinite(condition.right.value)) errors.push("Every number in a rule needs a value.");
    }
    return errors;
  }

  const api = {
    simulate,
    buyAndHold,
    STRATEGIES,
    COST_RATE,
    WARMUP_HOURS,
    INDICATORS,
    OPERATORS,
    RULE_TEMPLATES,
    rulesLookback,
    validateRules,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SitaEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
