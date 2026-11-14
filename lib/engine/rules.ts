/**
 * Custom strategies: rules a user builds in the Studio.
 *
 * Same semantics as prototype/engine.js (a Vitest parity test keeps them in
 * step). Momentum and Mean reversion also exist as templates in this format,
 * so users can start from a preset and change it.
 */
import { formatPercent, mean, type Signal } from "./strategies.ts";

export type IndicatorKind = "price" | "sma" | "high" | "low" | "change" | "zscore" | "rsi";
export type Operator = "above" | "below" | "crossesAbove" | "crossesBelow";

/**
 * Lab only (never accepted by parseRules, so users cannot pick it): the 7 day average perps
 * funding rate, annualised, in percent. Positive: longs pay shorts.
 */
export type LabIndicatorKind = "funding7d";
export type Indicator = { kind: IndicatorKind | LabIndicatorKind; hours?: number; offsetPct?: number };
export type ValueSide = { kind: "value"; value: number };
export type Condition = { left: Indicator; op: Operator; right: Indicator | ValueSide };
export type RuleGroup = { join: "all" | "any"; conditions: Condition[] };

export type Rules = {
  entry: RuleGroup;
  exit: RuleGroup;
  /**
   * Lab only, perps only (never accepted by parseRules): open a short when this group is met while
   * flat (checked after the long entry), and cover it when `shortExit` is met.
   */
  shortEntry?: RuleGroup;
  shortExit?: RuleGroup;
  /** Sell when this far above entry, in percent. */
  takeProfitPct: number | null;
  /** Sell after holding this many hours. */
  maxHoldHours: number | null;
};

type Unit = "price" | "pct" | "z" | "rsi";

export const INDICATORS: Record<IndicatorKind, { label: string; unit: Unit; periods: number[] | null }> = {
  price: { label: "Price", unit: "price", periods: null },
  sma: { label: "Average", unit: "price", periods: [12, 24, 48, 72] },
  high: { label: "Highest", unit: "price", periods: [12, 24, 48, 72] },
  low: { label: "Lowest", unit: "price", periods: [12, 24, 48, 72] },
  change: { label: "Change", unit: "pct", periods: [1, 4, 12, 24, 48, 72] },
  zscore: { label: "Z score", unit: "z", periods: [24, 48, 72, 96] },
  rsi: { label: "RSI", unit: "rsi", periods: [14, 24] },
};

/** Funding over 7 days (168 hours), in % a year. */
export const FUNDING_HOURS = 168;
const FUNDING_META = { label: "7d funding", unit: "pct" as Unit, periods: null };

/** Label, unit and periods of any indicator, the Lab-only funding one included. */
export function indicatorMeta(kind: Indicator["kind"]): { label: string; unit: Unit; periods: number[] | null } {
  return kind === "funding7d" ? FUNDING_META : INDICATORS[kind];
}

export const OPERATORS: Record<Operator, string> = {
  above: "above",
  below: "below",
  crossesAbove: "crosses above",
  crossesBelow: "crosses below",
};

