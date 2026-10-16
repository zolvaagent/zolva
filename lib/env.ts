import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Reads a required secret. On Cloudflare these are Worker secrets, locally
 * they come from .dev.vars. Both reach the Cloudflare context; `next dev`
 * does not copy .dev.vars into process.env, so the context is read first.
 *
 * Blank counts as missing: copying .dev.vars.example produces empty values,
 * and an empty key should fail loudly here rather than as a vague 401 later.
 */
function required(name: keyof CloudflareEnv & string): string {
  const fromContext: unknown = getCloudflareContext().env[name];
  const raw = typeof fromContext === "string" ? fromContext : process.env[name];
  const value = raw?.trim();
  if (!value) {
    throw new MissingEnvError(name);
  }
  return value;
}

/** Reads an optional setting; blank or absent returns null. */
function optional(name: string): string | null {
  const fromContext: unknown = (getCloudflareContext().env as unknown as Record<string, unknown>)[name];
  const raw = typeof fromContext === "string" ? fromContext : process.env[name];
  return raw?.trim() || null;
}

export class MissingEnvError extends Error {
  constructor(readonly variable: string) {
    super(`Missing environment variable ${variable}. See .dev.vars.example.`);
    this.name = "MissingEnvError";
  }
}

export const env = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  /** Shared secret pg_cron sends to /api/cron/tick. */
  get cronSecret() {
    return required("CRON_SECRET");
  },
  /** Robinhood Chain RPC (Alchemy); the URL contains the API key. Hourly prices are read through it. */
  get robinhoodRpcUrl() {
    return required("ROBINHOOD_RPC_URL");
  },
  /** HMAC key for the wallet session cookie. */
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  /**
   * Privy app (email and Google login). Optional: without both values the
   * app offers wallet login only. The app ID is public; the secret is not.
   */
  /** OpenRouter key for the AI co-pilot. Absent = co-pilot off, agents trade on their rules alone. */
  get openRouterKey(): string | null {
    return optional("OPENROUTER_API_KEY");
  },
  /** Most all AI reviews together may cost per UTC day, in USD (the global brake). Default $5. */
  get aiDailyBudgetUsd(): number {
    const value = Number(optional("AI_DAILY_BUDGET_USD") ?? 5);
    return Number.isFinite(value) && value >= 0 ? value : 5;
  },
  get privy(): { appId: string; appSecret: string } | null {
    const appId = optional("PRIVY_APP_ID");
    const appSecret = optional("PRIVY_APP_SECRET");
    return appId && appSecret ? { appId, appSecret } : null;
  },
};
