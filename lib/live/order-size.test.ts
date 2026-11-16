import { describe, expect, it } from "vitest";

import { liveSellQuantity, MIN_LIVE_ORDER_USD, tooSmallReason } from "./order-size";

describe("liveSellQuantity", () => {
  it("sells only the resized part on a daily resize", () => {
    expect(liveSellQuantity({ quantity: 0.002, reason: "resize" }, 0.01)).toBe(0.002);
    // Never more than the agent holds.
    expect(liveSellQuantity({ quantity: 0.02, reason: "resize" }, 0.01)).toBe(0.01);
  });

  it("sells everything on a full exit, unchanged", () => {
    for (const reason of ["signal", "stop_loss", "take_profit", "max_hold", "manual"]) {
      expect(liveSellQuantity({ quantity: 0.009, reason }, 0.01)).toBe(0.01);
    }
    expect(liveSellQuantity({ quantity: 0.009, reason: "signal" }, null)).toBe(0.009);
  });
});

describe("tooSmallReason", () => {
  it("skips buys and resize sells under the minimum", () => {
    expect(tooSmallReason({ side: "buy", reason: "signal", usd: MIN_LIVE_ORDER_USD - 0.01 })).toContain("under the $5");
    expect(tooSmallReason({ side: "sell", reason: "resize", usd: 3 })).toContain("under the $5");
    expect(tooSmallReason({ side: "buy", reason: "resize", usd: 5 })).toBeNull();
  });

  it("never holds back a full exit", () => {
    expect(tooSmallReason({ side: "sell", reason: "stop_loss", usd: 0.5 })).toBeNull();
    expect(tooSmallReason({ side: "sell", reason: "signal", usd: 1 })).toBeNull();
  });
});
