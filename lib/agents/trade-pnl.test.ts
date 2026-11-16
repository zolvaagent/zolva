import { describe, expect, it } from "vitest";

import { tradeKey, tradePnls, type PnlTrade } from "./trade-pnl";

const t = (ts: number, side: PnlTrade["side"], quantity: number, price: number, costUsd: number, reason = "signal", token = "AAA"): PnlTrade => ({ ts, agentId: "a", token, side, quantity, price, costUsd, reason });

describe("tradePnls", () => {
  it("realises a sell against everything the position cost, costs included", () => {
    const buy = t(1, "buy", 10, 100, 5);
    const sell = t(2, "sell", 10, 110, 5.5);
    const pnl = tradePnls([buy, sell], { AAA: 120 });
    // 1,100 - 5.50 back, 1,005 in: +89.50.
    expect(pnl.get(tradeKey(sell))).toEqual({ kind: "realised", usd: 89.5, pct: (89.5 / 1005) * 100 });
    // The buy is closed: no unrealised number.
    expect(pnl.has(tradeKey(buy))).toBe(false);
  });

  it("shows an open buy's paper result at the latest price", () => {
    const buy = t(1, "buy", 10, 100, 5);
    const pnl = tradePnls([buy], { AAA: 103 });
    expect(pnl.get(tradeKey(buy))!.kind).toBe("unrealised");
    expect(pnl.get(tradeKey(buy))!.usd).toBeCloseTo(1030 - 1005);
  });

  it("realises a partial resize sell on its share and keeps the rest open", () => {
    const buy = t(1, "buy", 10, 100, 0);
    const resize = t(2, "sell", 4, 120, 0, "resize");
    const pnl = tradePnls([buy, resize], { AAA: 110 });
    expect(pnl.get(tradeKey(resize))!.usd).toBeCloseTo(4 * 120 - 400);
    expect(pnl.get(tradeKey(buy))!.usd).toBeCloseTo(6 * 110 - 600);
  });

  it("values a cover as a 1x short", () => {
    const short = t(1, "short", 10, 100, 1);
    const cover = t(2, "cover", 10, 90, 0.9);
    const pnl = tradePnls([short, cover], {});
    // Locked 1,001; back 10 x (200 - 90) - 0.90 = 1,099.10: +98.10.
    expect(pnl.get(tradeKey(cover))!.usd).toBeCloseTo(98.1);
  });
});
