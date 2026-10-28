import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { secretsMatch } from "@/lib/secrets";
import { runActiveAgents } from "@/lib/agents/runner";
import { clearMarketCache } from "@/lib/data/market";
import { runLiveAgents, type LiveResult } from "@/lib/live/runner";
import { ingestLatestCandles } from "@/lib/prices/ingest";
import { db } from "@/lib/supabase";

/**
 * The hourly heartbeat. Supabase pg_cron calls this a few minutes past every
 * hour with the shared secret in `x-cron-secret`.
 *
 * 1. Records the hour that just ended from on-chain pool prices (and fills
 *    any hour missed in the last day), then repairs two tokens' candles from
 *    GeckoTerminal when it lets us.
 * 2. Runs every active agent on the new hour (atomic, at most once per hour).
 */
export async function POST(request: NextRequest) {
  if (!secretsMatch(request.headers.get("x-cron-secret"), env.cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = db();
  const startedAt = Date.now();
  const ingest = await ingestLatestCandles(client);
  clearMarketCache();
  // Agents still run if the prices failed: they simply see no new hour.
  const agents = await runActiveAgents(client);
  // Real money agents, after the paper ones. Off unless live_settings.enabled; a failure here
  // never stops the paper agents or the prices.
  let live: LiveResult | { error: string };
  try {
    live = await runLiveAgents(client);
  } catch (cause) {
    live = { error: cause instanceof Error ? cause.message : String(cause) };
  }
  // GeckoTerminal problems are warnings only; on-chain prices are what agents need.
  const liveOk = !("error" in live) && live.failed.length === 0;
  const ok = ingest.failed.length === 0 && agents.failed.length === 0 && liveOk;
  return NextResponse.json({ ok, durationMs: Date.now() - startedAt, ingest, agents, live }, { status: ok ? 200 : 502 });
}

