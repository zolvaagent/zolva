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

export type Indicator = { kind: IndicatorKind; hours?: number; offsetPct?: number };
export type ValueSide = { kind: "value"; value: number };
export type Condition = { left: Indicator; op: Operator; right: Indicator | ValueSide };
export type RuleGroup = { join: "all" | "any"; conditions: Condition[] };

export type Rules = {
  entry: RuleGroup;
  exit: RuleGroup;
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
  zscore: { label: "Z score", unit: "z", periods: [24, 48, 72] },
  rsi: { label: "RSI", unit: "rsi", periods: [14, 24] },
};

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

/** Hours of history the rules need (largest period, plus one for "crosses"). */
export function rulesLookback(rules: Rules): number {
  let hours = 2;
  for (const condition of [...rules.entry.conditions, ...rules.exit.conditions]) {
    const cross = condition.op === "crossesAbove" || condition.op === "crossesBelow" ? 1 : 0;
    for (const side of [condition.left, condition.right]) {
      if ("hours" in side && side.hours) hours = Math.max(hours, side.hours + 1 + cross);
    }
  }
  return hours;
}

/** Value of an indicator at the end of `window` (closes, oldest first). */
export function indicatorValue(indicator: Indicator, window: number[]): number {
  const price = window[window.length - 1];
  const hours = indicator.hours ?? 0;
  switch (indicator.kind) {
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

function sideValue(side: Indicator | ValueSide, window: number[]): number {
  if (side.kind === "value") return side.value;
  return indicatorValue(side, window) * (1 + (side.offsetPct ?? 0) / 100);
}

export function checkCondition(condition: Condition, window: number[]): { met: boolean; text: string } {
  const left = sideValue(condition.left, window);
  const right = sideValue(condition.right, window);
  let met: boolean;
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

/** The decision for one token from its rules; take profit and max hold are handled by the engine. */
export function evaluateRules(rules: Rules, window: number[], hasPosition: boolean): Signal {
  const group = hasPosition ? rules.exit : rules.entry;
  if (!group.conditions.length) {
    return { action: "hold", reasoning: "Holding until take profit, stop loss or max holding time.", indicators: {} };
  }
  const checks = group.conditions.map((condition) => checkCondition(condition, window));
  const met = group.join === "all" ? checks.every((check) => check.met) : checks.some((check) => check.met);
  if (met) {
    const reasons = checks
      .filter((check) => check.met)
      .map((check) => check.text)
      .join("; ");
    return hasPosition
      ? { action: "sell", reasoning: `Sell rule met: ${reasons}. Selling.`, indicators: {} }
      : { action: "buy", reasoning: `Buy rule met: ${reasons}. Buying.`, indicators: {} };
  }
  const missing = checks.find((check) => !check.met)!;
  return { action: "hold", reasoning: `${hasPosition ? "Holding" : "Waiting"}. Not yet: ${missing.text}.`, indicators: {} };
}

/** "price $735.20 above 48h average $721.00", "24h change +1.2% above +3.0%". */
export function describeCondition(condition: Condition, leftValue?: number, rightValue?: number): string {
  const unit = INDICATORS[condition.left.kind].unit;
  return `${describeSide(condition.left, leftValue, unit)} ${OPERATORS[condition.op]} ${describeSide(condition.right, rightValue, unit)}`;
}

function describeSide(side: Indicator | ValueSide, value: number | undefined, unit: Unit): string {
  if (side.kind === "value") return formatUnit(unit, side.value);
  const meta = INDICATORS[side.kind];
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
  const group = (value: unknown, name: string): RuleGroup => {
    const g = (value ?? {}) as Partial<RuleGroup>;
    const conditions = Array.isArray(g.conditions) ? g.conditions : [];
    if (conditions.length > MAX_CONDITIONS) errors.push(`Use at most ${MAX_CONDITIONS} ${name} rules.`);
    return { join: g.join === "any" ? "any" : "all", conditions: conditions.slice(0, MAX_CONDITIONS).map((c) => parseCondition(c, errors)).filter((c): c is Condition => c !== null) };
  };
  const rules: Rules = {
    entry: group(raw.entry, "buy"),
    exit: group(raw.exit, "sell"),
    takeProfitPct: positiveOrNull(raw.takeProfitPct, 1, 500, "Take profit", errors),
    maxHoldHours: positiveOrNull(raw.maxHoldHours, 1, 24 * 30, "Max holding time", errors),
  };
  if (!rules.entry.conditions.length) errors.push("Add at least one buy rule.");
  if (!rules.exit.conditions.length && !rules.takeProfitPct && !rules.maxHoldHours) {
    errors.push("Add a sell rule, a take profit or a max holding time, or the agent only sells on its stop loss.");
  }
  if (rulesLookback(rules) > MAX_LOOKBACK_HOURS + 2) errors.push("Rules may look back at most 7 days.");
  return errors.length ? { rules: null, errors } : { rules, errors: [] };
}

function parseCondition(value: unknown, errors: string[]): Condition | null {
  const c = (value ?? {}) as Partial<Condition>;
  const left = parseIndicator(c.left);
  if (!left) {
    errors.push("A rule has an unknown indicator.");
    return null;
  }
  if (!c.op || !(c.op in OPERATORS)) {
    errors.push("A rule has an unknown comparison.");
    return null;
  }
  const unit = INDICATORS[left.kind].unit;
  const rawRight = (c.right ?? {}) as { kind?: string; value?: unknown };
  if (rawRight.kind === "value") {
    if (unit === "price") {
      errors.push("Compare prices with another price line, not a plain number.");
      return null;
    }
    const number = Number(rawRight.value);
    if (!Number.isFinite(number)) {
      errors.push("Every number in a rule needs a value.");
      return null;
    }
    return { left, op: c.op, right: { kind: "value", value: number } };
  }
  const right = parseIndicator(rawRight);
  if (!right || INDICATORS[right.kind].unit !== "price" || unit !== "price") {
    errors.push("Only price lines can be compared with each other.");
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
    if (!Number.isFinite(offset) || Math.abs(offset) > 50) return null;
    indicator.offsetPct = offset;
  }
  return indicator;
}

function positiveOrNull(value: unknown, min: number, max: number, name: string, errors: string[]): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    errors.push(`${name} must be between ${min} and ${max}.`);
    return null;
  }
  return number;
}

export { formatPercent };
