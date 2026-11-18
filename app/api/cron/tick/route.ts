import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { secretsMatch } from "@/lib/secrets";
import { runActiveAgents } from "@/lib/agents/runner";
import { clearMarketCache } from "@/lib/data/market";
import { refreshVerifyStatuses } from "@/lib/data/verify-status";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { runLighterAgents, type LighterBinding, type PerpsLiveResult } from "@/lib/live/perps-runner";
import { runLiveAgents, type LiveResult } from "@/lib/live/runner";
import { hourlyMembershipUpkeep } from "@/lib/membership";
import { ingestLatestCandles } from "@/lib/prices/ingest";
import { db } from "@/lib/supabase";

/**
 * The hourly heartbeat. Supabase pg_cron calls this a few minutes past every
 * hour with the shared secret in `x-cron-secret`.
 *
 * 1. Records the hour that just ended from on-chain pool prices (and fills
 *    any hour missed in the last day), then repairs two tokens' candles from
 *    GeckoTerminal when it lets us (never a close an agent already acted on).
 * 2. Runs every active agent on the new hour (atomic, at most once per hour).
 * 3. Re-checks a few public agents with Verify for the README badge (best effort).
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
  // Real money perps on Lighter (owner only). Off unless live trading is on and the LIGHTER service
  // binding (the zolva-lighter Worker) and its token are set. Never stops anything above.
  let perps: PerpsLiveResult | { error: string };
  try {
    const binding = (getCloudflareContext().env as unknown as { LIGHTER?: LighterBinding }).LIGHTER ?? null;
    perps = await runLighterAgents(client, binding, env.lighterInternalToken);
  } catch (cause) {
    perps = { error: cause instanceof Error ? cause.message : String(cause) };
  }
  // GeckoTerminal problems are warnings only; on-chain prices are what agents need.
  // ZOLVA holder tiers: the hourly price for the 7 day average, and stale balance reads. Best effort.
  const membership = await hourlyMembershipUpkeep(client, Math.floor(Date.now() / 3_600_000) * 3600).catch((cause: unknown) => ({
    price: null,
    refreshed: 0,
    note: cause instanceof Error ? cause.message : String(cause),
  }));
  // README badge: re-check a few public agents with Verify, oldest result first. Best effort, last, so it
  // never delays prices or agents.
  const verify = await refreshVerifyStatuses(client).catch((cause: unknown) => ({ error: cause instanceof Error ? cause.message : String(cause) }));
  const liveOk = !("error" in live) && live.failed.length === 0;
  const perpsOk = !("error" in perps) && perps.failed.length === 0;
  const ok = ingest.failed.length === 0 && agents.failed.length === 0 && liveOk && perpsOk;
  return NextResponse.json({ ok, durationMs: Date.now() - startedAt, ingest, agents, live, perps, membership, verify }, { status: ok ? 200 : 502 });
}

