import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { checkGuard } from "@/lib/guardian/check";
import { balanceKey, guardianTokens, latestCloses, readBalances } from "@/lib/guardian/data";
import { env } from "@/lib/env";
import { alertMessage, sendTelegram, type GuardianAlertMessage } from "@/lib/telegram";

export type GuardianRunResult = { hour: string | null; checked: number; alerts: number; telegram: number; failed: string[] };

type ArmedRow = { id: string; owner: string; wallet: string; token_address: string; basis_price: number; stop_loss_pct: number; take_profit_pct: number | null; checked_hour: string | null };

/**
 * Hourly (cron tick, after prices and agents): checks every armed guard on the latest close. Reads
 * the balances on chain in one multicall, asks lib/guardian/check.ts (the engine) whether the stop
 * loss or take profit fires, and writes at most one alert per guard per hour. A fired guard turns
 * "triggered" and stays quiet until its owner re-arms it. Idempotent: checked_hour skips a guard
 * already checked this hour, and the alert's (guardian_id, hour) key refuses a second alert.
 */
export async function runGuardians(db: SupabaseClient): Promise<GuardianRunResult> {
  const prices = await latestCloses(db);
  if (prices.hour === null) return { hour: null, checked: 0, alerts: 0, telegram: 0, failed: [] };
  const hourIso = new Date(prices.hour * 1000).toISOString();

  const { data, error } = await db
    .from("guardians")
    .select("id, owner, wallet, token_address, basis_price, stop_loss_pct, take_profit_pct, checked_hour")
    .eq("status", "armed")
    .or(`checked_hour.is.null,checked_hour.lt.${hourIso}`)
    .limit(2000);
  if (error) throw new Error(`Loading guards failed: ${error.message}`);
  const guards = data as ArmedRow[];
  if (!guards.length) return { hour: hourIso, checked: 0, alerts: 0, telegram: 0, failed: [] };

  const tokens = new Map((await guardianTokens(db)).map((token) => [token.address, token]));
  const pairs = guards.flatMap((guard) => {
    const token = tokens.get(guard.token_address);
    return token ? [{ wallet: guard.wallet, token }] : [];
  });
  const balances = await readBalances(pairs);

  let alerts = 0;
  const failed: string[] = [];
  // New alerts to also send on Telegram, by owner.
  const outbox: { owner: string; message: GuardianAlertMessage }[] = [];
  for (const guard of guards) {
    try {
      const price = prices.closes.get(guard.token_address);
      const quantity = balances.get(balanceKey(guard.wallet, guard.token_address));
      // No price or no balance read this hour: try again next hour instead of guessing.
      if (!price || quantity === undefined) continue;
      const fired = checkGuard(
        { quantity, basisPrice: Number(guard.basis_price), stopLossPct: Number(guard.stop_loss_pct), takeProfitPct: guard.take_profit_pct === null ? null : Number(guard.take_profit_pct) },
        price.previous,
        price.close,
        prices.hour,
      );
      if (fired) {
        const { error: alertError } = await db.from("guardian_alerts").upsert(
          {
            guardian_id: guard.id,
            owner: guard.owner,
            wallet: guard.wallet,
            token_address: guard.token_address,
            kind: fired.kind,
            hour: hourIso,
            price: price.close,
            basis_price: Number(guard.basis_price),
            quantity,
            reasoning: fired.reasoning,
          },
          { onConflict: "guardian_id,hour", ignoreDuplicates: true },
        );
        if (alertError) throw new Error(alertError.message);
        alerts += 1;
        outbox.push({
          owner: guard.owner,
          message: { symbol: tokens.get(guard.token_address)?.symbol ?? "?", kind: fired.kind, price: price.close, basisPrice: Number(guard.basis_price), quantity, tokenAddress: guard.token_address },
        });
      }
      const { error: updateError } = await db
        .from("guardians")
        .update(fired ? { checked_hour: hourIso, status: "triggered", triggered_at: new Date().toISOString() } : { checked_hour: hourIso })
        .eq("id", guard.id);
      if (updateError) throw new Error(updateError.message);
    } catch (cause) {
      failed.push(`${guard.id}: ${cause instanceof Error ? cause.message.slice(0, 120) : "unknown"}`);
    }
  }
  return { hour: hourIso, checked: guards.length, alerts, telegram: await sendToTelegram(db, outbox), failed };
}

/** Sends new alerts to the owners' linked Telegram chats. Best effort: the in-app alert is already stored. */
async function sendToTelegram(db: SupabaseClient, outbox: { owner: string; message: GuardianAlertMessage }[]): Promise<number> {
  const token = env.telegramBotToken;
  if (!token || !outbox.length) return 0;
  const { data, error } = await db.from("telegram_links").select("owner, chat_id").in("owner", [...new Set(outbox.map((item) => item.owner))]).not("chat_id", "is", null);
  if (error) {
    console.error(`Loading Telegram links failed: ${error.message}`);
    return 0;
  }
  const chatOf = new Map(((data ?? []) as { owner: string; chat_id: number }[]).map((row) => [row.owner, Number(row.chat_id)]));
  let sent = 0;
  for (const item of outbox) {
    const chat = chatOf.get(item.owner);
    if (chat !== undefined && (await sendTelegram(token, chat, alertMessage(item.message)))) sent += 1;
  }
  return sent;
}
