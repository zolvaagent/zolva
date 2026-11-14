/**
 * One decision explained in plain words, for the decision log's "Details" (and the public API).
 * Deterministic templates built from the agent's params and the values stored with the decision
 * (price, checks, position, indicators): exact, free and instant, never AI.
 */
import type { AgentParams, Decision } from "./engine.ts";
import { describeCondition, type Condition, type Indicator, type RuleGroup, type Rules } from "./rules.ts";
import { BOUNCE_SHORT, DIP_FADE, MEAN_REVERSION, MOMENTUM, SPIKE_FADE, type RuleCheck } from "./strategies.ts";

export type Explanation = {
  /** Short paragraphs in plain words: what it waits for or why it keeps the position, then the risk limits. */
  paragraphs: string[];
  /** Custom rules only: each condition of the checked group, with its values. */
  checks: { text: string; met: boolean }[];
};

/** Null when the decision has nothing more to explain than its one line (or was stored before details existed). */
export function explainDecision(decision: Decision, params: AgentParams, symbol: string): Explanation | null {
  // Decisions stored before 2026-11-14 have no price or position, so "waiting" and "holding"
  // cannot be told apart: no details rather than a wrong explanation.
  if (decision.price === undefined) return null;
  const paragraphs: string[] = [];
  let checks: Explanation["checks"] = [];

  const custom = params.strategy === "custom" && params.rules ? explainRules(decision, params.rules, symbol) : null;
  if (custom) {
    paragraphs.push(...custom.paragraphs);
    checks = custom.checks;
  } else if (params.strategy !== "custom") {
    paragraphs.push(...explainPreset(decision, params, symbol));
  }
  if (!paragraphs.length) return null;

  paragraphs.push(...riskLines(decision, params, symbol));
  if (decision.ai) {
    paragraphs.push(
      decision.ai.verdict === "approved"
        ? `The AI co-pilot reviewed the signal and approved it: ${decision.ai.reasoning}`
        : `The AI co-pilot reviewed the signal and passed on it, so no trade was made: ${decision.ai.reasoning}`,
    );
  }
  return { paragraphs, checks };
}

// ---------------------------------------------------------------------------
// Custom rules
// ---------------------------------------------------------------------------

function explainRules(decision: Decision, rules: Rules, symbol: string): { paragraphs: string[]; checks: Explanation["checks"] } | null {
  if (decision.price === undefined || !decision.checks) return null;
  const { entry, exit } = rules;
  if (decision.position?.side === "short") return explainShort(decision, rules, symbol);
  // The engine checks the exit group while holding and the entry group while flat.
  const group = decision.position ? exit : entry;
  if (group.conditions.length !== decision.checks.length) return null;
  const pairs = group.conditions.map((condition, i) => ({ condition, check: decision.checks![i] }));
  const checks = pairs.map(({ condition, check }) => ({ text: valuesText(condition, check), met: check.met }));
  const paragraphs: string[] = [];

  if (!decision.position) {
    paragraphs.push(`${rulesIntro(entry)}`);
    if (decision.action === "buy") {
      paragraphs.push(`It bought ${symbol} because ${list(pairs.filter((pair) => pair.check.met).map((pair) => goal(pair.condition, pair.check, symbol, "now")))}.`);
    } else {
      paragraphs.push(...waiting(pairs, entry.join, symbol, rules.shortEntry ? "" : "It holds cash until then."));
      // Lab perps rules can also short: what that side waits for.
      const shortGroup = rules.shortEntry;
      if (shortGroup && decision.shortChecks?.length === shortGroup.conditions.length) {
        const shortPairs = shortGroup.conditions.map((condition, i) => ({ condition, check: decision.shortChecks![i] }));
        if (decision.action === "short") {
          paragraphs.push(`It shorted ${symbol} because ${list(shortPairs.filter((pair) => pair.check.met).map((pair) => goal(pair.condition, pair.check, symbol, "now")))}.`);
        } else {
          paragraphs.push(...waiting(shortPairs, shortGroup.join, symbol, "It holds cash until one side is met.", "shorts"));
        }
        checks.push(...shortPairs.map(({ condition, check }) => ({ text: `short: ${valuesText(condition, check)}`, met: check.met })));
      }
    }
  } else {
    const change = decision.price / decision.position.entryPrice - 1;
    paragraphs.push(`It holds ${symbol}, bought at ${money(decision.position.entryPrice)} (${signedPct(change)} since).`);
    if (decision.action === "sell") {
      paragraphs.push(`It sold ${symbol} because ${list(pairs.filter((pair) => pair.check.met).map((pair) => goal(pair.condition, pair.check, symbol, "now")))}.`);
    } else if (!exit.conditions.length) {
      paragraphs.push("It has no sell rule: it sells only on the stop loss, take profit or max holding time.");
    } else {
      paragraphs.push(...waiting(pairs, exit.join, symbol, "Until then it keeps the position.", "sells"));
    }
  }
  return { paragraphs, checks };
}

