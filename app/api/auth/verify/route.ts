import { NextResponse, type NextRequest } from "next/server";
import { verifyMessage } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";

import { BLOCKED_MESSAGE, countryFromHeaders, isBlockedCountry } from "@/lib/auth/geo";
import { NONCE_COOKIE } from "@/lib/auth/session";
import { startSession } from "@/lib/auth/start-session";
import { db } from "@/lib/supabase";

/**
 * Step 2 of Sign-In with Ethereum: checks the signed message and starts a
 * session. The message must be for this site, carry the nonce issued to this
 * browser, and not be expired. Blocked countries are refused here.
 *
 * Signatures are checked with plain ECDSA recovery, so regular wallets work;
 * smart-contract wallets (ERC-1271) would need an RPC call and are not
 * supported yet. Email and Google sign in go through /api/auth/privy.
 */
export async function POST(request: NextRequest) {
  const client = db();
  const country = countryFromHeaders(request.headers);
  if (isBlockedCountry(country)) {
    return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 451 });
  }

  const body = (await request.json().catch(() => null)) as { message?: unknown; signature?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";
  if (!message || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return NextResponse.json({ error: "Missing message or signature" }, { status: 400 });
  }

  const fields = parseSiweMessage(message);
  const nonce = request.cookies.get(NONCE_COOKIE)?.value;
  const valid =
    Boolean(nonce) &&
    validateSiweMessage({ message: fields, domain: request.nextUrl.host, nonce }) &&
    fields.address !== undefined &&
    (await verifyMessage({ address: fields.address, message, signature: signature as `0x${string}` }).catch(() => false));

  if (!valid || !fields.address) {
    return NextResponse.json({ error: "Signature could not be verified" }, { status: 401 });
  }

  return startSession(client, fields.address, country);
}
