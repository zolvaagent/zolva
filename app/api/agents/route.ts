import { NextResponse, type NextRequest } from "next/server";

import { AgentInputError, createAgent, type CreateAgentInput, type LiveLaunch } from "@/lib/agents/create";
import { BLOCKED_MESSAGE, countryFromHeaders, isBlockedCountry, isLiveBlockedCountry, LIVE_BLOCKED_MESSAGE } from "@/lib/auth/geo";
import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { recordFunnelEvent } from "@/lib/funnel-server";
import { liveStatus } from "@/lib/live/onboard";
import { createChainClient } from "@/lib/prices/onchain";
import { db } from "@/lib/supabase";

/** Least ETH a live wallet should hold for gas (a swap costs about $0.01). */
const MIN_GAS_ETH = 0.00002;

/** Launch an agent from the Studio: paper by default, or real money with `mode: "live"`. */
export async function POST(request: NextRequest) {
  const client = db();
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const country = countryFromHeaders(request.headers);
  if (isBlockedCountry(country)) {
    return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 451 });
  }

  const body = (await request.json().catch(() => null)) as CreateAgentInput | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    let live: LiveLaunch | undefined;
    if (body.mode === "live") {
      if (isLiveBlockedCountry(country)) return NextResponse.json({ error: LIVE_BLOCKED_MESSAGE }, { status: 451 });
      const status = await liveStatus(client, createChainClient(env.robinhoodRpcUrl), owner);
      if (!status.open) return NextResponse.json({ error: "Real money trading is paused right now. Paper trading stays open." }, { status: 503 });
      if (!status.enabled) return NextResponse.json({ error: "Allow Zolva to trade from your wallet first." }, { status: 400 });
      if (status.eth < MIN_GAS_ETH) return NextResponse.json({ error: "Add a little ETH on Robinhood Chain to your wallet for gas first." }, { status: 400 });
      live = { usdg: status.usdg };
    }
    const { id } = await createAgent(client, owner, body, live);
    await recordFunnelEvent(client, request, "launch_ok", owner, live ? "live" : "paper");
    return NextResponse.json({ id }, { status: 201 });
  } catch (cause) {
    if (cause instanceof AgentInputError) return NextResponse.json({ error: cause.message }, { status: 400 });
    console.error(cause);
    return NextResponse.json({ error: "Launching failed. Please try again." }, { status: 500 });
  }
}
