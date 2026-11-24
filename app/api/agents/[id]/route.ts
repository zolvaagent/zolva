import { NextResponse, type NextRequest } from "next/server";

import { AgentInputError, setAgentAiLimit, setAgentPalisecAccount, setAgentPublished, setAgentStatus } from "@/lib/agents/create";
import { getSessionAddress } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

/** Change one of your agents: { "status": "active" | "paused" } to pause or resume, { "published": boolean } to show it publicly, { "aiLimitUsd", "aiExpiryDays" } to change its AI budget, { "palisecAccount": "0x..." | null } to name or clear its Palisec account. */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/agents/[id]">) {
  const client = db();
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { status?: unknown; published?: unknown; aiLimitUsd?: unknown; aiExpiryDays?: unknown; palisecAccount?: unknown } | null;
  try {
    if (body && "palisecAccount" in body) await setAgentPalisecAccount(client, owner, id, body.palisecAccount);
    else if (body && "aiLimitUsd" in body) await setAgentAiLimit(client, owner, id, body.aiLimitUsd, body.aiExpiryDays);
    else if (body && "published" in body) await setAgentPublished(client, owner, id, body.published);
    else await setAgentStatus(client, owner, id, body?.status);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    if (cause instanceof AgentInputError) return NextResponse.json({ error: cause.message }, { status: 400 });
    console.error(cause);
    return NextResponse.json({ error: "Updating failed. Please try again." }, { status: 500 });
  }
}
