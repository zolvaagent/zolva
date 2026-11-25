import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { alertMessage, newLinkCode, parseCommand, sendTelegram, telegramWebhookSecret } from "./telegram";

describe("telegramWebhookSecret", () => {
  it("equals what scripts/telegram-webhook.mjs registers, and fits Telegram's charset", async () => {
    const secret = await telegramWebhookSecret("session-secret-for-test");
    expect(secret).toBe(createHmac("sha256", "session-secret-for-test").update("telegram-webhook").digest("hex"));
    expect(secret).toMatch(/^[A-Za-z0-9_-]{1,256}$/);
  });
});

describe("newLinkCode", () => {
  it("is 24 url-safe characters and different each time", () => {
    const a = newLinkCode();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newLinkCode()).not.toBe(a);
  });
});

describe("parseCommand", () => {
  it("reads /start with its code, /stop, and anything else", () => {
    expect(parseCommand("/start abcDEF123_-abcDEF123_-")).toEqual({ kind: "start", code: "abcDEF123_-abcDEF123_-" });
    expect(parseCommand("/start@ZolvaGuardianBot abcDEF123_-abcDEF123_-")).toEqual({ kind: "start", code: "abcDEF123_-abcDEF123_-" });
    expect(parseCommand("/start")).toEqual({ kind: "start", code: null });
    expect(parseCommand("/start bad<code>")).toEqual({ kind: "start", code: null });
    expect(parseCommand("/stop")).toEqual({ kind: "stop" });
    expect(parseCommand("hello")).toEqual({ kind: "other" });
    expect(parseCommand(undefined)).toEqual({ kind: "other" });
  });
});

describe("alertMessage", () => {
  it("says what fired, that nothing was sold, and links Swap ready to sell", () => {
    const text = alertMessage({ symbol: "NVDA", kind: "stop_loss", price: 139.06, basisPrice: 151.15, quantity: 0.01096, tokenAddress: "0xabc" });
    expect(text).toContain("NVDA hit your stop loss: $139.06 (-8.0% from $151.15)");
    expect(text).toContain("nothing was sold");
    expect(text).toContain("https://zolvaagent.app/swap?sell=0xabc");
    expect(alertMessage({ symbol: "ETH", kind: "take_profit", price: 3300, basisPrice: 3000, quantity: 1, tokenAddress: "0xeth" })).toContain("ETH hit your take profit: $3,300.00 (+10.0%");
  });
});

describe("sendTelegram", () => {
  it("posts the message and never throws", async () => {
    let called: { url: string; body: unknown } | null = null;
    const ok = await sendTelegram("TOKEN", 42, "hi", (async (url: string, init: RequestInit) => {
      called = { url, body: JSON.parse(String(init.body)) };
      return new Response("{}", { status: 200 });
    }) as typeof fetch);
    expect(ok).toBe(true);
    expect(called).toEqual({ url: "https://api.telegram.org/botTOKEN/sendMessage", body: { chat_id: 42, text: "hi", disable_web_page_preview: true } });
    expect(await sendTelegram("TOKEN", 42, "hi", (async () => { throw new Error("down"); }) as typeof fetch)).toBe(false);
  });
});
