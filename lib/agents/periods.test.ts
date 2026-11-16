import { describe, expect, it } from "vitest";

import { periodsOf, type PeriodRow } from "./periods";

const row = (period: PeriodRow["period"], base: number | null, baseHold: number | null, drop: number | null = 0.05): PeriodRow => ({ agent_id: "a", period, base_equity: base, base_hold_equity: baseHold, max_drawdown: drop });

describe("periodsOf", () => {
  it("measures each period from its starting values to the agent's value now", () => {
    const periods = periodsOf({ equity: 11_000, holdEquity: 9_900 }, [row("24h", 10_000, 10_000, 0.02), row("7d", 10_500, 9_000, 0.08)]);
    expect(periods["24h"]!.returnPct).toBeCloseTo(10);
    expect(periods["24h"]!.edge).toBeCloseTo(10 - -1);
    expect(periods["24h"]!.maxDrawdownPct).toBeCloseTo(2);
    expect(periods["7d"]!.returnPct).toBeCloseTo((11_000 / 10_500 - 1) * 100);
    expect(periods["7d"]!.edge).toBeCloseTo((11_000 / 10_500 - 1) * 100 - 10);
  });

  it("has no numbers for a period the agent is younger than", () => {
    const periods = periodsOf({ equity: 11_000, holdEquity: 9_900 }, [row("24h", 10_000, 10_000), row("30d", null, null)]);
    expect(periods["30d"]).toBeNull();
    expect(periods["7d"]).toBeNull();
    expect(periodsOf({ equity: 1, holdEquity: 1 }, undefined)).toEqual({ "24h": null, "7d": null, "30d": null });
  });
});
