/**
 * API keys (docs: /docs/public-api, plan: docs/plan-actions-perps-live.md section 1).
 * Pure helpers shared by the Dashboard routes, the Bearer check and the tests: the key
 * format, hashing, scopes and which scopes a country may hold. Uses Web Crypto, which
 * exists in Workers, Node and browsers.
 */
import { isBlockedCountry } from "../auth/geo";

export const API_KEY_SCOPES = ["read:private", "compute", "ai", "agents:write", "live:stop"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** Who a valid key acts for: the key's owner account, limited to the key's scopes. */
export type ApiCaller = { keyId: string; owner: string; scopes: ApiKeyScope[] };

/** Ticked by default on the Dashboard; the others are opt-in. */
export const DEFAULT_SCOPES: ApiKeyScope[] = ["read:private", "compute"];

/** Scopes that change the account or spend its credits: refused for blocked countries. */
export const WRITE_SCOPES: ApiKeyScope[] = ["ai", "agents:write", "live:stop"];

export const MAX_KEYS_PER_ACCOUNT = 5;

export const SCOPE_LABELS: Record<ApiKeyScope, { title: string; detail: string }> = {
  "read:private": { title: "Read your agents", detail: "Your own agents, private and real money ones included" },
  compute: { title: "Backtests", detail: "Check rules and replay them on past prices" },
  ai: { title: "AI", detail: "Write strategies with AI and change AI limits; spends your AI credits" },
  "agents:write": { title: "Manage paper agents", detail: "Create, pause, resume, publish and unpublish paper agents" },
  "live:stop": { title: "Stop real money agents", detail: "Pause your real money agents. Nothing else with real money" },
};

const KEY_PATTERN = /^zk_[A-Za-z0-9_-]{43}$/;

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A new secret: "zk_" plus 32 random bytes, base64url (43 characters). */
export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `zk_${base64url(bytes)}`;
}

/** Whether a string looks like a Zolva key, checked before any database lookup. */
export function looksLikeApiKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

/** SHA-256 of the full secret, lowercase hex: the only form stored. */
export async function hashApiKey(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** What the Dashboard shows to tell keys apart: "zk_" and the next 6 characters. */
export function keyPrefix(secret: string): string {
  return secret.slice(0, 9);
}

/** The secret from an "Authorization: Bearer ..." header, or null when there is none. */
export function bearerToken(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : "";
}

/**
 * Checks the scopes picked for a new key. Unknown scopes are refused, duplicates dropped,
 * and write scopes are refused when the account's country is blocked (lib/auth/geo.ts).
 */
export function parseScopes(value: unknown, country: string | null): { scopes: ApiKeyScope[] } | { error: string } {
  if (!Array.isArray(value) || value.length === 0) return { error: "Pick at least one scope." };
  const scopes: ApiKeyScope[] = [];
  for (const item of value) {
    const scope = API_KEY_SCOPES.find((known) => known === item);
    if (!scope) return { error: `Unknown scope: ${String(item).slice(0, 40)}.` };
    if (!scopes.includes(scope)) scopes.push(scope);
  }
  if (isBlockedCountry(country) && scopes.some((scope) => WRITE_SCOPES.includes(scope))) {
    return { error: "Keys made from your country can read and backtest only. Untick the write scopes." };
  }
  return { scopes };
}

/** Checks the name of a new key: 1 to 40 characters after trimming. */
export function parseKeyName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return name.length >= 1 && name.length <= 40 ? name : null;
}
