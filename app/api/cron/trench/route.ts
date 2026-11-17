import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { secretsMatch } from "@/lib/secrets";
import { db } from "@/lib/supabase";
import { runTrenchMinute } from "@/lib/trench/runner";

export const dynamic = "force-dynamic";

/**
 * The trench minute (docs/rushr-integration-plan.md). The Worker's one-minute cron calls this with
 * the shared secret. Safe to call twice: the minute is claimed once in trench_minutes.
 */
export async function POST(request: NextRequest) {
  if (!secretsMatch(request.headers.get("x-cron-secret"), env.cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runTrenchMinute(db()));
  } catch (cause) {
    console.error("trench minute failed", cause);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status: 500 });
  }
}
