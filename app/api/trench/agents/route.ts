import { NextResponse, type NextRequest } from "next/server";

import { BLOCKED_MESSAGE, countryFromHeaders, isBlockedCountry, isLiveBlockedCountry, LIVE_BLOCKED_MESSAGE } from "@/lib/auth/geo";
import { getSessionAddress } from "@/lib/auth/session";
import { db } from "@/lib/supabase";
import { createAgent, TrenchError } from "@/lib/trench/onboard";

export const dynamic = "force-dynamic";

/** POST { name, preset, budgetUsd, callouts, riskAccepted }: a new trench agent in setup. */
export async function POST(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const country = countryFromHeaders(request.headers);
  if (isBlockedCountry(country)) return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 451 });
  if (isLiveBlockedCountry(country)) return NextResponse.json({ error: LIVE_BLOCKED_MESSAGE }, { status: 451 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const id = await createAgent(db(), owner, { name: body?.name, preset: body?.preset, budgetUsd: body?.budgetUsd, callouts: body?.callouts, riskAccepted: body?.riskAccepted });
    return NextResponse.json({ id });
  } catch (cause) {
    if (cause instanceof TrenchError) return NextResponse.json({ error: cause.message }, { status: 400 });
    console.error(cause);
    return NextResponse.json({ error: "Creating the agent failed. Please try again." }, { status: 500 });
  }
}
