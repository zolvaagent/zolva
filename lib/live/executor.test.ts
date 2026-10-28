import { encodeAbiParameters, pad, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { amountReceived, deviationBps, impliedPrice, minimumOut } from "./executor";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" as Hex;
const WALLET = "0x235c3ccea156dfbbc31ee37c07a7292c4506f628" as Hex;
const POOL = "0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3" as Hex;

const transferLog = (token: Hex, from: Hex, to: Hex, value: bigint) => ({
  address: token,
  topics: [TRANSFER, pad(from), pad(to)] as [Hex, Hex, Hex],
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
});

describe("minimumOut", () => {
  it("takes the slippage off the quote and rounds down", () => {
    expect(minimumOut(10_000n, 100)).toBe(9_900n);
    expect(minimumOut(9_098_124_361_860_656n, 100)).toBe(9_007_143_118_242_049n);
  });
});

describe("impliedPrice", () => {
  it("prices a buy as USDG paid per token received", () => {
    // The real step 1 swap: $2 for 0.009098124361860656 NVDA.
    expect(impliedPrice("buy", 2_000_000n, 9_098_124_361_860_656n, 18)).toBeCloseTo(219.825, 2);
  });

  it("prices a sell as USDG received per token paid, with 8 decimal tokens", () => {
    // 0.0001 cbBTC for $8.06.
    expect(impliedPrice("sell", 10_000n, 8_060_000n, 8)).toBeCloseTo(80_600, 6);
  });
});

describe("deviationBps", () => {
  it("measures the gap in basis points either way", () => {
    expect(deviationBps(102, 100)).toBeCloseTo(200, 6);
    expect(deviationBps(98, 100)).toBeCloseTo(200, 6);
    expect(deviationBps(219.8, 219.8)).toBe(0);
  });
});

describe("amountReceived", () => {
  it("counts only the token's transfers into the wallet", () => {
    const logs = [
      transferLog(NVDA, POOL, WALLET, 9_000n),
      transferLog(NVDA, POOL, "0x000000000000000000000000000000000000dEaD", 5n),
      transferLog("0x5fc5360d0400a0fd4f2af552add042d716f1d168", WALLET, POOL, 2_000_000n),
      transferLog(NVDA, POOL, WALLET, 98n),
    ];
    expect(amountReceived(logs, NVDA, WALLET)).toBe(9_098n);
  });

  it("returns zero when nothing arrived", () => {
    expect(amountReceived([], NVDA, WALLET)).toBe(0n);
  });
});
