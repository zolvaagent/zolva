import "server-only";

import { NextResponse } from "next/server";

import { COOKIE_OPTIONS, NONCE_COOKIE, SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

/**
 * Last step of every login (wallet signature or Privy): records the wallet
 * and sets the signed session cookie. Callers verify identity and apply the
 * geo-block before calling this.
 */
export async function startSession(address: string, country: string | null): Promise<NextResponse> {
  const wallet = address.toLowerCase();
  const { error } = await db().from("wallets").upsert({ address: wallet, country }, { onConflict: "address" });
  if (error) return NextResponse.json({ error: "Could not save your account. Please try again." }, { status: 500 });

  const { token, maxAge } = createSessionToken(wallet);
  const response = NextResponse.json({ address: wallet });
  response.cookies.set(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge });
  response.cookies.delete(NONCE_COOKIE);
  return response;
}
