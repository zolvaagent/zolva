import "server-only";

import { createHmac } from "node:crypto";
import { cookies } from "next/headers";

import { env } from "@/lib/env";
import { secretsMatch } from "@/lib/secrets";

/**
 * Sessions: once a login checks out (wallet signature today, Privy token
 * later), the wallet address is stored in an HMAC-signed, httpOnly cookie.
 * No session table; tampering with the address breaks the signature.
 */

export const SESSION_COOKIE = "sita_session";
export const NONCE_COOKIE = "sita_nonce";
const SESSION_DAYS = 7;

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
}

export function createSessionToken(address: string): { token: string; maxAge: number } {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const expires = Math.floor(Date.now() / 1000) + maxAge;
  const payload = `${address.toLowerCase()}.${expires}`;
  return { token: `${payload}.${sign(payload)}`, maxAge };
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [address, expires, signature] = token.split(".");
  if (!address || !expires || !signature) return null;
  if (!secretsMatch(signature, sign(`${address}.${expires}`))) return null;
  if (Number(expires) < Date.now() / 1000) return null;
  return /^0x[0-9a-f]{40}$/.test(address) ? address : null;
}

/** The signed-in wallet address (lowercase), or null. */
export async function getSessionAddress(): Promise<string | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
