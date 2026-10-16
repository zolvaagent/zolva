import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { NextResponse } from "next/server";

import { WELCOME_CREDITS_MICRO } from "@/lib/ai/models";
import { COOKIE_OPTIONS, NONCE_COOKIE, SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";

/**
 * Last step of every login (wallet signature or Privy): records the wallet
 * and sets the signed session cookie. Callers verify identity and apply the
 * geo-block before calling this.
 */
export async function startSession(db: SupabaseClient, address: string, country: string | null): Promise<NextResponse> {
  const wallet = address.toLowerCase();
  const { error } = await db.from("wallets").upsert({ address: wallet, country }, { onConflict: "address" });
  if (error) return NextResponse.json({ error: "Could not save your account. Please try again." }, { status: 500 });

  // One-time AI welcome credits (Lite models only). The database grants it at
  // most once per account; a failure here must never block signing in.
  await db.rpc("ai_grant_welcome", { p_owner: wallet, p_amount_micro: WELCOME_CREDITS_MICRO }).then(
    () => undefined,
    () => undefined,
  );

  const { token, maxAge } = createSessionToken(wallet);
  const response = NextResponse.json({ address: wallet });
  response.cookies.set(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge });
  response.cookies.delete(NONCE_COOKIE);
  return response;
}
