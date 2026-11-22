import { describe, expect, it } from "vitest";

import { burnTotals, classifyBurn, creditTotals, LAUNCH_BURN_TX, positionAmounts, positionTicks, type Burn } from "./token-report";

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

describe("locked liquidity", () => {
  it("reads the ticks out of a v4 PositionInfo word", () => {
    // The burnt full-range ZOLVA position (#4342522): ticks -887200 and 887200.
    const info = (BigInt.asUintN(24, 887200n) << 32n) | (BigInt.asUintN(24, -887200n) << 8n);
    expect(positionTicks(info)).toEqual({ tickLower: -887200, tickUpper: 887200 });
  });

  it("splits a position into its two tokens at the pool price", () => {
    const sqrtPriceX96 = 2n ** 96n; // price 1
    const inRange = positionAmounts(10n ** 18n, sqrtPriceX96, -887200, 887200);
    expect(inRange.amount0 / 1e18).toBeCloseTo(1, 6);
    expect(inRange.amount1 / 1e18).toBeCloseTo(1, 6);
    expect(positionAmounts(10n ** 18n, sqrtPriceX96, 100, 200).amount1).toBe(0);
    expect(positionAmounts(10n ** 18n, sqrtPriceX96, -200, -100).amount0).toBe(0);
  });
});
