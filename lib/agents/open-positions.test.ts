import { describe, expect, it } from "vitest";

import { positionPnl } from "./open-positions";

describe("positionPnl", () => {
  it("values a long at the price against what it cost", () => {
    const result = positionPnl({ quantity: 2, entryPrice: 100, side: "long", margin: null }, 110);
    expect(result.valueUsd).toBe(220);
    expect(result.pnlUsd).toBe(20);
    expect(result.pnlPct).toBeCloseTo(10);
  });

  it("gains on a short when the price falls, with or without margin", () => {
    expect(positionPnl({ quantity: 2, entryPrice: 100, side: "short", margin: null }, 90).pnlUsd).toBe(20);
    const leveraged = positionPnl({ quantity: 6, entryPrice: 100, side: "short", margin: 200 }, 90);
    expect(leveraged.pnlUsd).toBe(60);
    expect(leveraged.pnlPct).toBeCloseTo(30);
  });

  it("never values a margined short below zero", () => {
    expect(positionPnl({ quantity: 6, entryPrice: 100, side: "short", margin: 200 }, 150).valueUsd).toBe(0);
  });
});