export const RULE_TEMPLATES: Record<"momentum" | "mean_reversion" | "breakout", Rules> = {
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

export const MAX_CONDITIONS = 3;
export const MAX_LOOKBACK_HOURS = 168;
/** Largest shift of a price line, in percent either way. */
export const MAX_OFFSET_PCT = 50;
export const TAKE_PROFIT_RANGE = { min: 1, max: 500 } as const;
export const MAX_HOLD_RANGE = { min: 1, max: 24 * 30 } as const;

/**
 * Every message parseRules can return, in one place so /docs/rules lists them all
 * (lib/docs-reference/rules.test.ts fails when one is missing there).
 */
export const RULE_ERRORS = {
  tooManyConditions: (side: "buy" | "sell") => `Use at most ${MAX_CONDITIONS} ${side} rules.`,
  noBuyRule: "Add at least one buy rule.",
  noWayToSell: "Add a sell rule, a take profit or a max holding time, or the agent only sells on its stop loss.",
  lookbackTooLong: "Rules may look back at most 7 days.",
  unknownIndicator: "A rule has an unknown indicator.",
  unknownComparison: "A rule has an unknown comparison.",
  priceAgainstNumber: "Compare prices with another price line, not a plain number.",
  missingNumber: "Every number in a rule needs a value.",
  onlyPriceLines: "Only price lines can be compared with each other.",
  outOfRange: (name: "Take profit" | "Max holding time", min: number, max: number) => `${name} must be between ${min} and ${max}.`,
} as const;

/** Hours of history the rules need (largest period, plus one for "crosses"). */
export function rulesLookback(rules: Rules): number {
  let hours = 2;
  const groups = [rules.entry, rules.exit, rules.shortEntry, rules.shortExit].filter((group): group is RuleGroup => Boolean(group));
  for (const condition of groups.flatMap((group) => group.conditions)) {
    const cross = condition.op === "crossesAbove" || condition.op === "crossesBelow" ? 1 : 0;
    for (const side of [condition.left, condition.right]) {
      if ("hours" in side && side.hours) hours = Math.max(hours, side.hours + 1 + cross);
    }
  }
  return hours;
}

/**
 * Value of an indicator at the end of `window` (closes, oldest first). `funding` is the same hours'
 * perps funding (signed fraction per hour, null counts as 0); only funding7d reads it.
 */
export function indicatorValue(indicator: Indicator, window: number[], funding?: (number | null)[]): number {
  const price = window[window.length - 1];
  const hours = indicator.hours ?? 0;
  switch (indicator.kind) {
    case "funding7d": {
      const rates = (funding ?? []).slice(-FUNDING_HOURS);
      return (rates.reduce((sum: number, rate) => sum + (rate ?? 0), 0) * 365 * 100) / 7;
    }
    case "price":
      return price;
    case "sma":
      return mean(window.slice(-hours));
    case "high":
      return Math.max(...window.slice(-hours - 1, -1));
    case "low":
      return Math.min(...window.slice(-hours - 1, -1));
    case "change":
      return (price / window[window.length - 1 - hours] - 1) * 100;
    case "zscore": {
      const values = window.slice(-hours);
      const average = mean(values);
      const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
      return deviation > 0 ? (price - average) / deviation : 0;
    }
    case "rsi": {
      const values = window.slice(-hours - 1);
      let gains = 0;
      let losses = 0;
      for (let i = 1; i < values.length; i++) {
        const move = values[i] - values[i - 1];
        if (move > 0) gains += move;
        else losses -= move;
      }
      return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
    }
  }
}

function sideValue(side: Indicator | ValueSide, window: number[], funding?: (number | null)[]): number {
  if (side.kind === "value") return side.value;
  return indicatorValue(side, window, funding) * (1 + (side.offsetPct ?? 0) / 100);
}

export function checkCondition(condition: Condition, window: number[], funding?: (number | null)[]): { met: boolean; text: string; left: number; right: number } {
  const left = sideValue(condition.left, window, funding);
  const right = sideValue(condition.right, window, funding);
  let met: boolean;
  if (condition.op === "above") met = left > right;
  else if (condition.op === "below") met = left < right;
  else {
    const previous = window.slice(0, -1);
    const previousFunding = funding?.slice(0, -1);
    const leftBefore = sideValue(condition.left, previous, previousFunding);
    const rightBefore = sideValue(condition.right, previous, previousFunding);
    met = condition.op === "crossesAbove" ? leftBefore <= rightBefore && left > right : leftBefore >= rightBefore && left < right;
  }
  return { met, text: describeCondition(condition, left, right), left, right };
}

/** The decision for one token from its rules; take profit and max hold are handled by the engine. */
/**
 * @param held      true while long, "short" while short (Lab perps rules only), false while flat
 * @param funding   the same hours' perps funding, for funding7d
 */
export function evaluateRules(rules: Rules, window: number[], held: boolean | "short", funding?: (number | null)[]): Signal {
  if (held === "short") {
    const cover = rules.shortExit;
    if (!cover?.conditions.length) return { action: "hold", reasoning: "Holding the short until its stop loss.", indicators: {} };
    const result = checkGroup(cover, window, funding);
    return result.met
      ? { action: "cover", reasoning: `Cover rule met: ${result.reasons}. Covering.`, indicators: {}, checks: result.values }
      : { action: "hold", reasoning: `Holding the short. Not yet: ${result.missing}.`, indicators: {}, checks: result.values };
  }
  const hasPosition = held === true;
  const group = hasPosition ? rules.exit : rules.entry;
  if (!group.conditions.length) {
    return { action: "hold", reasoning: "Holding until take profit, stop loss or max holding time.", indicators: {} };
  }
  const result = checkGroup(group, window, funding);
  if (result.met) {
    return hasPosition
      ? { action: "sell", reasoning: `Sell rule met: ${result.reasons}. Selling.`, indicators: {}, checks: result.values }
      : { action: "buy", reasoning: `Buy rule met: ${result.reasons}. Buying.`, indicators: {}, checks: result.values };
  }
  // Flat with Lab short rules: the long entry is checked first, then the short entry.
  if (!hasPosition && rules.shortEntry?.conditions.length) {
    const short = checkGroup(rules.shortEntry, window, funding);
    return short.met
      ? { action: "short", reasoning: `Short rule met: ${short.reasons}. Shorting.`, indicators: {}, checks: result.values, shortChecks: short.values }
      : { action: "hold", reasoning: `Waiting. Not yet: ${result.missing}; for a short, not yet: ${short.missing}.`, indicators: {}, checks: result.values, shortChecks: short.values };
  }
  return { action: "hold", reasoning: `${hasPosition ? "Holding" : "Waiting"}. Not yet: ${result.missing}.`, indicators: {}, checks: result.values };
}

/** Checks one group: whether it is met, the met conditions' text, the first unmet one, and every value. */
function checkGroup(group: RuleGroup, window: number[], funding?: (number | null)[]) {
  const checks = group.conditions.map((condition) => checkCondition(condition, window, funding));
  const met = group.join === "all" ? checks.every((check) => check.met) : checks.some((check) => check.met);
  return {
    met,
    reasons: checks
      .filter((check) => check.met)
      .map((check) => check.text)
      .join("; "),
    missing: checks.find((check) => !check.met)?.text ?? "",
    // The values behind the decision, for the decision log's details (lib/engine/explain.ts).
    values: checks.map(({ left, right, met: ok }) => ({ left: round6(left), right: round6(right), met: ok })),
  };
}

/** Six significant digits: enough for any price or indicator, and keeps stored decisions small. */
function round6(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(6)) : value;
}

