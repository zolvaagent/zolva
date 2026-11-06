import { recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { authorizationTypedData, buildRequirements, checkPayment, decodePaymentHeader, settlementHeader, usdgUnits, type Authorization, type PaymentPayload } from "./protocol";

const PAY_TO = "0x00000000000000000000000000000000000000aa" as Hex;
const payer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const NOW = 1_800_000_000;
const requirements = buildRequirements({ price: "0.005", resource: "https://zolvaagent.app/api/x402/v1/scan", description: "Scan", payTo: PAY_TO });

function authorization(overrides: Partial<Authorization> = {}): Authorization {
  return { from: payer.address, to: PAY_TO, value: "5000", validAfter: String(NOW - 10), validBefore: String(NOW + 120), nonce: `0x${"11".repeat(32)}`, ...overrides };
}

async function payment(overrides: Partial<Authorization> = {}, outer: Partial<PaymentPayload> = {}): Promise<PaymentPayload> {
  const auth = authorization(overrides);
  const signature = await payer.signTypedData(authorizationTypedData(auth));
  return { x402Version: 1, scheme: "exact", network: "robinhood", payload: { signature, authorization: auth }, ...outer };
}

const encode = (value: unknown) => btoa(JSON.stringify(value));

describe("usdgUnits", () => {
  it("turns a USDG price into 6 decimal base units", () => {
    expect(usdgUnits("0.005")).toBe("5000");
    expect(usdgUnits("0.03")).toBe("30000");
    expect(usdgUnits("12")).toBe("12000000");
  });

  it("refuses more than 6 decimals or junk", () => {
    expect(() => usdgUnits("0.0000001")).toThrow();
    expect(() => usdgUnits("-1")).toThrow();
  });
});

describe("buildRequirements", () => {
  it("prices in USDG on Robinhood Chain with the token's EIP-712 domain", () => {
    expect(requirements).toMatchObject({
      scheme: "exact",
      network: "robinhood",
      maxAmountRequired: "5000",
      asset: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
      payTo: PAY_TO,
      extra: { name: "Global Dollar", version: "1" },
    });
  });
});

describe("decodePaymentHeader", () => {
  it("reads a base64 exact payment", async () => {
    const value = await payment();
    expect(decodePaymentHeader(encode(value))).toEqual(value);
  });

  it("returns null for junk or a missing field", async () => {
    const value = await payment();
    expect(decodePaymentHeader("not base64 json")).toBeNull();
    expect(decodePaymentHeader(encode({ ...value, payload: { ...value.payload, signature: "nope" } }))).toBeNull();
    expect(decodePaymentHeader(encode({ ...value, payload: { ...value.payload, authorization: { ...value.payload.authorization, nonce: "0x12" } } }))).toBeNull();
    expect(decodePaymentHeader(encode({ ...value, payload: { ...value.payload, authorization: { ...value.payload.authorization, value: "-5" } } }))).toBeNull();
  });
});

describe("checkPayment", () => {
  it("passes an exact payment of the price to Zolva", async () => {
    expect(checkPayment(await payment(), requirements, NOW)).toBeNull();
    expect(checkPayment(await payment({}, { network: "eip155:4663" }), requirements, NOW)).toBeNull();
  });

  it("refuses the wrong recipient, amount, network or scheme", async () => {
    expect(checkPayment(await payment({ to: "0x00000000000000000000000000000000000000bb" }), requirements, NOW)).toMatch(/not to Zolva/);
    expect(checkPayment(await payment({ value: "4999" }), requirements, NOW)).toMatch(/below the price/);
    expect(checkPayment(await payment({ value: "5001" }), requirements, NOW)).toMatch(/above the price/);
    expect(checkPayment(await payment({}, { network: "base" }), requirements, NOW)).toMatch(/Network/);
    expect(checkPayment(await payment({}, { scheme: "upto" }), requirements, NOW)).toMatch(/exact/);
    expect(checkPayment(await payment({}, { x402Version: 2 }), requirements, NOW)).toMatch(/x402Version/);
  });

  it("refuses payments outside their time window", async () => {
    expect(checkPayment(await payment({ validAfter: String(NOW + 30) }), requirements, NOW)).toMatch(/not valid yet/);
    expect(checkPayment(await payment({ validBefore: String(NOW + 3) }), requirements, NOW)).toMatch(/expired/);
    expect(checkPayment(await payment({ validBefore: String(NOW + 3600) }), requirements, NOW)).toMatch(/expire within/);
  });
});

describe("authorizationTypedData", () => {
  it("recovers the payer from a signed authorization, and not from a changed one", async () => {
    const value = await payment();
    const typed = authorizationTypedData(value.payload.authorization);
    expect(await recoverTypedDataAddress({ ...typed, signature: value.payload.signature })).toBe(payer.address);
    const changed = authorizationTypedData({ ...value.payload.authorization, value: "9000000" });
    expect(await recoverTypedDataAddress({ ...changed, signature: value.payload.signature })).not.toBe(payer.address);
  });
});

describe("settlementHeader", () => {
  it("is base64 JSON with the transaction", () => {
    const hash = `0x${"ab".repeat(32)}` as Hex;
    expect(JSON.parse(atob(settlementHeader({ success: true, transaction: hash, payer: payer.address })))).toEqual({ success: true, transaction: hash, network: "robinhood", payer: payer.address });
  });
});
