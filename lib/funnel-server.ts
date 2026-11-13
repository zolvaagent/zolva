import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { DETAIL_PATTERN, VISITOR_KEY, VISITOR_PATTERN, type FunnelEvent } from "@/lib/funnel";

/**
 * Records a funnel step from a server route (see lib/funnel.ts for why login_ok and launch_ok
 * live here). The visitor id comes from the browser's cookie; without one (cookies blocked, or
 * the first request ever) a fresh id is used so the step still counts. Never throws: a failed
 * insert is logged and the login or launch goes on.
 */
export async function recordFunnelEvent(db: SupabaseClient, request: NextRequest, event: FunnelEvent, owner: string | null, detail?: string): Promise<void> {
  const cookie = request.cookies.get(VISITOR_KEY)?.value;
  const visitor = cookie && VISITOR_PATTERN.test(cookie) ? cookie : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  try {
    const { error } = await db
      .from("funnel_events")
      .insert({ event, visitor, owner: owner?.toLowerCase() ?? null, detail: detail && DETAIL_PATTERN.test(detail) ? detail : null });
    if (error) console.error(`funnel event failed: ${error.message}`);
  } catch (cause) {
    console.error("funnel event failed", cause);
  }
}
