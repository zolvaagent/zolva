import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { db } from "@/lib/supabase";
import { parseCommand, sendTelegram, telegramWebhookSecret } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * Telegram's webhook for the Wallet Guardian bot. Only updates carrying our secret_token (derived from the
 * session secret, registered by npm run telegram:webhook) are read. "/start <code>" in a private chat links
 * the account that asked for that code on /guardian; "/stop" unlinks the chat. Always answers 200 so
 * Telegram does not retry.
 */
export async function POST(request: NextRequest) {
  const token = env.telegramBotToken;
  if (!token) return NextResponse.json({ ok: true });
  const expected = await telegramWebhookSecret(env.sessionSecret);
  if (request.headers.get("x-telegram-bot-api-secret-token") !== expected) return NextResponse.json({ ok: false }, { status: 401 });

  const update = (await request.json().catch(() => null)) as { message?: { text?: unknown; chat?: { id?: number; type?: string } } } | null;
  const chat = update?.message?.chat;
  if (!chat || typeof chat.id !== "number") return NextResponse.json({ ok: true });
  if (chat.type !== "private") {
    await sendTelegram(token, chat.id, "Zolva Guardian only works in a private chat with the bot.");
    return NextResponse.json({ ok: true });
  }

  const client = db();
  const command = parseCommand(update?.message?.text);
  if (command.kind === "start") {
    if (!command.code) {
      await sendTelegram(token, chat.id, "To connect, open zolvaagent.app/guardian while logged in and tap “Connect Telegram”.");
      return NextResponse.json({ ok: true });
    }
    const { data: link } = await client.from("telegram_links").select("owner, code_expires_at").eq("link_code", command.code).maybeSingle();
    if (!link || !link.code_expires_at || Date.parse(link.code_expires_at) < Date.now()) {
      await sendTelegram(token, chat.id, "That link has expired. Open zolvaagent.app/guardian and tap “Connect Telegram” again.");
      return NextResponse.json({ ok: true });
    }
    // One chat per account and one account per chat: a chat linked elsewhere moves to this account.
    await client.from("telegram_links").update({ chat_id: null, updated_at: new Date().toISOString() }).eq("chat_id", chat.id);
    const { error } = await client
      .from("telegram_links")
      .update({ chat_id: chat.id, link_code: null, code_expires_at: null, linked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("owner", link.owner);
    await sendTelegram(
      token,
      chat.id,
      error
        ? "Connecting failed. Please try again from zolvaagent.app/guardian."
        : `Connected to Zolva Guardian for wallet ${link.owner.slice(0, 6)}…${link.owner.slice(-4)}. You'll get a message here when one of your guards fires. Send /stop to disconnect.`,
    );
    return NextResponse.json({ ok: true });
  }
  if (command.kind === "stop") {
    const { data } = await client.from("telegram_links").update({ chat_id: null, updated_at: new Date().toISOString() }).eq("chat_id", chat.id).select("owner");
    await sendTelegram(token, chat.id, data?.length ? "Disconnected. Guardian alerts stay in the app at zolvaagent.app/guardian." : "This chat is not connected.");
    return NextResponse.json({ ok: true });
  }
  await sendTelegram(token, chat.id, "I only send Wallet Guardian alerts. Manage your guards at zolvaagent.app/guardian. /stop disconnects this chat.");
  return NextResponse.json({ ok: true });
}
