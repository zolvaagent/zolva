/**
 * AI strategy writer: turns a plain words description ("buy big dips, sell
 * the rebound") into Custom rules the engine already runs and backtests.
 * Whatever rules cannot express comes back as notes, which the agent's AI
 * co-pilot follows on live hours.
 *
 * The model answers in a flat shape with no unions and no nulls (0 means
 * "not used"): nullable types in a strict schema make some models stall on
 * whitespace until the token limit. `toRules` maps it to Rules and `parseRules` validates
 * it exactly like rules built by hand.
 */
import { INDICATORS, MAX_CONDITIONS, parseRules, type IndicatorKind, type Rules } from "../engine/rules.ts";

export const STRATEGY_WRITER_MODEL = "anthropic/claude-haiku-5.5";
export const PROMPT_MIN_LENGTH = 10;
export const PROMPT_MAX_LENGTH = 600;
/** Strategy writer calls per account per 24 hours. */
export const GENERATIONS_PER_DAY = 10;
/** Rules JSON plus notes; larger than a co-pilot review. */
export const WRITER_MAX_TOKENS = 1500;
/** Cap used for the credit and budget checks before a call. */
export const WRITER_MAX_INPUT_TOKENS = 3000;

const KINDS = Object.keys(INDICATORS) as IndicatorKind[];
const PRICE_KINDS = KINDS.filter((kind) => INDICATORS[kind].unit === "price");

export const WRITER_SYSTEM_PROMPT = [
  "You turn a plain words trading idea into rules for an hourly paper trading agent on tokenized US stocks.",
  "Rules use hourly closing prices. Indicators (kind, allowed hours):",
  "- price: the current price (no hours)",
  "- sma: average price over 12, 24, 48 or 72 hours",
  "- high / low: highest / lowest price of the previous 12, 24, 48 or 72 hours",
  "- change: percent change over 1, 4, 12, 24, 48 or 72 hours (compare with a value, e.g. 3 means +3%)",
  "- zscore: how unusual the price is versus its 24, 48 or 72 hour average (compare with a value, e.g. -2)",
  "- rsi: relative strength over 14 or 24 hours, 0 to 100 (compare with a value, e.g. 30)",
  "A condition compares left with right using above, below, crossesAbove or crossesBelow.",
  "Price, sma, high and low may only be compared with price, sma, high or low (right_offset_pct shifts the right line, e.g. -3 means 3% below it).",
  "Change, zscore and rsi may only be compared with a value (right = value).",
  `Buy rules (entry) and sell rules (exit): at most ${MAX_CONDITIONS} each, joined by all or any.`,
  "Always give a way out: sell rules, a take profit percent (1 to 500) or a max holding time in hours (1 to 720).",
  "Stop loss, position size and which stocks to trade are set elsewhere: do not encode them, mention them in notes only if the user asked.",
  "Keep it simple and close to what the user described. Prefer common, sensible thresholds.",
  "Use 0 for any number that does not apply (hours of price, offset, value when comparing two lines, no take profit, no max holding time).",
  "notes: anything the user wants that rules cannot express (news, earnings, market hours, caution), written as short instructions for an AI that approves or passes each trade. Empty when nothing is left.",
  "summary: one or two plain sentences explaining the rules you made.",
  "Write notes and summary in the same language as the user's description.",
  "If the description is not a trading strategy, set possible to false and explain why in summary.",
].join("\n");


const CONDITION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["left", "left_hours", "op", "right", "right_hours", "right_offset_pct", "value"],
  properties: {
    left: { type: "string", enum: KINDS },
    left_hours: { type: "integer" },
    op: { type: "string", enum: ["above", "below", "crossesAbove", "crossesBelow"] },
    right: { type: "string", enum: ["value", ...PRICE_KINDS] },
    right_hours: { type: "integer" },
    right_offset_pct: { type: "number" },
    value: { type: "number" },
  },
};

export const WRITER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["possible", "entry_join", "entry", "exit_join", "exit", "take_profit_pct", "max_hold_hours", "notes", "summary"],
  properties: {
    possible: { type: "boolean" },
    entry_join: { type: "string", enum: ["all", "any"] },
    entry: { type: "array", items: CONDITION_SCHEMA },
    exit_join: { type: "string", enum: ["all", "any"] },
    exit: { type: "array", items: CONDITION_SCHEMA },
    take_profit_pct: { type: "number" },
    max_hold_hours: { type: "integer" },
    notes: { type: "string" },
    summary: { type: "string" },
  },
} as const;

type FlatCondition = {
  left?: string;
  left_hours?: number | null;
  op?: string;
  right?: string;
  right_hours?: number | null;
  right_offset_pct?: number | null;
  value?: number | null;
};

/** The allowed period closest to what the model wrote (it sometimes says 50 for 48). */
function snapHours(kind: string, hours: number | null | undefined): number | undefined {
  const periods = INDICATORS[kind as IndicatorKind]?.periods;
  if (!periods) return undefined;
  const wanted = Number(hours);
  if (!Number.isFinite(wanted)) return periods[0];
  return periods.reduce((best, period) => (Math.abs(period - wanted) < Math.abs(best - wanted) ? period : best));
}

function toCondition(flat: FlatCondition) {
  const left = { kind: flat.left, hours: snapHours(flat.left ?? "", flat.left_hours) };
  const right =
    flat.right === "value"
      ? { kind: "value", value: flat.value }
      : { kind: flat.right, hours: snapHours(flat.right ?? "", flat.right_hours), offsetPct: flat.right_offset_pct || undefined };
  return { left, op: flat.op, right };
}

export type WriterResult =
  | { ok: true; rules: Rules; notes: string; summary: string }
  | { ok: false; error: string; summary: string };

/** Reads the model's answer into validated rules, or a message for the user. */
export function toRules(answer: string): WriterResult {
  let raw: {
    possible?: boolean;
    entry_join?: string;
    entry?: FlatCondition[];
    exit_join?: string;
    exit?: FlatCondition[];
    take_profit_pct?: number | null;
    max_hold_hours?: number | null;
    notes?: string;
    summary?: string;
  };
  try {
    raw = JSON.parse(answer.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { ok: false, error: "The AI answer could not be read. Please try again.", summary: "" };
  }
  const summary = typeof raw.summary === "string" ? raw.summary.slice(0, 400) : "";
  if (raw.possible === false) return { ok: false, error: summary || "That does not read like a trading strategy.", summary };

  const parsed = parseRules({
    entry: { join: raw.entry_join, conditions: (raw.entry ?? []).map(toCondition) },
    exit: { join: raw.exit_join, conditions: (raw.exit ?? []).map(toCondition) },
    // 0 means "not used".
    takeProfitPct: raw.take_profit_pct || null,
    maxHoldHours: raw.max_hold_hours || null,
  });
  if (!parsed.rules) return { ok: false, error: `The AI made rules that do not work: ${parsed.errors[0]} Try describing it differently.`, summary };

  const notes = typeof raw.notes === "string" ? raw.notes.trim().slice(0, PROMPT_MAX_LENGTH) : "";
  return { ok: true, rules: parsed.rules, notes, summary };
}