/** A Lab rules short: why it keeps the short, or why it covered. */
function explainShort(decision: Decision, rules: Rules, symbol: string): { paragraphs: string[]; checks: Explanation["checks"] } | null {
  const group = rules.shortExit;
  const position = decision.position!;
  const paragraphs = [`It is short ${symbol} from ${money(position.entryPrice)} (the short is ${signedPct(1 - decision.price! / position.entryPrice)} since).`];
  if (!group?.conditions.length || group.conditions.length !== decision.checks!.length) {
    paragraphs.push("It has no cover rule: it covers only on the stop loss.");
    return { paragraphs, checks: [] };
  }
  const pairs = group.conditions.map((condition, i) => ({ condition, check: decision.checks![i] }));
  if (decision.action === "cover") {
    paragraphs.push(`It covered because ${list(pairs.filter((pair) => pair.check.met).map((pair) => goal(pair.condition, pair.check, symbol, "now")))}.`);
  } else {
    paragraphs.push(...waiting(pairs, group.join, symbol, "Until then it keeps the short.", "covers"));
  }
  return { paragraphs, checks: pairs.map(({ condition, check }) => ({ text: valuesText(condition, check), met: check.met })) };
}

/** "This agent buys breakouts: …", from the shape of the entry rules. */
function rulesIntro(entry: RuleGroup): string {
  const kinds = entry.conditions.map((condition) => ({ op: condition.op, right: condition.right.kind, left: condition.left.kind }));
  if (kinds.some((k) => k.left === "price" && k.right === "high" && (k.op === "crossesAbove" || k.op === "above"))) return "This agent buys breakouts: it waits for the price to climb above its recent high.";
  if (kinds.some((k) => k.left === "zscore" && k.op === "below")) return "This agent buys unusual dips: it waits for the price to fall far below its recent average.";
  if (kinds.some((k) => k.left === "rsi" && k.op === "below")) return "This agent buys oversold markets: it waits for the RSI to drop.";
  if (kinds.some((k) => k.left === "change" && k.op === "above")) return "This agent buys momentum: it waits for a strong rise.";
  if (kinds.some((k) => k.left === "price" && k.right === "sma" && (k.op === "above" || k.op === "crossesAbove"))) return "This agent follows the trend: it buys while the price is above its average.";
  return "This agent buys when its rules are met.";
}

/** The unmet conditions as goals, then the met ones as "already met". */
function waiting(pairs: { condition: Condition; check: RuleCheck }[], join: "all" | "any", symbol: string, until: string, verb: "buys" | "sells" | "shorts" | "covers" = "buys"): string[] {
  const open = pairs.filter((pair) => !pair.check.met);
  const done = pairs.filter((pair) => pair.check.met);
  const lines: string[] = [];
  if (join === "any" && open.length > 1) {
    lines.push(`It ${verb} as soon as any of these happens: ${open.map((pair) => goal(pair.condition, pair.check, symbol, "until")).join("; ")}.`);
  } else {
    const waits = { buys: "waits", sells: "waits to sell", shorts: "would short", covers: "waits to cover" }[verb];
    for (const pair of open) lines.push(`It ${waits} ${verb === "shorts" ? "once" : "until"} ${goal(pair.condition, pair.check, symbol, "until")}.`);
  }
  if (until) lines.push(until);
  if (done.length && join === "all") {
    lines.push(`${done.length === 1 ? "Its other rule" : "Its other rules"} (${done.map((pair) => describeCondition(pair.condition)).join("; ")}) ${done.length === 1 ? "is" : "are"} already met.`);
  }
  return lines;
}

/**
 * One condition as a goal with its distance: "NVDA rises above its highest price of the last
 * 3 days ($177.07). NVDA is at $162.25, so it would need to climb about 9.1% first".
 */
