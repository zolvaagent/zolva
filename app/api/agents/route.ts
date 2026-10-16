import { NextResponse, type NextRequest } from "next/server";

import { AgentInputError, createAgent, type CreateAgentInput } from "@/lib/agents/create";
import { BLOCKED_MESSAGE, countryFromHeaders, isBlockedCountry } from "@/lib/auth/geo";
import { getSessionAddress } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

/** Launch a paper agent from the Studio. */
export async function POST(request: NextRequest) {
  const client = db();
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (isBlockedCountry(countryFromHeaders(request.headers))) {
    return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 451 });
  }

  const body = (await request.json().catch(() => null)) as CreateAgentInput | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const { id } = await createAgent(client, owner, body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (cause) {
    if (cause instanceof AgentInputError) return NextResponse.json({ error: cause.message }, { status: 400 });
    console.error(cause);
    return NextResponse.json({ error: "Launching failed. Please try again." }, { status: 500 });
  }
}
