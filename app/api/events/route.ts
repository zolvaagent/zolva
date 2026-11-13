import { NextResponse, type NextRequest } from "next/server";

import { getSessionAddress } from "@/lib/auth/session";
import { BROWSER_EVENTS, DETAIL_PATTERN, VISITOR_PATTERN, type FunnelEvent } from "@/lib/funnel";
import { db } from "@/lib/supabase";

/**
 * POST { event, visitor, detail? }: one browser step of the activation funnel (lib/funnel.ts).
 * login_ok and launch_ok are recorded by the login and launch routes, so they are refused here.
 * The owner comes from the session, never from the body. Unknown events and malformed ids are
 * dropped with 204 so a broken client never shows an error for tracking.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { event?: unknown; visitor?: unknown; detail?: unknown } | null;
  const event = body?.event;
  const visitor = body?.visitor;
  if (typeof event !== "string" || !(BROWSER_EVENTS as readonly string[]).includes(event)) return new NextResponse(null, { status: 204 });
  if (typeof visitor !== "string" || !VISITOR_PATTERN.test(visitor)) return new NextResponse(null, { status: 204 });
  const detail = typeof body?.detail === "string" && DETAIL_PATTERN.test(body.detail) ? body.detail : null;
  const owner = await getSessionAddress();
  const { error } = await db().from("funnel_events").insert({ event: event as FunnelEvent, visitor, owner, detail });
  if (error) console.error(`funnel event failed: ${error.message}`);
  return new NextResponse(null, { status: 204 });
}
