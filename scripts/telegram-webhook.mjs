/**
 * Registers the Wallet Guardian bot's webhook with Telegram (run once after the deploy that has the bot):
 *
 *   npm run telegram:webhook
 *
 * Reads TELEGRAM_BOT_TOKEN from .dev.vars and SESSION_SECRET from .prod.vars (the webhook's secret_token is
 * HMAC-SHA256(SESSION_SECRET, "telegram-webhook"), as in lib/telegram.ts). Also sets the bot's /start and
 * /stop commands. Prints Telegram's answers only, never the token.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (file) =>
  Object.fromEntries(
    readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
const dev = read(".dev.vars");
const prod = read(".prod.vars");
if (!dev.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not in .dev.vars");
if (!prod.SESSION_SECRET) throw new Error("SESSION_SECRET is not in .prod.vars");

const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${dev.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((response) => response.json());

const secret = createHmac("sha256", prod.SESSION_SECRET).update("telegram-webhook").digest("hex");
const hook = await api("setWebhook", { url: "https://zolvaagent.app/api/telegram/webhook", secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
console.log(`setWebhook: ${hook.ok ? "ok" : "failed"} ${hook.description ?? ""}`);
const commands = await api("setMyCommands", { commands: [{ command: "start", description: "Connect your Zolva account" }, { command: "stop", description: "Stop Guardian alerts" }] });
console.log(`setMyCommands: ${commands.ok ? "ok" : "failed"} ${commands.description ?? ""}`);
