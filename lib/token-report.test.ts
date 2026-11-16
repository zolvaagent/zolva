import { describe, expect, it } from "vitest";

import { burnTotals, classifyBurn, creditTotals, LAUNCH_BURN_TX, type Burn } from "./token-report";

const ROUTER = "0x204faca1764b154221e35c0d20abb3c525710498";
const options = { router: ROUTER, creditTxs: new Set(["0xcredit"]) };

describe("classifyBurn", () => {
  it("tells the launch burn, swap fee burns, credit top-ups and buybacks apart", () => {
    expect(classifyBurn(LAUNCH_BURN_TX.toUpperCase().replace("0X", "0x"), "0xabc", options)).toBe("launch");
    expect(classifyBurn("0x1", ROUTER.toUpperCase(), options)).toBe("swap_fee");
    expect(classifyBurn("0xCREDIT", "0xabc", options)).toBe("ai_credits");
    expect(classifyBurn("0x2", "0xabc", options)).toBe("buyback");
  });

  it("adds up each kind in a fixed order", () => {
    const burns: Burn[] = [
      { txHash: "0x1", from: "a", amount: 100, blockNumber: 1, ts: null, kind: "buyback" },
      { txHash: "0x2", from: "a", amount: 50, blockNumber: 2, ts: null, kind: "buyback" },
      { txHash: "0x3", from: "r", amount: 2, blockNumber: 3, ts: null, kind: "swap_fee" },
    ];
    expect(burnTotals(burns)).toEqual([
      { kind: "launch", amount: 0, count: 0 },
      { kind: "swap_fee", amount: 2, count: 1 },
      { kind: "ai_credits", amount: 0, count: 0 },
      { kind: "buyback", amount: 150, count: 2 },
    ]);
  });
});

describe("creditTotals", () => {
  it("splits grants, purchases and spending", () => {
    const totals = creditTotals([
      { bucket: "free", kind: "welcome", delta_micro: 500_000 },
      { bucket: "free", kind: "welcome", delta_micro: 500_000 },
      { bucket: "paid", kind: "usdg_topup", delta_micro: 2_000_000 },
      { bucket: "free", kind: "spend", delta_micro: -1_200 },
      { bucket: "paid", kind: "spend", delta_micro: -300 },
    ]);
    expect(totals.freeGrantedUsd).toBeCloseTo(1, 9);
    expect(totals.paidAddedUsd).toBeCloseTo(2, 9);
    expect(totals.spentUsd).toBeCloseTo(0.0015, 9);
  });
});
