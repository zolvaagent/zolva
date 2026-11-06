/**
 * x402 (v1, "exact" scheme) for Zolva's premium API, paid in USDG on Robinhood Chain.
 *
 * Flow: a call without payment gets 402 and the PaymentRequirements below. The caller
 * signs an EIP-3009 transferWithAuthorization for USDG (no gas), base64-encodes it as the
 * X-PAYMENT header and calls again. Zolva checks it, does the work, then settles the
 * transfer on chain from its relayer wallet (lib/x402/facilitator.ts) and returns the
 * transaction in X-PAYMENT-RESPONSE.
 *
 * The big facilitators do not list Robinhood Chain, so Zolva runs its own. Network name:
 * "robinhood" (v1 style, like "base"); "eip155:4663" is accepted too.
 *
 * Pure and free of Next.js imports so it is unit tested and scripts can share it.
 */
import type { Hex } from "viem";

export const X402_VERSION = 1;
export const X402_NETWORK = "robinhood";
const ACCEPTED_NETWORKS = new Set([X402_NETWORK, "eip155:4663"]);

export const X402_CHAIN_ID = 4663;
/** USDG (Global Dollar), 6 decimals. Supports EIP-3009; its EIP-712 domain is ("Global Dollar", "1"), checked on chain 2026-11-06. */
export const X402_ASSET = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as const;
export const X402_ASSET_DECIMALS = 6;
export const X402_ASSET_DOMAIN = { name: "Global Dollar", version: "1" } as const;
/** How long a signed payment may stay valid; longer windows are refused. */
export const MAX_TIMEOUT_SECONDS = 300;

export type PaymentRequirements = {
  scheme: "exact";
  network: string;
  /** Price in USDG base units (6 decimals), as a string. */
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: Hex;
  maxTimeoutSeconds: number;
  asset: Hex;
  extra: { name: string; version: string };
};

export type Authorization = { from: Hex; to: Hex; value: string; validAfter: string; validBefore: string; nonce: Hex };

export type PaymentPayload = {
  x402Version: number;
  scheme: string;
  network: string;
  payload: { signature: Hex; authorization: Authorization };
};

/** "0.005" USDG to base units ("5000"). */
export function usdgUnits(amount: string): string {
  if (!/^\d+(\.\d{1,6})?$/.test(amount)) throw new Error(`Bad USDG amount: ${amount}`);
  const [whole, fraction = ""] = amount.split(".");
  return (BigInt(whole) * 10n ** 6n + BigInt(fraction.padEnd(6, "0"))).toString();
}

export function buildRequirements(options: { price: string; resource: string; description: string; payTo: Hex; mimeType?: string }): PaymentRequirements {
  return {
    scheme: "exact",
    network: X402_NETWORK,
    maxAmountRequired: usdgUnits(options.price),
    resource: options.resource,
    description: options.description,
    mimeType: options.mimeType ?? "application/json",
    payTo: options.payTo.toLowerCase() as Hex,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    asset: X402_ASSET,
    extra: { ...X402_ASSET_DOMAIN },
  };
}

/** The 402 response body. */
export function paymentRequiredBody(requirements: PaymentRequirements, error = "X-PAYMENT header is required") {
  return { x402Version: X402_VERSION, error, accepts: [requirements] };
}

const isAddress = (value: unknown): value is Hex => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
const isUint = (value: unknown): value is string => typeof value === "string" && /^\d{1,78}$/.test(value);

/** Decodes the X-PAYMENT header (base64 JSON); null when it is not a well formed exact payment. */
export function decodePaymentHeader(header: string): PaymentPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(atob(header.trim()));
  } catch {
    return null;
  }
  const value = parsed as Partial<PaymentPayload> | null;
  const auth = value?.payload?.authorization as Partial<Authorization> | undefined;
  const signature = value?.payload?.signature;
  if (!value || typeof value.scheme !== "string" || typeof value.network !== "string" || !auth) return null;
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) return null;
  if (!isAddress(auth.from) || !isAddress(auth.to)) return null;
  if (!isUint(auth.value) || !isUint(auth.validAfter) || !isUint(auth.validBefore)) return null;
  if (typeof auth.nonce !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(auth.nonce)) return null;
  return value as PaymentPayload;
}

/**
 * Everything about a payment that can be checked without the chain: version, scheme,
 * network, recipient, amount and time window. Returns a reason, or null when it passes.
 * The signature, the nonce and the balance are checked by the facilitator.
 */
export function checkPayment(payment: PaymentPayload, requirements: PaymentRequirements, nowSeconds: number): string | null {
  const auth = payment.payload.authorization;
  if (payment.x402Version !== X402_VERSION) return `x402Version must be ${X402_VERSION}`;
  if (payment.scheme !== "exact") return "Only the exact scheme is accepted";
  if (!ACCEPTED_NETWORKS.has(payment.network)) return `Network must be ${X402_NETWORK}`;
  if (auth.to.toLowerCase() !== requirements.payTo.toLowerCase()) return "Payment is not to Zolva's address";
  if (BigInt(auth.value) < BigInt(requirements.maxAmountRequired)) return "Payment is below the price";
  // Overpaying is refused too, so a mistyped amount never costs the caller more than the price.
  if (BigInt(auth.value) > BigInt(requirements.maxAmountRequired)) return "Payment is above the price";
  if (Number(auth.validAfter) > nowSeconds) return "Payment is not valid yet";
  // Leave a few seconds to settle on chain before it expires.
  if (Number(auth.validBefore) < nowSeconds + 6) return "Payment has expired";
  if (Number(auth.validBefore) > nowSeconds + requirements.maxTimeoutSeconds + 60) return `Payment must expire within ${requirements.maxTimeoutSeconds} seconds`;
  return null;
}

/** EIP-712 typed data the payer signed, for signature checks. */
export function authorizationTypedData(auth: Authorization) {
  return {
    domain: { ...X402_ASSET_DOMAIN, chainId: X402_CHAIN_ID, verifyingContract: X402_ASSET },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: auth.from,
      to: auth.to,
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: auth.nonce,
    },
  };
}

/** The X-PAYMENT-RESPONSE header: base64 JSON with the settlement transaction. */
export function settlementHeader(result: { success: boolean; transaction: Hex | null; payer: Hex }): string {
  return btoa(JSON.stringify({ success: result.success, transaction: result.transaction ?? "", network: X402_NETWORK, payer: result.payer }));
}
