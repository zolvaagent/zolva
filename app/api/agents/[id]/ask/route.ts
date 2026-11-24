import { NextResponse, type NextRequest } from "next/server";

import { askAgent, askCredits } from "@/lib/ai/ask-service";
import { getSessionAddress } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

/**
 * Ask an agent about its own decisions: { "question": string, "history"?: [{ question, answer }] }.
 * Logged in only; paid from the asker's AI credits (lib/ai/ask-service.ts).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const asker = await getSessionAddress();
  if (!asker) return NextResponse.json({ error: "Log in to ask this agent." }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { question?: unknown; history?: unknown } | null;
  try {
    const result = await askAgent(db(), asker, id, body?.question, body?.history);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ answer: result.answer, followUps: result.followUps, costUsd: result.costUsd, creditsUsd: result.creditsUsd });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

/** The logged-in visitor's AI credits left, for the Ask panel: { creditsUsd }. */
export async function GET() {
  const asker = await getSessionAddress();
  if (!asker) return NextResponse.json({ error: "Log in to ask this agent." }, { status: 401 });
  try {
    return NextResponse.json({ creditsUsd: await askCredits(db(), asker) });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Loading credits failed." }, { status: 500 });
  }
}
