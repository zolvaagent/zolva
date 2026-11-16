/**
 * What /docs/rules shows, built from lib/engine/rules.ts so the page cannot drift from the
 * checks the Studio, the API and the agents run. rules.test.ts fails when an indicator,
 * operator, field, limit or error message is missing here.
 */
import { ACTIONS } from "../public-api/actions";
import {
  INDICATORS,
  MAX_CONDITIONS,
  MAX_HOLD_RANGE,
  MAX_LOOKBACK_HOURS,
  MAX_OFFSET_PCT,
  OPERATORS,
  RULE_ERRORS,
  TAKE_PROFIT_RANGE,
  type IndicatorKind,
  type Operator,
  type Rules,
} from "../engine/rules";
import { paramRows, type ParamRow } from "./schema";

const UNIT_TEXT = { price: "USD price line", pct: "percent", z: "standard deviations", rsi: "0 to 100" } as const;

/** What each indicator measures. A Record, so a new indicator fails to compile until it is described. */
const INDICATOR_TEXT: Record<IndicatorKind, string> = {
  price: "The latest hourly close.",
  sma: "The average close over the last N hours (simple moving average).",
  high: "The highest close of the N hours before this one. The current hour is left out, so price can cross above it.",
  low: "The lowest close of the N hours before this one, current hour left out.",
  change: "How much the price moved over the last N hours, in percent.",
  zscore: "How far the price sits from its N hour average, in standard deviations. Around −2 or lower is an unusually deep dip.",
  rsi: "Relative strength index over N hours: the share of the movement that was up. Below 30 is often read as oversold, above 70 as overbought.",
};

const OPERATOR_TEXT: Record<Operator, string> = {
  above: "True every hour the left side is higher than the right side.",
  below: "True every hour the left side is lower than the right side.",
  crossesAbove: "True only in the hour the left side moves from at or below the right side to above it.",
  crossesBelow: "True only in the hour the left side moves from at or above the right side to below it.",
};

export type IndicatorRow = { kind: IndicatorKind; label: string; unit: string; periods: string; comparesWith: string; text: string };

export const INDICATOR_ROWS: IndicatorRow[] = (Object.keys(INDICATORS) as IndicatorKind[]).map((kind) => {
  const meta = INDICATORS[kind];
  return {
    kind,
    label: meta.label,
    unit: UNIT_TEXT[meta.unit],
    periods: meta.periods ? meta.periods.join(", ") : "none (leave hours out)",
    comparesWith: meta.unit === "price" ? "another price line" : "a number",
    text: INDICATOR_TEXT[kind],
  };
});

export const OPERATOR_ROWS = (Object.keys(OPERATORS) as Operator[]).map((op) => ({ op, label: OPERATORS[op], text: OPERATOR_TEXT[op] }));

export type FieldRow = { path: string; type: string; text: string };

/** Every key a rules object can hold. */
export const RULE_FIELD_ROWS: FieldRow[] = [
  { path: "entry", type: "group", text: "When to buy. Checked every hour the agent holds nothing in that market." },
  { path: "exit", type: "group", text: "When to sell. Checked every hour the agent holds a position. May have no conditions if a take profit or max holding time is set." },
  { path: "join", type: `"all" or "any"`, text: `On a group. all: every condition must be true. any: one is enough. Anything else counts as "all".` },
  { path: "conditions", type: "array", text: `On a group: 0 to ${MAX_CONDITIONS} conditions. The buy group needs at least one.` },
  { path: "left", type: "indicator", text: "On a condition: the indicator being tested. Its unit decides what the right side may be." },
  { path: "op", type: Object.keys(OPERATORS).join(", "), text: "On a condition: the comparison. See the operators table." },
  { path: "right", type: "indicator or value", text: "On a condition: what the left side is compared with. A price line when the left side is a price line, otherwise a value." },
  { path: "kind", type: [...Object.keys(INDICATORS), "value"].join(", "), text: `On an indicator: which one. "value" marks a plain number on the right side.` },
  { path: "hours", type: "integer", text: "On an indicator: the period. Must be one of the periods in the indicators table; leave it out for price." },
  { path: "offsetPct", type: `number, −${MAX_OFFSET_PCT} to ${MAX_OFFSET_PCT}`, text: "On an indicator, optional: shifts the line by a percentage. −3 on a 48h average means 3% below it. 0 is the same as leaving it out." },
  { path: "value", type: "number", text: `On a value side: the number, in the left indicator's unit (percent for change, standard deviations for z score, 0 to 100 for RSI).` },
  { path: "takeProfitPct", type: `number, ${TAKE_PROFIT_RANGE.min} to ${TAKE_PROFIT_RANGE.max}, or null`, text: "Sell once the price is this many percent above the entry price." },
  { path: "maxHoldHours", type: `number, ${MAX_HOLD_RANGE.min} to ${MAX_HOLD_RANGE.max}, or null`, text: "Sell after holding a position this many hours, whatever the rules say." },
];

