import { NextResponse } from "next/server";

import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";
import { LINK_CODE_MINUTES, newLinkCode } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** POST: a one-time link to connect Telegram ({ url }). DELETE: disconnect. Logged in only. */
export async function POST() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const username = env.telegramBotUsername;
  if (!env.telegramBotToken || !username) return NextResponse.json({ error: "Telegram alerts are not available yet." }, { status: 503 });
  const code = newLinkCode();
  const { error } = await db()
    .from("telegram_links")
    .upsert({ owner, link_code: code, code_expires_at: new Date(Date.now() + LINK_CODE_MINUTES * 60_000).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "owner" });
  if (error) {
    console.error(`telegram link failed: ${error.message}`);
    return NextResponse.json({ error: "Could not create a link. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ url: `https://t.me/${username}?start=${code}` });
}

export async function DELETE() {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const { error } = await db().from("telegram_links").update({ chat_id: null, link_code: null, code_expires_at: null, updated_at: new Date().toISOString() }).eq("owner", owner);
  if (error) return NextResponse.json({ error: "Disconnecting failed. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
