/**
 * Telegram bot for Wallet Guardian alerts: the pure parts (messages, commands, the webhook secret) and a
 * thin sender over the Bot API. No package: Telegram's Bot API is plain HTTPS + JSON.
 */

/** Characters Telegram allows in a webhook secret_token (and in a /start payload). */
const SECRET_CHARS = /^[A-Za-z0-9_-]+$/;

/**
 * The webhook's secret_token, derived from the session secret, so nothing extra has to be stored:
 * hex(HMAC-SHA256(sessionSecret, "telegram-webhook")). Telegram echoes it in
 * X-Telegram-Bot-Api-Secret-Token on every update; anything without it is refused.
 */
export async function telegramWebhookSecret(sessionSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("telegram-webhook"));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A random one-time link code (base64url, 24 characters), valid for LINK_CODE_MINUTES. */
export function newLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const LINK_CODE_MINUTES = 15;

export type TelegramCommand = { kind: "start"; code: string | null } | { kind: "stop" } | { kind: "other" };

/** Reads "/start <code>", "/stop" (also with @BotName) from a message's text. */
export function parseCommand(text: unknown): TelegramCommand {
  if (typeof text !== "string") return { kind: "other" };
  const [head, payload] = text.trim().split(/\s+/, 2);
  const command = head.split("@")[0].toLowerCase();
  if (command === "/start") return { kind: "start", code: payload && SECRET_CHARS.test(payload) && payload.length <= 64 ? payload : null };
  if (command === "/stop") return { kind: "stop" };
  return { kind: "other" };
}

export type GuardianAlertMessage = {
  symbol: string;
  kind: "stop_loss" | "take_profit";
  price: number;
  basisPrice: number;
  quantity: number;
  tokenAddress: string;
};

const money = (value: number) => (value >= 10 ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${value.toPrecision(4)}`);

/** The alert as a plain-text Telegram message, with the link that opens Swap ready to sell. */
export function alertMessage(alert: GuardianAlertMessage, site = "https://zolvaagent.app"): string {
  const change = (alert.price / alert.basisPrice - 1) * 100;
  const head = alert.kind === "stop_loss" ? `🔻 ${alert.symbol} hit your stop loss` : `🎯 ${alert.symbol} hit your take profit`;
  return [
    `${head}: ${money(alert.price)} (${change >= 0 ? "+" : ""}${change.toFixed(1)}% from ${money(alert.basisPrice)}).`,
    `You hold ${alert.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${alert.symbol}. Zolva Guardian only alerts; nothing was sold.`,
    `Sell on Zolva Swap: ${site}/swap?sell=${alert.tokenAddress}`,
    `Your guards: ${site}/guardian`,
  ].join("\n");
}

/** Sends one plain-text message. Never throws: returns whether Telegram accepted it. */
export async function sendTelegram(botToken: string, chatId: number, text: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
