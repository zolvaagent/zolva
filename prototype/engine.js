// Zolva paper-trading engine (prototype).
//
// Runs one agent over hourly closes and returns its equity curve, trades and
// decision log. The real app will run this same logic once per hour on the
// server; a backtest is simply the same loop over past hours.
//
// Rules match docs/mvp-plan.md section 4:
//   Momentum:       buy when price > 48h average and up > 3% over 24h; sell when 3% below the average.
//   Mean reversion: buy when z score vs the 48h average < -2.5; sell when it is back to >= 0.5.
//   Dip hunter:     the mean reversion signal on every market, one position at a time; while it
//                   holds nothing it buys only the market with the lowest z score.
//   Spike fade:     the only short strategy (paper only): short when z > 2.5, one position at a
//                   time, the market with the highest z score; cover when z is back to <= -0.5.
//                   A short's stop is the price rising stopLossPct above entry; shorts pay a
//                   10% yearly borrow rate, charged hourly.
//   Dip + fade:     long and short at once (perps, paper only): one long slot (the lowest z under
//                   -2.5, out at z >= 0.5) and one short slot (the highest z over 2.5, out at
//                   z <= -0.5), no long while down more than 5% over 7 days, no short while up
//                   more than 5%. Needs 168 hours of history.
//   Bounce short:   short only (perps, paper only), one position at a time: the market with the deepest
//                   7 day fall (more than 5% down) once its z score is back to 0.5 to 2.5, unless it rose
//                   more than 1.5% in the last 24 hours; cover at z <= -0.5. Needs 168 hours of history.
//
// Thresholds were tuned on 30 days of real data (2026-10-15). Faster settings
// (24h average, 1% entry) traded 100+ times a month and lost to the 0.5% cost.
//   Stop loss checked every hour against the average entry price (cost included).
//   Every fill pays 0.5% (fees + slippage).
(function (root) {
  "use strict";

  const COST_RATE = 0.005;
  const WARMUP_HOURS = 48;
  const SHORT_BORROW_APR = 0.1;
  // Perps (Lighter on Robinhood Chain, paper only): 0.05% per fill, and hourly funding
  // instead of the borrow rate, paid by the position itself (docs/perps-research.md).
  const PERPS_COST_RATE = 0.0005;
  // Dip + fade's trend filter: 7 days back, 5% either way.
  const TREND_HOURS = 168;
  const TREND_LIMIT = 0.05;
  // Bounce short: 7 day downtrend gate, bounce window in z, and the 24 hour reversal guard.
  const BOUNCE_ENTRY_Z = 0.5;
  const BOUNCE_MAX_ENTRY_Z = 2.5;
  const BOUNCE_EXIT_Z = -0.5;
  const BOUNCE_FAST_HOURS = 24;
  const BOUNCE_FAST_MAX = 0.015;
  // Share of the margin a leveraged short may lose before it is liquidated.
  const LIQUIDATION_LOSS = 0.95;
  // Volatility sizing (custom rules only): resize once a day when more than 25% off the wanted size.
  const RESIZE_BAND = 0.25;

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
  STRATEGIES.dip_hunter = { label: "Dip hunter", decide: STRATEGIES.mean_reversion.decide };
  STRATEGIES.spike_fade = {
    label: "Spike fade",
    decide(window, price, isShort) {
      const recent = window.slice(-48);
      const average = mean(recent);
      const deviation = standardDeviation(recent, average);
      const zScore = deviation > 0 ? (price - average) / deviation : 0;
      const indicators = { average48h: average, zScore };
      const z = zScore.toFixed(2);
      if (!isShort && zScore > 2.5) {
        return { action: "short", indicators, reasoning: `Price is unusually far above its 48h average (z ${z}). Shorting the spike.` };
      }
      if (isShort && zScore <= -0.5) {
        return { action: "cover", indicators, reasoning: `Price is back below its 48h average (z ${z}). Covering the short.` };
      }
      return {
        action: "hold",
        indicators,
        reasoning: isShort ? `Still above the level to cover (z ${z}). Staying short.` : `Price is within the normal range (z ${z}). Waiting for a spike.`,
      };
    },
  };

  // held: null, "long" or "short" (the position in this market).
  STRATEGIES.dip_fade = {
    label: "Dip + fade",
    decide(window, price, held) {
      const trend = price / window[window.length - 1 - TREND_HOURS] - 1;
      if (held === "long") {
        const signal = STRATEGIES.mean_reversion.decide(window, price, true);
        return { ...signal, indicators: { ...signal.indicators, trend7d: trend } };
      }
      if (held === "short") {
        const signal = STRATEGIES.spike_fade.decide(window, price, true);
        return { ...signal, indicators: { ...signal.indicators, trend7d: trend } };
      }
      const dip = STRATEGIES.mean_reversion.decide(window, price, false);
      const spike = STRATEGIES.spike_fade.decide(window, price, false);
      const indicators = { ...dip.indicators, trend7d: trend };
      const week = formatPercent(trend);
      if (dip.action === "buy") {
        return trend >= -TREND_LIMIT
          ? { ...dip, indicators }
          : { action: "hold", indicators, reasoning: `${dip.reasoning.replace(" Buying the dip.", "")} But it is ${week} over 7 days: no long against the trend.` };
      }
      if (spike.action === "short") {
        return trend <= TREND_LIMIT
          ? { ...spike, indicators }
          : { action: "hold", indicators, reasoning: `${spike.reasoning.replace(" Shorting the spike.", "")} But it is ${week} over 7 days: no short against the trend.` };
      }
      return { action: "hold", indicators, reasoning: `Price is within the normal range (z ${dip.indicators.zScore.toFixed(2)}). Waiting for a dip or a spike.` };
    },
  };

  STRATEGIES.bounce_short = {
    label: "Bounce short",
    decide(window, price, isShort) {
      const recent = window.slice(-48);
      const average = mean(recent);
      const deviation = standardDeviation(recent, average);
      const zScore = deviation > 0 ? (price - average) / deviation : 0;
      const trend = price / window[window.length - 1 - TREND_HOURS] - 1;
      const fast = price / window[window.length - 1 - BOUNCE_FAST_HOURS] - 1;
      const indicators = { average48h: average, zScore, trend7d: trend, change24h: fast };
      const z = zScore.toFixed(2);
      if (isShort) {
        return zScore <= BOUNCE_EXIT_Z
          ? { action: "cover", indicators, reasoning: `Price is back below its 48h average (z ${z}). Covering the short.` }
          : { action: "hold", indicators, reasoning: `Still above the level to cover (z ${z}). Staying short.` };
      }
      if (trend > -TREND_LIMIT) {
        return { action: "hold", indicators, reasoning: `Only ${formatPercent(trend)} over 7 days: no downtrend to short. Waiting.` };
      }
      if (zScore < BOUNCE_ENTRY_Z || zScore > BOUNCE_MAX_ENTRY_Z) {
        return { action: "hold", indicators, reasoning: `Down ${formatPercent(trend)} over 7 days, price at z ${z}. Waiting for a bounce.` };
      }
      if (fast > BOUNCE_FAST_MAX) {
        return { action: "hold", indicators, reasoning: `Bouncing (z ${z}) but already ${formatPercent(fast)} in 24h: a possible reversal, not shorting.` };
      }
      return { action: "short", indicators, reasoning: `Down ${formatPercent(trend)} over 7 days and bouncing to z ${z}. Shorting the bounce.` };
    },
  };

  /**
   * @param {object} options
   * @param {{symbol: string, closes: (number|null)[]}[]} options.tokens  aligned hourly closes
   * @param {"momentum"|"mean_reversion"|"dip_hunter"|"spike_fade"|"dip_fade"|"bounce_short"|"custom"} options.strategy
   * @param {number} options.capital            starting virtual USD
   * @param {number} options.maxPositionPct     max share of equity per token, 0 to 100
   * @param {number} options.stopLossPct        stop distance below entry, 0 to 100
   * @param {number} options.fromIndex          first hour the agent may act on
   * @param {number} [options.toIndex]          last hour (inclusive), defaults to the latest
   * @param {"dex"|"perps"} [options.venue]      perps: PERPS_COST_RATE and each token's funding
   *                                             (token.funding, signed fraction per hour, positive: longs pay)
   * @param {{kind: "volTarget", targetPct: number, hours: number}} [options.sizing]  custom rules only:
   *                                             buy equity x min(max %, target / realised volatility), and
   *                                             resize once a day (00:00 UTC) when more than 25% off
   * @param {number[]} [options.times]           hour start per index (unix seconds), default index x 3600
   */
  function simulate(options) {
    const perps = options.venue === "perps";
    const cost = perps ? PERPS_COST_RATE : COST_RATE;
    // "custom" runs the user's rules (options.rules); the presets keep their own code.
    const custom = options.strategy === "custom";
    const strategy = STRATEGIES[options.strategy];
    const sizing = custom ? options.sizing : undefined;
    const ruleWarmup = custom ? rulesLookback(options.rules) : options.strategy === "dip_fade" || options.strategy === "bounce_short" ? TREND_HOURS : WARMUP_HOURS;
    const warmup = sizing ? Math.max(ruleWarmup, sizing.hours + 1) : ruleWarmup;
    const lastIndex = options.toIndex ?? options.tokens[0].closes.length - 1;
    const maxShare = options.maxPositionPct / 100;
    const stopDistance = options.stopLossPct / 100;
    // Leveraged shorts (bounce short on perps only): a position of leverage x the margin put in,
    // stopped at the stop or liquidated earlier at LIQUIDATION_LOSS of the margin.
    const leverage = options.strategy === "bounce_short" && perps ? Math.max(1, options.leverage || 1) : 1;
    const shortStop = Math.min(stopDistance, LIQUIDATION_LOSS / leverage);

    let cash = options.capital;
    const positions = {}; // symbol -> { quantity, entryPrice, openedIndex, side? "short" }
    const trades = [];
    const runs = [];

    for (let index = options.fromIndex; index <= lastIndex; index++) {
      const prices = {};
      for (const token of options.tokens) prices[token.symbol] = token.closes[index];
      const equityBefore = equityAt(cash, positions, prices);
      const hourTime = options.times ? options.times[index] : index * 3600;
      const resizeHour = sizing !== undefined && hourTime % 86400 === 0;
      const decisions = [];
      // One position strategies: decided from the positions held at the start of the hour.
      // Dip + fade has one slot per side.
      const held = Object.values(positions);
      const holdsAny = held.length > 0;
      const holdsLong = held.some((position) => position.side !== "short");
      const holdsShort = held.some((position) => position.side === "short");
      const dipFade = options.strategy === "dip_fade";
      const deepestDip =
        (options.strategy === "dip_hunter" && !holdsAny) || (dipFade && !holdsLong) ? findExtreme(options.strategy, "buy", options.tokens, positions, index, warmup) : null;
      const shortOnly = options.strategy === "spike_fade" || options.strategy === "bounce_short";
      const strongestSpike =
        (shortOnly && !holdsAny) || (dipFade && !holdsShort) ? findExtreme(options.strategy, "short", options.tokens, positions, index, warmup) : null;

      // Borrow cost on shorts, for the hour that just passed, paid from the short's locked cash
      // (free cash may not go below zero): a lower entry lowers the short's value by the fee.
      // Perps pay or receive funding the same way: a long's quantity shrinks by the payment, a
      // short's entry moves by half of it.
      for (const token of options.tokens) {
        const position = positions[token.symbol];
        const price = prices[token.symbol];
        if (!position || price == null) continue;
        if (perps) {
          const rate = (token.funding && token.funding[index]) || 0;
          if (rate === 0) continue;
          positions[token.symbol] =
            position.margin !== undefined
              ? { ...position, margin: position.margin + position.quantity * price * rate }
              : position.side === "short"
                ? { ...position, entryPrice: position.entryPrice + (price * rate) / 2 }
                : { ...position, quantity: position.quantity * (1 - rate) };
        } else if (position.side === "short") {
          const fee = (position.quantity * price * SHORT_BORROW_APR) / (365 * 24);
          positions[token.symbol] = { ...position, entryPrice: position.entryPrice - fee / (2 * position.quantity) };
        }
      }

      for (const token of options.tokens) {
        const price = prices[token.symbol];
        const position = positions[token.symbol];
        const window = token.closes.slice(Math.max(0, index - warmup), index + 1);

        if (price == null || window.length <= warmup || window.some((value) => value == null)) {
          decisions.push({ symbol: token.symbol, action: "hold", reasoning: "Not enough price history yet. Waiting." });
          continue;
        }

        if (position && position.side === "short" && price >= position.entryPrice * (1 + (position.margin !== undefined ? shortStop : stopDistance))) {
          cash += cover(trades, index, token.symbol, position, price, "stop_loss", cost);
          delete positions[token.symbol];
          const liquidated = position.margin !== undefined && LIQUIDATION_LOSS / leverage < stopDistance;
          decisions.push({
            symbol: token.symbol,
            action: "cover",
            reasoning: liquidated
              ? `Liquidated: ${formatPercent(price / position.entryPrice - 1)} above the short entry at ${leverage}x. Covering everything.`
              : `Stop loss hit: ${formatPercent(price / position.entryPrice - 1)} above the short entry. Covering everything.`,
          });
          continue;
        }

        if (position && position.side !== "short" && price <= position.entryPrice * (1 - stopDistance)) {
          cash += sell(trades, index, token.symbol, position, price, "stop_loss", cost);
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
            cash += sell(trades, index, token.symbol, position, price, "take_profit", cost);
            delete positions[token.symbol];
            decisions.push({ symbol: token.symbol, action: "sell", reasoning: `Take profit hit: ${formatPercent(price / position.entryPrice - 1)} from entry. Selling everything.` });
            continue;
          }
          if (maxHold && index - position.openedIndex >= maxHold) {
            cash += sell(trades, index, token.symbol, position, price, "max_hold", cost);
            delete positions[token.symbol];
            decisions.push({ symbol: token.symbol, action: "sell", reasoning: `Held for ${maxHold} hours, the maximum. Selling.` });
            continue;
          }
        }

        const decision = custom
          ? evaluateRules(options.rules, window, Boolean(position))
          : dipFade
            ? strategy.decide(window, price, position ? (position.side === "short" ? "short" : "long") : null)
            : strategy.decide(window, price, Boolean(position));
        if (decision.action === "buy" && (options.strategy === "dip_hunter" || dipFade) && token.symbol !== deepestDip) {
          const reasoning = dipFade && holdsLong
            ? `${decision.reasoning.replace(" Buying the dip.", "")} Already long another market: one long at a time.`
            : !dipFade && holdsAny
            ? `${decision.reasoning.replace(" Buying the dip.", "")} Already holding another market: one position at a time.`
            : `${decision.reasoning.replace(" Buying the dip.", "")} Another market dipped deeper: buying that one instead.`;
          decisions.push({ symbol: token.symbol, action: "hold", reasoning, indicators: decision.indicators });
          continue;
        }
        if (decision.action === "short" && token.symbol !== strongestSpike) {
          const base = decision.reasoning.replace(/ Shorting the (spike|bounce)\./, "");
          const reasoning = dipFade && holdsShort
            ? `${base} Already short another market: one short at a time.`
            : !dipFade && holdsAny
            ? `${base} Already in another market: one position at a time.`
            : options.strategy === "bounce_short"
            ? `${base} Another market fell further over 7 days: shorting that one instead.`
            : `${base} Another market spiked higher: shorting that one instead.`;
          decisions.push({ symbol: token.symbol, action: "hold", reasoning, indicators: decision.indicators });
          continue;
        }
        if (decision.action === "short") {
          const notional = Math.min(cash, equityBefore * maxShare);
          if (notional < 1) {
            decisions.push({ symbol: token.symbol, action: "hold", reasoning: "Signal to short, but no cash left for the collateral. Holding." });
            continue;
          }
          cash -= notional;
          if (leverage > 1) {
            // The position is leverage x the margin put in; the opening cost is charged on the whole position.
            const exposure = notional * leverage;
            const quantity = exposure / price;
            positions[token.symbol] = { quantity, entryPrice: price, openedIndex: index, side: "short", margin: notional - exposure * cost };
            trades.push({ index, symbol: token.symbol, side: "short", quantity, price, costUsd: exposure * cost, reason: "signal" });
          } else {
            const quantity = (notional * (1 - cost)) / price;
            positions[token.symbol] = { quantity, entryPrice: price, openedIndex: index, side: "short" };
            trades.push({ index, symbol: token.symbol, side: "short", quantity, price, costUsd: notional * cost, reason: "signal" });
          }
        } else if (decision.action === "cover") {
          cash += cover(trades, index, token.symbol, position, price, "signal", cost);
          delete positions[token.symbol];
        } else if (decision.action === "buy") {
          const share = sizing ? wantedShare(sizing, window, maxShare).share : maxShare;
          const notional = Math.min(cash, equityBefore * share);
          if (notional < 1) {
            decisions.push({ symbol: token.symbol, action: "hold", reasoning: "Signal to buy, but no cash left. Holding." });
            continue;
          }
          const quantity = (notional * (1 - cost)) / price;
          cash -= notional;
          // Entry price includes the cost, so stops and PnL measure what was actually paid.
          positions[token.symbol] = { quantity, entryPrice: notional / quantity, openedIndex: index };
          trades.push({ index, symbol: token.symbol, side: "buy", quantity, price, costUsd: notional * cost, reason: "signal" });
        } else if (decision.action === "sell") {
          cash += sell(trades, index, token.symbol, position, price, "signal", cost);
          delete positions[token.symbol];
        }

        // Daily resize of a volatility sized position that is still open; the first entry price stays.
        const open = positions[token.symbol];
        if (resizeHour && open && open.side !== "short") {
          const target = wantedShare(sizing, window, maxShare);
          const wanted = equityAt(cash, positions, prices) * target.share;
          const held = open.quantity * price;
          if (wanted > 0 && Math.abs(held - wanted) > RESIZE_BAND * wanted) {
            const why = `Daily resize: volatility is ${(target.volatility * 100).toFixed(0)}% a year, so the target is ${(target.share * 100).toFixed(1)}% of equity`;
            if (held < wanted) {
              const spend = Math.min(cash, wanted - held);
              if (spend >= 1) {
                const quantity = (spend * (1 - cost)) / price;
                cash -= spend;
                positions[token.symbol] = { ...open, quantity: open.quantity + quantity };
                trades.push({ index, symbol: token.symbol, side: "buy", quantity, price, costUsd: spend * cost, reason: "resize" });
                decisions.push({ symbol: token.symbol, action: "buy", reasoning: `${decision.reasoning} ${why}: buying $${spend.toFixed(2)} more.`, indicators: decision.indicators });
                continue;
              }
            } else {
              const quantity = (held - wanted) / price;
              const gross = quantity * price;
              cash += gross * (1 - cost);
              positions[token.symbol] = { ...open, quantity: open.quantity - quantity };
              trades.push({ index, symbol: token.symbol, side: "sell", quantity, price, costUsd: gross * cost, reason: "resize", entryPrice: open.entryPrice });
              decisions.push({ symbol: token.symbol, action: "sell", reasoning: `${decision.reasoning} ${why}: selling $${gross.toFixed(2)}.`, indicators: decision.indicators });
              continue;
            }
          }
        }
        decisions.push({ symbol: token.symbol, action: decision.action, reasoning: decision.reasoning, indicators: decision.indicators });
      }

      runs.push({ index, equity: equityAt(cash, positions, prices), cash, decisions });
    }

    const equities = runs.map((run) => run.equity);
    const finalEquity = equities[equities.length - 1] ?? options.capital;
    const closedTrades = pairRoundTrips(trades, cost);
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

  /**
   * The one market a one-position strategy may enter this hour, among those not held: for a
   * buy the lowest z score below the entry level (dip hunter, dip + fade's long), for a short
   * the highest above it (spike fade, dip + fade's short).
   */
  function findExtreme(strategyKey, entry, tokens, positions, index, warmup) {
    const sign = entry === "buy" ? 1 : -1;
    let best = null;
    for (const token of tokens) {
      if (positions[token.symbol]) continue;
      const price = token.closes[index];
      const window = token.closes.slice(Math.max(0, index - warmup), index + 1);
      if (price == null || window.length <= warmup || window.some((value) => value == null)) continue;
      const decision = STRATEGIES[strategyKey].decide(window, price, strategyKey === "dip_fade" ? null : false);
      // Bounce short enters the market with the deepest 7 day fall; the others rank on the z score.
      const score = strategyKey === "bounce_short" ? decision.indicators.trend7d : sign * decision.indicators.zScore;
      if (decision.action === entry && (!best || score < best.score)) best = { symbol: token.symbol, score };
    }
    return best ? best.symbol : null;
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

  function sell(trades, index, symbol, position, price, reason, cost) {
    const gross = position.quantity * price;
    trades.push({ index, symbol, side: "sell", quantity: position.quantity, price, costUsd: gross * cost, reason, entryPrice: position.entryPrice });
    return gross * (1 - cost);
  }

  /** Closes a short: returns the cash it locked plus its gain, minus the cost. */
  function cover(trades, index, symbol, position, price, reason, cost) {
    const gross = position.quantity * price;
    trades.push({ index, symbol, side: "cover", quantity: position.quantity, price, costUsd: gross * cost, reason, entryPrice: position.entryPrice });
    return Math.max(0, shortValue(position, price) - gross * cost);
  }

  /** What an open short is worth: the cash it locked plus its gain; a leveraged short cannot lose more than its margin. */
  function shortValue(position, price) {
    return position.margin === undefined
      ? position.quantity * (2 * position.entryPrice - price)
      : Math.max(0, position.margin + position.quantity * (position.entryPrice - price));
  }

  /** Annualised volatility of the last `hours` hourly log returns at the end of `window`. */
  function realisedVolatility(window, hours) {
    const closes = window.slice(-hours - 1);
    const returns = [];
    for (let i = 1; i < closes.length; i++) returns.push(Math.log(closes[i] / closes[i - 1]));
    const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + value * value, 0) / returns.length - average * average;
    return Math.sqrt(Math.max(0, variance) * 8760);
  }

  /** Share of equity a volatility sized agent wants in one market, capped by the max position share. */
  function wantedShare(sizing, window, maxShare) {
    const volatility = realisedVolatility(window, sizing.hours);
    return { share: volatility > 0 ? Math.min(maxShare, sizing.targetPct / 100 / volatility) : maxShare, volatility };
  }

  // A resize is not a round trip: only full exits count toward the win rate.
  function pairRoundTrips(trades, cost) {
    return trades
      .filter((trade) => (trade.side === "sell" || trade.side === "cover") && trade.reason !== "resize")
      .map((trade) => (trade.side === "sell" ? trade.price * (1 - cost) - trade.entryPrice : trade.entryPrice - trade.price * (1 + cost)));
  }

  function equityAt(cash, positions, prices) {
    let equity = cash;
    for (const symbol in positions) {
      const position = positions[symbol];
      const price = prices[symbol] ?? position.entryPrice;
      // A short is worth the cash it locked plus its gain.
      equity += position.side === "short" ? shortValue(position, price) : position.quantity * price;
    }
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
    zscore: { label: "Z score", unit: "z", periods: [24, 48, 72, 96] },
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
    realisedVolatility,
    validateRules,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ZolvaEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
