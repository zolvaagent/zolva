import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { secretsMatch } from "@/lib/secrets";
import { runActiveAgents } from "@/lib/agents/runner";
import { clearMarketCache } from "@/lib/data/market";
import { ingestLatestCandles } from "@/lib/prices/ingest";

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

  const startedAt = Date.now();
  const ingest = await ingestLatestCandles();
  clearMarketCache();
  // Agents still run if the prices failed: they simply see no new hour.
  const agents = await runActiveAgents();
  // GeckoTerminal problems are warnings only; on-chain prices are what agents need.
  const ok = ingest.failed.length === 0 && agents.failed.length === 0;
  return NextResponse.json({ ok, durationMs: Date.now() - startedAt, ingest, agents }, { status: ok ? 200 : 502 });
}

