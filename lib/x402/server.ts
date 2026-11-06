import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { checkLimit } from "@/lib/public-api/http";
import { db } from "@/lib/supabase";
import { claimPayment, createChainClient, relayerFromEnv, releasePayment, settlePayment } from "@/lib/x402/facilitator";
import { buildRequirements, checkPayment, decodePaymentHeader, paymentRequiredBody, settlementHeader } from "@/lib/x402/protocol";

/**
 * Runs one paid premium API call:
 * 1. Off (no X402_ENABLED, receiving address or relayer): 503, nothing charged.
 * 2. The caller's input is checked first (`prepare`), so a bad request is never charged.
 * 3. No X-PAYMENT header: 402 with the price. A bad one: 402 with the reason.
 * 4. A good one: claimed, the work runs, then the transfer settles on chain, and only then
 *    is the result returned, with the transaction in X-PAYMENT-RESPONSE.
 */

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT",
  "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
  "Cache-Control": "no-store",
};

function error(status: number, code: string, message: string, extra: Record<string, string> = {}) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { ...HEADERS, ...extra } });
}

export type PaidEndpoint<Input> = {
  /** Price in USDG, as a decimal string ("0.005"). */
  price: string;
  description: string;
  /** Checks the request; returns the input for `run`, or a list of problems (400, not charged). */
  prepare: (request: NextRequest) => Promise<{ input: Input } | { errors: string[] }>;
  run: (input: Input) => Promise<unknown>;
};

export async function paidCall<Input>(request: NextRequest, endpoint: PaidEndpoint<Input>): Promise<Response> {
  const config = env.x402;
  const relayer = relayerFromEnv();
  if (!config || !relayer) return error(503, "premium_closed", "The premium API is not open yet. The free public API is at /api/public/v1.");

  if ((await checkLimit(request)) === "limited") return error(429, "rate_limited", "Too many requests: about 60 a minute per IP.", { "Retry-After": "60" });

  const url = new URL(request.url);
  const resource = `${url.origin}${url.pathname}`;
  const requirements = buildRequirements({ price: endpoint.price, resource, description: endpoint.description, payTo: config.payTo });
  const paymentRequired = (reason?: string) => NextResponse.json(paymentRequiredBody(requirements, reason), { status: 402, headers: HEADERS });

  let prepared: Awaited<ReturnType<PaidEndpoint<Input>["prepare"]>>;
  try {
    prepared = await endpoint.prepare(request);
  } catch (cause) {
    console.error("x402 prepare", url.pathname, cause);
    return error(500, "internal_error", "Something went wrong on our side. Nothing was charged.");
  }
  if ("errors" in prepared) return NextResponse.json({ error: { code: "bad_request", message: "The request is not valid. Nothing was charged.", details: prepared.errors } }, { status: 400, headers: HEADERS });

  const header = request.headers.get("x-payment");
  if (!header) return paymentRequired();
  const payment = decodePaymentHeader(header);
  if (!payment) return paymentRequired("X-PAYMENT is not a valid x402 exact payment");
  const problem = checkPayment(payment, requirements, Math.floor(Date.now() / 1000));
  if (problem) return paymentRequired(problem);

  const client = db();
  const chain = createChainClient(env.robinhoodRpcUrl);
  const claim = await claimPayment(client, chain, payment, requirements, url.pathname);
  if (!claim.ok) return paymentRequired(claim.reason);

  let body: unknown;
  try {
    body = await endpoint.run(prepared.input);
  } catch (cause) {
    console.error("x402 run", url.pathname, cause);
    await releasePayment(client, claim.id, "the paid work failed");
    return error(500, "internal_error", "Something went wrong on our side. Nothing was charged.");
  }

  const settlement = await settlePayment(client, chain, relayer, claim.id, payment);
  if (!settlement.ok) {
    console.error("x402 settle", url.pathname, settlement.reason);
    return paymentRequired(`The payment could not be settled: ${settlement.reason}`);
  }
  return NextResponse.json(body, { headers: { ...HEADERS, "X-PAYMENT-RESPONSE": settlementHeader({ success: true, transaction: settlement.txHash, payer: claim.payer }) } });
}

export function paidOptions() {
  return new Response(null, { status: 204, headers: { ...HEADERS, "Access-Control-Max-Age": "86400" } });
}
