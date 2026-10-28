import { NextResponse, type NextRequest } from "next/server";

import { BLOCKED_MESSAGE, countryFromHeaders, isBlockedCountry } from "@/lib/auth/geo";
import { PrivyLoginError, walletFromPrivyToken } from "@/lib/auth/privy";
import { startSession } from "@/lib/auth/start-session";
import { db } from "@/lib/supabase";

/**
 * Email or Google login: the browser finishes Privy's flow, then sends its
 * Privy access token here. We verify it with Privy and start our own session
 * for the user's embedded wallet. Blocked countries are refused first.
 */
export async function POST(request: NextRequest) {
  const client = db();
  const country = countryFromHeaders(request.headers);
  if (isBlockedCountry(country)) {
    return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 451 });
  }

  const body = (await request.json().catch(() => null)) as { accessToken?: unknown } | null;
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
  if (!accessToken) return NextResponse.json({ error: "Missing access token" }, { status: 400 });

  try {
    return startSession(client, await walletFromPrivyToken(accessToken), country, "privy");
  } catch (cause) {
    if (cause instanceof PrivyLoginError) return NextResponse.json({ error: cause.message }, { status: cause.status });
    console.error("privy login failed", cause);
    return NextResponse.json({ error: "Sign in failed. Please try again." }, { status: 500 });
  }
}
