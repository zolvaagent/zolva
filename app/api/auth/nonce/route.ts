import { NextResponse } from "next/server";
import { generateSiweNonce } from "viem/siwe";

import { COOKIE_OPTIONS, NONCE_COOKIE } from "@/lib/auth/session";

// A cached nonce would be shared by every visitor, defeating its purpose.
export const dynamic = "force-dynamic";

/**
 * Step 1 of Sign-In with Ethereum: a one-time nonce the wallet must sign.
 * Kept in an httpOnly cookie, so a signature can only be used by the browser
 * that asked for it, and only once.
 */
export async function GET() {
  const nonce = generateSiweNonce();
  const response = NextResponse.json({ nonce });
  response.cookies.set(NONCE_COOKIE, nonce, { ...COOKIE_OPTIONS, maxAge: 10 * 60 });
  return response;
}
