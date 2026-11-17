import { NextResponse } from "next/server";

import { getSessionAddress } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Trenches notify list (release 0, docs/rushr-integration-plan.md).
 * GET: whether the signed-in wallet is on the list. POST: adds it (idempotent).
 * The wallet comes from the session only, never from the body.
 */
export async function GET() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ signedIn: false, listed: false });
  const { data, error } = await db().from("trench_waitlist").select("owner").eq("owner", owner.toLowerCase()).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not check the list." }, { status: 500 });
  return NextResponse.json({ signedIn: true, listed: Boolean(data) });
}

export async function POST() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const { error } = await db().from("trench_waitlist").upsert({ owner: owner.toLowerCase() }, { onConflict: "owner", ignoreDuplicates: true });
  if (error) {
    console.error(`trench waitlist insert failed: ${error.message}`);
    return NextResponse.json({ error: "Could not add you to the list. Try again." }, { status: 500 });
  }
  return NextResponse.json({ listed: true });
}