/** The fields set when the agent is made (not part of the rules), from the create_paper_agent input. */
const SETTING_NAMES = ["markets", "venue", "capital", "maxPositionPct", "stopLossPct"] as const;
export const AGENT_SETTING_ROWS: ParamRow[] = paramRows(ACTIONS.create_paper_agent.input).filter((row) => (SETTING_NAMES as readonly string[]).includes(row.name));

export const LIMIT_ROWS: [limit: string, value: string][] = [
  ["Conditions per group (buy or sell)", `${MAX_CONDITIONS}`],
  ["Longest look back", `${MAX_LOOKBACK_HOURS} hours (7 days)`],
  ["Price line shift (offsetPct)", `±${MAX_OFFSET_PCT}%`],
  ["Take profit", `${TAKE_PROFIT_RANGE.min} to ${TAKE_PROFIT_RANGE.max}%`],
  ["Max holding time", `${MAX_HOLD_RANGE.min} to ${MAX_HOLD_RANGE.max} hours (30 days)`],
];

export type ErrorRow = { key: keyof typeof RULE_ERRORS; messages: string[]; cause: string; fix: string };

/** Every message parseRules can return, with its cause and the fix. */
export const ERROR_ROWS: ErrorRow[] = [
  {
    key: "tooManyConditions",
    messages: [RULE_ERRORS.tooManyConditions("buy"), RULE_ERRORS.tooManyConditions("sell")],
    cause: `A group has more than ${MAX_CONDITIONS} conditions.`,
    fix: "Drop the weakest condition, or split the idea into two agents.",
  },
  { key: "noBuyRule", messages: [RULE_ERRORS.noBuyRule], cause: "entry.conditions is empty or missing.", fix: "Add at least one buy condition." },
  {
    key: "noWayToSell",
    messages: [RULE_ERRORS.noWayToSell],
    cause: "No exit conditions, no takeProfitPct and no maxHoldHours.",
    fix: "Add a sell condition, a take profit or a max holding time.",
  },
  { key: "lookbackTooLong", messages: [RULE_ERRORS.lookbackTooLong], cause: `The rules need more than ${MAX_LOOKBACK_HOURS} hours of history.`, fix: "Use shorter periods." },
  {
    key: "unknownIndicator",
    messages: [RULE_ERRORS.unknownIndicator],
    cause: "A left or right side has an unknown kind, an hours value outside its periods, or an offsetPct outside the limit.",
    fix: "Check kind, hours and offsetPct against the indicators table.",
  },
  { key: "unknownComparison", messages: [RULE_ERRORS.unknownComparison], cause: "op is missing or not one of the four operators.", fix: "Use above, below, crossesAbove or crossesBelow." },
  {
    key: "priceAgainstNumber",
    messages: [RULE_ERRORS.priceAgainstNumber],
    cause: "A price line (price, average, highest, lowest) is compared with a plain value.",
    fix: "Compare it with another price line, and use offsetPct for a gap such as 2% below the average.",
  },
  { key: "missingNumber", messages: [RULE_ERRORS.missingNumber], cause: "A value side has no number, or one that is not finite.", fix: "Set value to a number." },
  {
    key: "onlyPriceLines",
    messages: [RULE_ERRORS.onlyPriceLines],
    cause: "Two indicators that are not both price lines are compared, such as RSI with change.",
    fix: "Compare change, z score and RSI with a value instead.",
  },
  {
    key: "outOfRange",
    messages: [RULE_ERRORS.outOfRange("Take profit", TAKE_PROFIT_RANGE.min, TAKE_PROFIT_RANGE.max), RULE_ERRORS.outOfRange("Max holding time", MAX_HOLD_RANGE.min, MAX_HOLD_RANGE.max)],
    cause: "takeProfitPct or maxHoldHours is outside its range or not a number.",
    fix: "Use a number in range, or null to turn it off.",
  },
];

/**
 * The full example on the page: RSI dip buying with a trend filter. Passes parseRules
 * (tested), so readers can paste it into validate_rules as is.
 */
export const EXAMPLE_RULES: Rules = {
  entry: {
    join: "all",
    conditions: [
      { left: { kind: "rsi", hours: 14 }, op: "below", right: { kind: "value", value: 30 } },
      { left: { kind: "price" }, op: "above", right: { kind: "sma", hours: 72, offsetPct: -5 } },
    ],
  },
  exit: {
    join: "any",
    conditions: [{ left: { kind: "rsi", hours: 14 }, op: "crossesAbove", right: { kind: "value", value: 55 } }],
  },
  takeProfitPct: 6,
  maxHoldHours: 72,
};

/** Notes for the numbered lines of the example, in reading order. */
export const EXAMPLE_NOTES: string[] = [
  `entry, join "all": both buy conditions must be true in the same hour.`,
  "Buy condition 1: the 14 hour RSI is under 30, so the market has fallen hard lately.",
  "Buy condition 2: the price is still above its 72 hour average minus 5%, so it is a dip and not a crash.",
  `exit, join "any": one sell condition is enough.`,
  "Sell condition: the 14 hour RSI crosses back above 55. True only in the hour it crosses.",
  "takeProfitPct 6: sell once the price is 6% above where it was bought.",
  "maxHoldHours 72: sell after 3 days whatever happens.",
];