function goal(condition: Condition, check: RuleCheck, symbol: string, mode: "until" | "now"): string {
  const { left, right } = check;
  const up = condition.op === "above" || condition.op === "crossesAbove";
  const leftKind = condition.left.kind;
  const rightSide = condition.right;

  if (leftKind === "price" && rightSide.kind !== "value") {
    const name = lineName(rightSide);
    const target = `${name} (${money(right)})`;
    if (mode === "now") return `${symbol} ${up ? "rose above" : "fell below"} ${target}, at ${money(left)}`;
    const distance = Math.abs(right / left - 1) * 100;
    return up
      ? `${symbol} rises above ${target}. ${symbol} is at ${money(left)}, so it would need to climb about ${pct(distance)} first`
      : `${symbol} falls below ${target}. ${symbol} is at ${money(left)}, about ${pct(distance)} above that`;
  }
  const hours = condition.left.hours ?? 0;
  const value = rightSide.kind === "value" ? rightSide.value : right;
  if (leftKind === "change") {
    const what = `${symbol} has ${value >= 0 ? "risen" : "fallen"} ${up ? "more than" : "less than"} ${pct(Math.abs(value))} over the last ${span(hours)}`;
    return mode === "now" ? `${what} (it moved ${signedPct(left / 100)})` : `${what}. Right now it is ${signedPct(left / 100)}`;
  }
  if (leftKind === "zscore") {
    const what = `${symbol}'s price is ${up ? "unusually far above" : "unusually far below"} its ${spanAdjective(hours)} average (z score ${up ? "above" : "below"} ${signed(value)})`;
    return mode === "now" ? `${what}, at z ${signed(round(left, 2))}` : `${what}. Right now the z score is ${signed(round(left, 2))}`;
  }
  if (leftKind === "funding7d") {
    const rate = signedPct(left / 100);
    return mode === "now" ? `${describeCondition(condition, left)}` : `funding over the last 7 days is ${up ? "zero or positive" : "negative"}. Right now it is ${rate} a year`;
  }
  if (leftKind === "rsi") {
    const what = `the ${spanAdjective(hours)} RSI is ${up ? "above" : "below"} ${value}`;
    return mode === "now" ? `${what} (at ${round(left, 0)})` : `${what}. Right now it is ${round(left, 0)}`;
  }
  // Rare shapes (an average against a high, and so on): the rule itself with its values.
  return valuesText(condition, check);
}

/** "its highest price of the last 3 days", "3% above its 50-day average". */
function lineName(side: Indicator): string {
  const hours = side.hours ?? 0;
  const base =
    side.kind === "high"
      ? `its highest price of the last ${span(hours)}`
      : side.kind === "low"
        ? `its lowest price of the last ${span(hours)}`
        : side.kind === "sma"
          ? `its ${spanAdjective(hours)} average`
          : "the price";
  const offset = side.offsetPct ?? 0;
  return offset ? `${pct(Math.abs(offset))} ${offset > 0 ? "above" : "below"} ${base}` : base;
}

function valuesText(condition: Condition, check: RuleCheck): string {
  return describeCondition(condition, check.left, check.right);
}

// ---------------------------------------------------------------------------
// Presets: built from the indicators each strategy already stores
// ---------------------------------------------------------------------------