/** "price $735.20 above 48h average $721.00", "24h change +1.2% above +3.0%". */
export function describeCondition(condition: Condition, leftValue?: number, rightValue?: number): string {
  // The Lab funding filter compares with zero: say it in words, not "above −0.0%".
  if (condition.left.kind === "funding7d" && condition.right.kind === "value" && Math.abs(condition.right.value) < 0.01) {
    const now = leftValue === undefined ? "" : ` (${formatUnit("pct", leftValue)} a year)`;
    return `7d funding ${condition.op === "above" || condition.op === "crossesAbove" ? "zero or positive" : "negative"}${now}`;
  }
  const unit = indicatorMeta(condition.left.kind).unit;
  return `${describeSide(condition.left, leftValue, unit)} ${OPERATORS[condition.op]} ${describeSide(condition.right, rightValue, unit)}`;
}

function describeSide(side: Indicator | ValueSide, value: number | undefined, unit: Unit): string {
  if (side.kind === "value") return formatUnit(unit, side.value);
  const meta = indicatorMeta(side.kind);
  const name = side.hours ? `${side.hours}h ${meta.label.toLowerCase()}` : meta.label.toLowerCase();
  const offset = side.offsetPct ? ` ${side.offsetPct > 0 ? "+" : "−"}${Math.abs(side.offsetPct)}%` : "";
  return value === undefined ? `${name}${offset}` : `${name}${offset} ${formatUnit(meta.unit, value)}`;
}

function formatUnit(unit: Unit, value: number): string {
  if (unit === "price") return `$${value >= 10 ? value.toFixed(2) : value.toPrecision(4)}`;
  if (unit === "pct") return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
  if (unit === "z") return value.toFixed(2);
  return value.toFixed(0);
}

