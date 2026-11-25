import { describe, expect, it } from "vitest";

import { checkGuard, guardLevels, parseGuardSettings, type Guard } from "./check";

const HOUR = 1_795_500_000 - (1_795_500_000 % 3600);
const guard: Guard = { quantity: 3, basisPrice: 100, stopLossPct: 8, takeProfitPct: 15 };

describe("checkGuard", () => {
  it("holds inside the limits", () => {
    expect(checkGuard(guard, 100, 95, HOUR)).toBeNull();
    expect(checkGuard(guard, 100, 114, HOUR)).toBeNull();
  });

  it("fires the stop loss at or below basis - stop", () => {
    const result = checkGuard(guard, 95, 92, HOUR);
    expect(result?.kind).toBe("stop_loss");
    expect(result?.reasoning).toMatch(/Stop loss hit/);
    expect(checkGuard(guard, 95, 80, HOUR)?.kind).toBe("stop_loss");
  });

  it("fires the take profit at or above basis + take profit", () => {
    expect(checkGuard(guard, 110, 115, HOUR)?.kind).toBe("take_profit");
    expect(checkGuard({ ...guard, takeProfitPct: null }, 110, 200, HOUR)).toBeNull();
  });

  it("never buys, whatever the prices do", () => {
    // A guard on a token not held has nothing to sell and must stay silent.
    expect(checkGuard({ ...guard, quantity: 0 }, 100, 50, HOUR)).toBeNull();
    for (const [previous, close] of [[100, 60], [60, 100], [100, 100]]) {
      const result = checkGuard(guard, previous, close, HOUR);
      expect(result === null || result.kind === "stop_loss" || result.kind === "take_profit").toBe(true);
    }
  });

  it("stays silent without usable prices", () => {
    expect(checkGuard(guard, 0, 90, HOUR)).toBeNull();
    expect(checkGuard(guard, 100, Number.NaN, HOUR)).toBeNull();
  });
});

describe("guardLevels", () => {
  it("gives the stop and take profit prices", () => {
    const levels = guardLevels(guard);
    expect(levels.stopPrice).toBeCloseTo(92);
    expect(levels.takeProfitPrice).toBeCloseTo(115);
    expect(guardLevels({ ...guard, takeProfitPct: null }).takeProfitPrice).toBeNull();
  });
});

describe("parseGuardSettings", () => {
  it("accepts a stop loss with optional take profit and basis", () => {
    expect(parseGuardSettings({ stopLossPct: "8", takeProfitPct: "", basisPrice: "" })).toEqual({ ok: true, stopLossPct: 8, takeProfitPct: null, basisPrice: null });
    expect(parseGuardSettings({ stopLossPct: 10, takeProfitPct: 25, basisPrice: 33.5 })).toEqual({ ok: true, stopLossPct: 10, takeProfitPct: 25, basisPrice: 33.5 });
  });

  it("refuses limits out of range", () => {
    for (const input of [{ stopLossPct: 0 }, { stopLossPct: 95 }, { stopLossPct: "x" }, { stopLossPct: 8, takeProfitPct: -1 }, { stopLossPct: 8, basisPrice: 0 }]) {
      expect(parseGuardSettings(input).ok).toBe(false);
    }
  });
});
