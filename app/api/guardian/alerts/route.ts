import { NextResponse } from "next/server";

import { getSessionAddress } from "@/lib/auth/session";
import { markAlertsRead, unreadAlertCount } from "@/lib/guardian/data";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Unread Guardian alerts of the signed-in account, for the sidebar badge: { unread }. Logged out: 0. */
export async function GET() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ unread: 0 });
  try {
    return NextResponse.json({ unread: await unreadAlertCount(db(), owner) });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ unread: 0 });
  }
}

/** Marks every alert read (opening the Guardian page does this). */
export async function POST() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  try {
    await markAlertsRead(db(), owner);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Updating alerts failed." }, { status: 500 });
  }
}
