import { NextResponse, type NextRequest } from "next/server";

import { AgentInputError, setAgentStatus } from "@/lib/agents/create";
import { getSessionAddress } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

/** Pause or resume one of your agents: { "status": "active" | "paused" }. */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/agents/[id]">) {
  const client = db();
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  try {
    await setAgentStatus(client, owner, id, body?.status);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    if (cause instanceof AgentInputError) return NextResponse.json({ error: cause.message }, { status: 400 });
    console.error(cause);
    return NextResponse.json({ error: "Updating failed. Please try again." }, { status: 500 });
  }
}
