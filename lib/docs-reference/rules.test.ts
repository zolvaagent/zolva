import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { INDICATORS, MAX_CONDITIONS, OPERATORS, parseRules, RULE_ERRORS, RULE_TEMPLATES } from "../engine/rules";
import { AGENT_SETTING_ROWS, ERROR_ROWS, EXAMPLE_NOTES, EXAMPLE_RULES, INDICATOR_ROWS, LIMIT_ROWS, OPERATOR_ROWS, RULE_FIELD_ROWS } from "./rules";

const PAGE = readFileSync(new URL("../../app/(docs)/docs/rules/page.tsx", import.meta.url), "utf8");

/** Every key used anywhere in a value, recursively. */
function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, into));
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      into.add(key);
      keysOf(inner, into);
    }
  }
  return into;
}

const condition = (left: unknown, op: unknown, right: unknown) => ({ left, op, right });
const withEntry = (...conditions: unknown[]) => ({ entry: { join: "all", conditions }, exit: { join: "any", conditions: [] }, takeProfitPct: 5 });

/** Inputs that together trigger every message parseRules can return. */
const BAD_INPUTS: unknown[] = [
  {},
  null,
  withEntry(...Array(MAX_CONDITIONS + 1).fill(condition({ kind: "price" }, "above", { kind: "sma", hours: 48 }))),
  { ...withEntry(condition({ kind: "price" }, "above", { kind: "sma", hours: 48 })), exit: { join: "any", conditions: Array(MAX_CONDITIONS + 1).fill(condition({ kind: "price" }, "below", { kind: "sma", hours: 48 })) } },
  withEntry(condition({ kind: "macd" }, "above", { kind: "value", value: 1 })),
  withEntry(condition({ kind: "sma", hours: 5 }, "above", { kind: "price" })),
  withEntry(condition({ kind: "sma", hours: 48, offsetPct: 80 }, "above", { kind: "price" })),
  withEntry(condition({ kind: "price" }, "equals", { kind: "sma", hours: 48 })),
  withEntry(condition({ kind: "price" }, "above", { kind: "value", value: 100 })),
  withEntry(condition({ kind: "rsi", hours: 14 }, "below", { kind: "value", value: "x" })),
  withEntry(condition({ kind: "rsi", hours: 14 }, "below", { kind: "change", hours: 24 })),
  { ...withEntry(condition({ kind: "rsi", hours: 14 }, "below", { kind: "value", value: 30 })), takeProfitPct: 0 },
  { ...withEntry(condition({ kind: "rsi", hours: 14 }, "below", { kind: "value", value: 30 })), takeProfitPct: null, maxHoldHours: 10_000 },
];

describe("/docs/rules reference", () => {
  it("lists every indicator and operator", () => {
    expect(INDICATOR_ROWS.map((row) => row.kind)).toEqual(Object.keys(INDICATORS));
    expect(OPERATOR_ROWS.map((row) => row.op)).toEqual(Object.keys(OPERATORS));
  });

  it("lists every period of every indicator", () => {
    for (const row of INDICATOR_ROWS) {
      for (const period of INDICATORS[row.kind].periods ?? []) expect(row.periods.split(", ")).toContain(String(period));
    }
  });

  it("describes every key a rules object can hold", () => {
    const keys = new Set<string>();
    for (const rules of [...Object.values(RULE_TEMPLATES), EXAMPLE_RULES]) keysOf(rules, keys);
    const documented = RULE_FIELD_ROWS.map((row) => row.path);
    for (const key of keys) expect(documented, key).toContain(key);
    // And nothing that does not exist.
    for (const path of documented) expect(keys, path).toContain(path);
  });

  it("documents every error parseRules can return", () => {
    expect(ERROR_ROWS.map((row) => row.key).sort()).toEqual(Object.keys(RULE_ERRORS).sort());
    const documented = ERROR_ROWS.flatMap((row) => row.messages);
    const seen = new Set<string>();
    for (const input of BAD_INPUTS) {
      for (const message of parseRules(input).errors) {
        expect(documented, message).toContain(message);
        seen.add(message);
      }
    }
    // The bad inputs reach every documented message, so the list above is not stale.
    expect([...seen].sort()).toEqual([...new Set(documented)].filter((message) => message !== RULE_ERRORS.lookbackTooLong).sort());
  });

  it("has an example that passes the checks, with a note per line", () => {
    expect(parseRules(EXAMPLE_RULES)).toEqual({ rules: EXAMPLE_RULES, errors: [] });
    expect(EXAMPLE_NOTES.length).toBe(EXAMPLE_RULES.entry.conditions.length + EXAMPLE_RULES.exit.conditions.length + 4);
  });

  it("covers the agent settings that sit next to the rules", () => {
    expect(AGENT_SETTING_ROWS.map((row) => row.name).sort()).toEqual(["capital", "markets", "maxPositionPct", "stopLossPct", "venue"]);
    expect(LIMIT_ROWS.length).toBeGreaterThan(0);
  });

  it("is rendered by the page in full", () => {
    for (const name of ["INDICATOR_ROWS", "OPERATOR_ROWS", "RULE_FIELD_ROWS", "AGENT_SETTING_ROWS", "LIMIT_ROWS", "ERROR_ROWS", "EXAMPLE_RULES", "EXAMPLE_NOTES"]) {
      expect(PAGE, name).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});
