import { NextResponse, type NextRequest } from "next/server";

import { askAgent } from "@/lib/ai/ask-service";
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
    return NextResponse.json({ answer: result.answer, costUsd: result.costUsd });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
