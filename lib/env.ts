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
  /**
   * Real money spike (owner only, local): the Privy signer (key quorum) and
   * policy created by `npm run live:setup`. Null until that has run.
   */
  /**
   * Live executor: the private key of Zolva's Privy signer, used to sign
   * swaps for allowlisted wallets under their policy. Null keeps live trading off.
   */
  get privyAuthorizationKey(): string | null {
    return optional("PRIVY_AUTHORIZATION_KEY");
  },
  /** Turns on /api/dev/live-sign-check (local wrangler dev only; never set as a Worker secret). */
  get liveSignCheck(): boolean {
    return optional("LIVE_SIGN_CHECK") === "1";
  },
  get liveSigner(): { signerId: string; policyId: string } | null {
    const signerId = optional("PRIVY_SIGNER_ID");
    const policyId = optional("PRIVY_LIVE_POLICY_ID");
    return signerId && policyId ? { signerId, policyId } : null;
  },
  /**
   * The ZOLVA token for holder tiers (docs/ai-and-token-plan.md section 11). Null until the
   * token launches: then every account stays on the Free tier.
   */
  get zolvaToken(): { address: `0x${string}`; decimals: number } | null {
    const address = optional("ZOLVA_TOKEN_ADDRESS")?.toLowerCase();
    if (!address || !/^0x[0-9a-f]{40}$/.test(address)) return null;
    const decimals = Number(optional("ZOLVA_TOKEN_DECIMALS") ?? 18);
    return { address: address as `0x${string}`, decimals: Number.isInteger(decimals) && decimals >= 0 ? decimals : 18 };
  },
  /**
   * Public links for the launched ZOLVA token (scripts/token-launch.mts writes both): its main
   * pool (GeckoTerminal page) and the page where people trade it (Pons). Either may be null.
   */
  get zolvaLinks(): { pool: `0x${string}` | null; tradeUrl: string | null } {
    const pool = optional("ZOLVA_POOL_ADDRESS")?.toLowerCase();
    const tradeUrl = optional("ZOLVA_TRADE_URL");
    return {
      pool: pool && /^0x[0-9a-f]{40}$/.test(pool) ? (pool as `0x${string}`) : null,
      tradeUrl: tradeUrl && /^https:\/\//.test(tradeUrl) ? tradeUrl : null,
    };
  },
  /**
   * Premium API over x402 (lib/x402). Off unless X402_ENABLED is "1" and Zolva's
   * receiving address is set; then paid endpoints answer 402 with a USDG price.
   */
  get x402(): { payTo: `0x${string}` } | null {
    const payTo = optional("X402_PAY_TO")?.toLowerCase();
    if (optional("X402_ENABLED") !== "1" || !payTo || !/^0x[0-9a-f]{40}$/.test(payTo)) return null;
    return { payTo: payTo as `0x${string}` };
  },
  /**
   * Where USDG credit top-ups are paid (lib/usdg-topup.ts): CREDITS_PAY_TO, or else Zolva's
   * x402 receiving address. Null when neither is set: then the USDG top-up stays off.
   */
  get creditsPayTo(): `0x${string}` | null {
    const payTo = (optional("CREDITS_PAY_TO") ?? optional("X402_PAY_TO"))?.toLowerCase();
    return payTo && /^0x[0-9a-f]{40}$/.test(payTo) ? (payTo as `0x${string}`) : null;
  },
  /** The Privy server wallet that settles x402 payments and pays their gas (scripts/x402-relayer-setup.mts). */
  get x402Relayer(): { walletId: string; address: `0x${string}` } | null {
    const walletId = optional("X402_RELAYER_WALLET_ID");
    const address = optional("X402_RELAYER_ADDRESS")?.toLowerCase();
    if (!walletId || !address || !/^0x[0-9a-f]{40}$/.test(address)) return null;
    return { walletId, address: address as `0x${string}` };
  },
  get privy(): { appId: string; appSecret: string } | null {
    const appId = optional("PRIVY_APP_ID");
    const appSecret = optional("PRIVY_APP_SECRET");
    return appId && appSecret ? { appId, appSecret } : null;
  },
};