function explainPreset(decision: Decision, params: AgentParams, symbol: string): string[] {
  const indicators = decision.indicators ?? {};
  const z = indicators.zScore;
  const average = indicators.average48h;
  const holding = Boolean(decision.position);
  const short = decision.position?.side === "short";
  switch (params.strategy) {
    case "momentum": {
      if (average === undefined || indicators.change24h === undefined) return [];
      const change = signedPct(indicators.change24h);
      return holding
        ? [
            "This agent rides strong trends.",
            `It sells if ${symbol} falls ${pct(MOMENTUM.exitBelowAverage * 100)} below its 48-hour average, to about ${money(average * (1 - MOMENTUM.exitBelowAverage))}. The average is ${money(average)} now.`,
          ]
        : [
            "This agent rides strong trends.",
            `It buys when ${symbol} is up more than ${pct(MOMENTUM.entryChange24h * 100)} over 24 hours and above its 48-hour average (${money(average)}). Right now ${symbol} is ${change} over 24 hours.`,
            "It holds cash until then.",
          ];
    }
    case "mean_reversion":
    case "dip_hunter": {
      if (z === undefined) return [];
      const intro = params.strategy === "dip_hunter" ? "This agent buys the deepest unusual dip among its markets, one at a time." : "This agent buys unusual dips.";
      return holding
        ? [intro, `It sells once ${symbol} is back near its 48-hour average (z score ${signed(MEAN_REVERSION.exitZ)} or higher). Right now the z score is ${signed(round(z, 2))}.`]
        : [intro, `It buys when ${symbol} falls far below its 48-hour average${average ? ` (${money(average)})` : ""}: a z score below ${signed(MEAN_REVERSION.entryZ)}. Right now the z score is ${signed(round(z, 2))}.`, "It holds cash until then."];
    }
    case "spike_fade": {
      if (z === undefined) return [];
      return holding
        ? ["This agent shorts unusual spikes.", `It covers once ${symbol} is back near its 48-hour average (z score ${signed(SPIKE_FADE.exitZ)} or lower). Right now the z score is ${signed(round(z, 2))}.`]
        : ["This agent shorts unusual spikes.", `It shorts when ${symbol} rises far above its 48-hour average: a z score above ${signed(SPIKE_FADE.entryZ)}. Right now the z score is ${signed(round(z, 2))}.`, "It holds cash until then."];
    }
    case "dip_fade": {
      if (z === undefined || indicators.trend7d === undefined) return [];
      return [
        "This agent buys unusual dips and shorts unusual spikes, one of each at a time, and never against a strong 7 day trend.",
        `${symbol} is at a z score of ${signed(round(z, 2))} against its 48-hour average and ${signedPct(indicators.trend7d)} over 7 days. It buys below z ${signed(MEAN_REVERSION.entryZ)} (not while down more than ${pct(DIP_FADE.trendLimit * 100)} over 7 days) and shorts above z ${signed(SPIKE_FADE.entryZ)} (not while up more than ${pct(DIP_FADE.trendLimit * 100)}).`,
      ];
    }
    case "bounce_short": {
      if (z === undefined || indicators.trend7d === undefined) return [];
      return short
        ? ["This agent shorts bounces inside downtrends.", `It covers once ${symbol} falls back to a z score of ${signed(BOUNCE_SHORT.exitZ)} or lower against its 48-hour average. Right now it is ${signed(round(z, 2))}.`]
        : [
            "This agent shorts bounces inside downtrends.",
            `It shorts a market that is down more than ${pct(BOUNCE_SHORT.trendLimit * 100)} over 7 days once it bounces back above its 48-hour average. ${symbol} is ${signedPct(indicators.trend7d)} over 7 days, at a z score of ${signed(round(z, 2))}.`,
          ];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Risk limits while holding
// ---------------------------------------------------------------------------

function riskLines(decision: Decision, params: AgentParams, symbol: string): string[] {
  const position = decision.position;
  if (!position || decision.price === undefined) return [];
  // Already closed this hour: the reasoning says why.
  if ((decision.action === "sell" && position.side !== "short") || decision.action === "cover") return [];
  const lines: string[] = [];
  const stop = params.stopLossPct / 100;
  if (position.side === "short") {
    const level = (position.stopPrice ?? position.entryPrice) * (1 + stop);
    lines.push(`If ${symbol} rises to ${money(level)}, ${pct(params.stopLossPct)} above where it shorted, the stop loss covers everything. That is ${pct((level / decision.price - 1) * 100)} above today's price.`);
    return lines;
  }
  const level = position.entryPrice * (1 - stop);
  lines.push(`If ${symbol} falls to ${money(level)}, about ${pct(params.stopLossPct)} below where it bought, the stop loss sells everything. That is ${pct((1 - level / decision.price) * 100)} below today's price.`);
  const takeProfit = params.strategy === "custom" ? params.rules?.takeProfitPct : null;
  if (takeProfit) lines.push(`If it rises to ${money(position.entryPrice * (1 + takeProfit / 100))}, ${pct(takeProfit)} above where it bought, it takes the profit.`);
  const maxHold = params.strategy === "custom" ? params.rules?.maxHoldHours : null;
  if (maxHold && position.heldHours !== null) {
    const left = Math.max(0, maxHold - position.heldHours);
    lines.push(`It has held for ${position.heldHours} hours of its ${maxHold} hour maximum, so it sells in ${left} hours at the latest.`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function money(value: number): string {
  return `$${value >= 10 ? value.toFixed(2) : value.toPrecision(4)}`;
}

function pct(value: number): string {
  return `${Number(value.toFixed(1))}%`;
}

function signedPct(fraction: number): string {
  const value = fraction * 100;
  return `${value >= 0 ? "+" : "−"}${Math.abs(Number(value.toFixed(1)))}%`;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}`;
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function span(hours: number): string {
  return hours % 24 === 0 && hours >= 48 ? `${hours / 24} days` : `${hours} hours`;
}

function spanAdjective(hours: number): string {
  return hours % 24 === 0 && hours >= 48 ? `${hours / 24}-day` : `${hours}-hour`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "its rule was met";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
