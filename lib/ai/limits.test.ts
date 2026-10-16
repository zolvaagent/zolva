import { describe, expect, it } from "vitest";

import { parseAiLimit, suggestedLimitUsd } from "./limits";
import { aiModel } from "./models";

const NOW = Date.parse("2026-10-16T00:00:00Z");

describe("parseAiLimit", () => {
  it("turns USD and days into micro-USD and an end date", () => {
    expect(parseAiLimit("5", 30, NOW)).toEqual({ ok: true, value: { limitMicro: 5_000_000, expiresAt: "2026-11-15T00:00:00.000Z" } });
    expect(parseAiLimit(0.05, 7, NOW)).toMatchObject({ ok: true, value: { limitMicro: 50_000 } });
  });

  it("refuses limits outside $0.01 to $1000 and empty input", () => {
    for (const value of ["", null, 0, 0.001, 1001, "abc"]) expect(parseAiLimit(value, 30, NOW).ok).toBe(false);
  });

  it("only accepts the offered durations", () => {
    expect(parseAiLimit(1, 10, NOW).ok).toBe(false);
    expect(parseAiLimit(1, 365, NOW).ok).toBe(true);
  });
});

describe("suggestedLimitUsd", () => {
  it("suggests about three months of typical use, at least 5 cents", () => {
    expect(suggestedLimitUsd(aiModel("anthropic/claude-haiku-5.5")!)).toBe(0.05);
    // Sonnet: about $0.30 a month, so $0.90.
    expect(suggestedLimitUsd(aiModel("anthropic/claude-sonnet-5.5")!)).toBe(0.9);
  });
});
