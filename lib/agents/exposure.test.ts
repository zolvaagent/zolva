import { describe, expect, it } from "vitest";

import { exposure } from "./exposure";

describe("exposure", () => {
  it("counts the hours a position was open", () => {
    const runs = [
      { equity: 10_000, cash: 10_000 },
      { equity: 10_050, cash: 4_000 },
      { equity: 9_980, cash: 3_900 },
      { equity: 9_990, cash: 9_990 },
    ];
    expect(exposure(runs)).toEqual({ hours: 4, investedHours: 2, investedPct: 50 });
  });

  it("treats value within dust of cash as cash, and a short as invested", () => {
    expect(exposure([{ equity: 10_000.004, cash: 10_000 }])?.investedHours).toBe(0);
    // A short: cash holds the sale proceeds, value is cash minus what is owed.
    expect(exposure([{ equity: 9_800, cash: 14_800 }])?.investedHours).toBe(1);
  });

  it("is null without runs, and 0% for an agent that never traded", () => {
    expect(exposure([])).toBeNull();
    expect(exposure(Array.from({ length: 218 }, () => ({ equity: 10_000, cash: 10_000 })))).toEqual({ hours: 218, investedHours: 0, investedPct: 0 });
  });
});
