import { encodeAbiParameters, pad, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { paidBy, quoteUsdgTopUp } from "./usdg-topup";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Made up addresses for the tests.
const USDG = `0x${"11".repeat(20)}`;
const PAY_TO = `0x${"22".repeat(20)}`;
const ME = "0x235c3ccea156dfbbc31ee37c07a7292c4506f628";
const OTHER = `0x${"99".repeat(20)}`;

const transfer = (token: string, from: string, to: string, value: bigint) => ({
  address: token as Hex,
  topics: [TRANSFER, pad(from as Hex), pad(to as Hex)] as [Hex, Hex, Hex],
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
});

describe("paidBy", () => {
  it("adds up USDG sent to Zolva from the account's wallets", () => {
    const logs = [transfer(USDG, ME, PAY_TO, 3_000_000n), transfer(USDG, ME, PAY_TO, 2_000_000n)];
    expect(paidBy(logs, USDG, PAY_TO, [ME])).toEqual({ raw: 5_000_000n, wallet: ME });
  });

  it("ignores other tokens, other senders and other receivers", () => {
    const logs = [
      transfer(OTHER, ME, PAY_TO, 9_000_000n),
      transfer(USDG, OTHER, PAY_TO, 9_000_000n),
      transfer(USDG, ME, OTHER, 9_000_000n),
      transfer(USDG, ME, PAY_TO, 1_500_000n),
    ];
    expect(paidBy(logs, USDG, PAY_TO, [ME])).toEqual({ raw: 1_500_000n, wallet: ME });
  });

  it("matches addresses in any letter case", () => {
    expect(paidBy([transfer(USDG, ME, PAY_TO, 1_000_000n)], USDG.toUpperCase(), PAY_TO, [ME.toUpperCase().replace("0X", "0x")])).toEqual({ raw: 1_000_000n, wallet: ME });
  });

  it("returns null when nothing was paid to Zolva", () => {
    expect(paidBy([transfer(USDG, ME, OTHER, 5_000_000n)], USDG, PAY_TO, [ME])).toBeNull();
  });
});

describe("quoteUsdgTopUp", () => {
  it("credits 1 USDG as $1 (one base unit is one micro-dollar)", () => {
    expect(quoteUsdgTopUp(5_250_000n)).toEqual({ ok: true, creditsMicro: 5_250_000 });
  });

  it("refuses less than $1 and more than $500", () => {
    expect(quoteUsdgTopUp(999_999n)).toEqual({ ok: false, reason: "too_small" });
    expect(quoteUsdgTopUp(500_000_001n)).toEqual({ ok: false, reason: "too_large" });
    expect(quoteUsdgTopUp(500_000_000n).ok).toBe(true);
  });
});
