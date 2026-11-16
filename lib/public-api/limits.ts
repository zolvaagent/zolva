/**
 * The public API's per-minute limits. The Cloudflare rate limiting bindings in
 * wrangler.jsonc enforce them; this file is what the error messages and the docs read.
 * limits.test.ts fails when the two disagree.
 */
export const RATE_LIMITS = {
  /** Keyless REST and MCP calls, per IP (PUBLIC_API_LIMITER). */
  ipPerMinute: 60,
  /** Every call made with an API key, per key (API_KEY_READ_LIMITER). */
  keyReadPerMinute: 120,
  /** Writes made with an API key, per key (API_KEY_WRITE_LIMITER), on top of the read limit. */
  keyWritePerMinute: 30,
} as const;

/** How long each public body may be reused (edge cache and Cache-Control), in seconds. */
export const TTL = { agents: 300, markets: 60, activity: 60 } as const;

export const RATE_LIMIT_BINDINGS = {
  PUBLIC_API_LIMITER: RATE_LIMITS.ipPerMinute,
  API_KEY_READ_LIMITER: RATE_LIMITS.keyReadPerMinute,
  API_KEY_WRITE_LIMITER: RATE_LIMITS.keyWritePerMinute,
} as const;

export const KEY_LIMIT_MESSAGES = {
  read: `Too many requests for this API key: ${RATE_LIMITS.keyReadPerMinute} a minute.`,
  write: `Too many writes for this API key: ${RATE_LIMITS.keyWritePerMinute} a minute.`,
} as const;

/** Where a user makes, scopes and revokes API keys. */
export const API_KEYS_URL = "https://zolvaagent.app/settings#api-keys";

export const IP_LIMIT_MESSAGE = `Too many requests: about ${RATE_LIMITS.ipPerMinute} a minute per IP. Cache responses on your side.`;