/**
 * Checks untrusted rules (they arrive from the browser) and returns them in
 * canonical form, or the list of problems in plain words.
 */
export function parseRules(input: unknown): { rules: Rules; errors: [] } | { rules: null; errors: string[] } {
  const errors: string[] = [];
  const raw = (input ?? {}) as Partial<Rules>;
  const group = (value: unknown, name: "buy" | "sell"): RuleGroup => {
    const g = (value ?? {}) as Partial<RuleGroup>;
    const conditions = Array.isArray(g.conditions) ? g.conditions : [];
    if (conditions.length > MAX_CONDITIONS) errors.push(RULE_ERRORS.tooManyConditions(name));
    return { join: g.join === "any" ? "any" : "all", conditions: conditions.slice(0, MAX_CONDITIONS).map((c) => parseCondition(c, errors)).filter((c): c is Condition => c !== null) };
  };
  const rules: Rules = {
    entry: group(raw.entry, "buy"),
    exit: group(raw.exit, "sell"),
    takeProfitPct: positiveOrNull(raw.takeProfitPct, TAKE_PROFIT_RANGE.min, TAKE_PROFIT_RANGE.max, "Take profit", errors),
    maxHoldHours: positiveOrNull(raw.maxHoldHours, MAX_HOLD_RANGE.min, MAX_HOLD_RANGE.max, "Max holding time", errors),
  };
  if (!rules.entry.conditions.length) errors.push(RULE_ERRORS.noBuyRule);
  if (!rules.exit.conditions.length && !rules.takeProfitPct && !rules.maxHoldHours) {
    errors.push(RULE_ERRORS.noWayToSell);
  }
  if (rulesLookback(rules) > MAX_LOOKBACK_HOURS + 2) errors.push(RULE_ERRORS.lookbackTooLong);
  return errors.length ? { rules: null, errors } : { rules, errors: [] };
}

function parseCondition(value: unknown, errors: string[]): Condition | null {
  const c = (value ?? {}) as Partial<Condition>;
  const left = parseIndicator(c.left);
  if (!left) {
    errors.push(RULE_ERRORS.unknownIndicator);
    return null;
  }
  if (!c.op || !(c.op in OPERATORS)) {
    errors.push(RULE_ERRORS.unknownComparison);
    return null;
  }
  const unit = indicatorMeta(left.kind).unit;
  const rawRight = (c.right ?? {}) as { kind?: string; value?: unknown };
  if (rawRight.kind === "value") {
    if (unit === "price") {
      errors.push(RULE_ERRORS.priceAgainstNumber);
      return null;
    }
    const number = Number(rawRight.value);
    if (!Number.isFinite(number)) {
      errors.push(RULE_ERRORS.missingNumber);
      return null;
    }
    return { left, op: c.op, right: { kind: "value", value: number } };
  }
  const right = parseIndicator(rawRight);
  if (!right || indicatorMeta(right.kind).unit !== "price" || unit !== "price") {
    errors.push(RULE_ERRORS.onlyPriceLines);
    return null;
  }
  return { left, op: c.op, right };
}

function parseIndicator(value: unknown): Indicator | null {
  const raw = (value ?? {}) as { kind?: string; hours?: unknown; offsetPct?: unknown };
  if (!raw.kind || !(raw.kind in INDICATORS)) return null;
  const kind = raw.kind as IndicatorKind;
  const meta = INDICATORS[kind];
  const indicator: Indicator = { kind };
  if (meta.periods) {
    const hours = Number(raw.hours);
    if (!meta.periods.includes(hours)) return null;
    indicator.hours = hours;
  }
  if (raw.offsetPct !== undefined && raw.offsetPct !== null && Number(raw.offsetPct) !== 0) {
    const offset = Number(raw.offsetPct);
    if (!Number.isFinite(offset) || Math.abs(offset) > MAX_OFFSET_PCT) return null;
    indicator.offsetPct = offset;
  }
  return indicator;
}

function positiveOrNull(value: unknown, min: number, max: number, name: "Take profit" | "Max holding time", errors: string[]): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    errors.push(RULE_ERRORS.outOfRange(name, min, max));
    return null;
  }
  return number;
}

export { formatPercent };
