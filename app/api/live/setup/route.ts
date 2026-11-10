import { NextResponse, type NextRequest } from "next/server";

import { BLOCKED_MESSAGE, countryFromHeaders, isBlockedCountry, isLiveBlockedCountry, LIVE_BLOCKED_MESSAGE } from "@/lib/auth/geo";
import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { confirmLiveWallet, liveStatus, LiveOnboardError, prepareLiveWallet } from "@/lib/live/onboard";
import { createChainClient } from "@/lib/prices/onchain";
import { db } from "@/lib/supabase";

/**
 * Self-serve real money setup for the logged-in wallet (lib/live/onboard.ts).
 *
 * GET: the wallet's live status (allowlisted, USDG and ETH, limits).
 * POST { step: "prepare" }: a new policy for this wallet, plus Zolva's signer id.
 * POST { step: "confirm", policyId }: allowlist the wallet once the signer is on it.
 */
export async function GET() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  try {
    return NextResponse.json(await liveStatus(db(), createChainClient(env.robinhoodRpcUrl), owner));
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Loading your wallet failed. Please try again." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const country = countryFromHeaders(request.headers);
  if (isBlockedCountry(country)) return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 451 });
  if (isLiveBlockedCountry(country)) return NextResponse.json({ error: LIVE_BLOCKED_MESSAGE }, { status: 451 });

  const body = (await request.json().catch(() => null)) as { step?: unknown; policyId?: unknown } | null;
  try {
    if (body?.step === "prepare") return NextResponse.json(await prepareLiveWallet(db(), owner));
    if (body?.step === "confirm") {
      await confirmLiveWallet(db(), owner, body.policyId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  } catch (cause) {
    if (cause instanceof LiveOnboardError) return NextResponse.json({ error: cause.message }, { status: 400 });
    console.error(cause);
    return NextResponse.json({ error: "Setting up real money failed. Please try again." }, { status: 500 });
  }
}
