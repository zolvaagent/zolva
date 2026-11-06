import { encodeAbiParameters, pad, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { BURN_ADDRESS, burnedBy, quoteTopUp, topUpPrice } from "./zolva-topup";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Made up addresses for the tests.
const TOKEN = `0x${"11".repeat(20)}`;
const ME = "0x235c3ccea156dfbbc31ee37c07a7292c4506f628";
const OTHER = `0x${"99".repeat(20)}`;

const transfer = (token: string, from: string, to: string, value: bigint) => ({
  address: token as Hex,
  topics: [TRANSFER, pad(from as Hex), pad(to as Hex)] as [Hex, Hex, Hex],
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
});

describe("topUpPrice", () => {
  it("takes the lower of the latest price and the 7 day average", () => {
    expect(topUpPrice(0.02, 0.05)).toBe(0.02);
    expect(topUpPrice(0.08, 0.05)).toBe(0.05);
  });

  it("uses whichever exists, and none without prices", () => {
    expect(topUpPrice(null, 0.05)).toBe(0.05);
    expect(topUpPrice(0.03, null)).toBe(0.03);
    expect(topUpPrice(null, null)).toBeNull();
  });
});

describe("quoteTopUp", () => {
  it("credits the burn's value plus the 10% bonus", () => {
    // 500 ZOLVA at $0.02 = $10, plus 10% = $11 of credits.
    const quote = quoteTopUp(500n * 10n ** 18n, 18, 0.02, 0.03);
    expect(quote).toEqual({ ok: true, price: 0.02, usd: 10, creditsMicro: 11_000_000 });
  });

  it("refuses top-ups under $1 and burns without any price", () => {
    expect(quoteTopUp(10n * 10n ** 18n, 18, 0.05, 0.05)).toMatchObject({ ok: false, reason: "too_small" });
    expect(quoteTopUp(10n ** 24n, 18, null, null)).toEqual({ ok: false, reason: "no_price", usd: 0 });
  });
});

describe("burnedBy", () => {
  it("adds up ZOLVA sent to the burn address from the account's wallets", () => {
    const logs = [transfer(TOKEN, ME, BURN_ADDRESS, 300n), transfer(TOKEN, ME, BURN_ADDRESS, 200n)];
    expect(burnedBy(logs, TOKEN, [ME])).toEqual({ raw: 500n, wallet: ME });
  });

  it("ignores other tokens, other senders and other receivers", () => {
    const logs = [
      transfer(OTHER, ME, BURN_ADDRESS, 1000n),
      transfer(TOKEN, OTHER, BURN_ADDRESS, 1000n),
      transfer(TOKEN, ME, OTHER, 1000n),
      transfer(TOKEN, ME, BURN_ADDRESS, 7n),
    ];
    expect(burnedBy(logs, TOKEN, [ME])).toEqual({ raw: 7n, wallet: ME });
  });

  it("returns null when nothing was burned", () => {
    expect(burnedBy([transfer(TOKEN, ME, OTHER, 5n)], TOKEN, [ME])).toBeNull();
  });
});
