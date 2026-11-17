import { NextResponse, type NextRequest } from "next/server";

import { BLOCKED_MESSAGE, countryFromHeaders, isBlockedCountry, isLiveBlockedCountry, LIVE_BLOCKED_MESSAGE } from "@/lib/auth/geo";
import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createChainClient } from "@/lib/prices/onchain";
import { db } from "@/lib/supabase";
import { ownAgent, setRunState, setupAgent, TrenchError, walletStatus, withdrawAndClose } from "@/lib/trench/onboard";

export const dynamic = "force-dynamic";

/** GET: the agent wallet's ETH and what starting needs (owner only). */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const { id } = await context.params;
  try {
    const agent = await ownAgent(db(), owner, id);
    return NextResponse.json({ status: agent.status, wallet: await walletStatus(createChainClient(env.robinhoodRpcUrl), agent) });
  } catch (cause) {
    if (cause instanceof TrenchError) return NextResponse.json({ error: cause.message }, { status: 404 });
    console.error(cause);
    return NextResponse.json({ error: "Loading the agent failed." }, { status: 500 });
  }
}

/**
 * POST { step, ... } for one of the owner's trench agents (lib/trench/onboard.ts):
 * setup { handle, bio } (wallet, Rushr sign-up and hand-over, all on the server),
 * start, resume, pause, sell_all, withdraw.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const country = countryFromHeaders(request.headers);
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const step = body?.step;
  // Leaving is always allowed; starting anything new is not from blocked countries.
  if (step !== "pause" && step !== "sell_all" && step !== "withdraw") {
    if (isBlockedCountry(country)) return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 451 });
    if (isLiveBlockedCountry(country)) return NextResponse.json({ error: LIVE_BLOCKED_MESSAGE }, { status: 451 });
  }
  const client = db();
  try {
    const chain = () => createChainClient(env.robinhoodRpcUrl);
    switch (step) {
      case "setup":
        await setupAgent(client, chain(), owner, id, { handle: body?.handle, bio: body?.bio });
        return NextResponse.json({ ok: true });
      case "start":
      case "resume":
      case "pause":
      case "sell_all":
        await setRunState(client, chain(), owner, id, step);
        return NextResponse.json({ ok: true });
      case "withdraw":
        return NextResponse.json(await withdrawAndClose(client, chain(), owner, id));
      default:
        return NextResponse.json({ error: "Unknown request." }, { status: 400 });
    }
  } catch (cause) {
    if (cause instanceof TrenchError) return NextResponse.json({ error: cause.message }, { status: 400 });
    console.error(cause);
    return NextResponse.json({ error: "That did not work. Please try again." }, { status: 500 });
  }
}
