import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { closeAllLighterPositions, type LighterBinding } from "@/lib/live/perps-runner";
import { db } from "@/lib/supabase";

/**
 * The owner's emergency stop for a live Lighter agent: { agentId }. Pauses the agent and closes every
 * position on its Lighter account with reduce-only market orders. Only the agent's owner, logged in.
 * Never callable over the public API (plan-actions-perps-live.md: real money actions stay in the browser).
 */
export async function POST(request: NextRequest) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { agentId?: unknown } | null;
  const agentId = typeof body?.agentId === "string" && /^[0-9a-f-]{36}$/i.test(body.agentId) ? body.agentId.toLowerCase() : null;
  if (!agentId) return NextResponse.json({ error: "Agent not found." }, { status: 404 });

  const client = db();
  const { data: agent } = await client.from("agents").select("id, owner, mode, lighter_account_index").eq("id", agentId).maybeSingle();
  if (!agent || agent.owner !== owner || agent.mode !== "live" || agent.lighter_account_index === null) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }
  const binding = (getCloudflareContext().env as unknown as { LIGHTER?: LighterBinding }).LIGHTER ?? null;
  const token = env.lighterInternalToken;
  if (!binding || !token) {
    // Still stop new orders even when the executor is unreachable.
    await client.from("agents").update({ status: "paused" }).eq("id", agentId);
    return NextResponse.json({ error: "The Lighter executor is not reachable. The agent is paused; close the positions on Lighter directly." }, { status: 503 });
  }
  try {
    const result = await closeAllLighterPositions(client, binding, token, agentId);
    return NextResponse.json(result, { status: result.error ? 502 : 200 });
  } catch (cause) {
    console.error(cause instanceof Error ? cause.name : "close-all failed");
    return NextResponse.json({ error: "Closing failed. The agent is paused; check its positions on Lighter." }, { status: 500 });
  }
}
