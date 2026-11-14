import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

import { checkApiKey, type KeyCheck } from "@/lib/api-keys/server";
import { API_VERSION } from "@/lib/public-api/format";
import { IP_LIMIT_MESSAGE, KEY_LIMIT_MESSAGES } from "@/lib/public-api/limits";
import { db } from "@/lib/supabase";

/**
 * Shared plumbing for every public API v1 route:
 * - a per-IP limit (Cloudflare rate limiting binding PUBLIC_API_LIMITER, 60 a minute;
 *   skipped where the binding does not exist, such as next dev),
 * - an edge cache (the Worker's Cache API) so repeated calls do not reach Supabase,
 * - open CORS, since the data is public and read-only,
 * - one error shape: { "error": { "code", "message" } },
 * - API keys: "Authorization: Bearer zk_..." (lib/api-keys). A valid key swaps the per-IP
 *   limit for the key's own limits (API_KEY_READ_LIMITER 120 a minute, API_KEY_WRITE_LIMITER
 *   30 a minute); a wrong or revoked key is a 401, never a silent fall back to keyless.
 */

type RateLimiter = { limit: (options: { key: string }) => Promise<{ success: boolean }> };

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "X-Zolva-Api-Version": API_VERSION,
};

export function apiError(status: number, code: string, message: string, extra: Record<string, string> = {}) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { ...HEADERS, "Cache-Control": "no-store", ...extra } });
}

function cloudflareEnv(): Record<string, unknown> | null {
  try {
    return getCloudflareContext().env as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The Worker's default cache; undefined outside the Workers runtime. */
function edgeCache(): Cache | undefined {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default;
}

/**
 * The per-IP limit shared by the REST API and the MCP server. Returns "limited" when the
 * caller is over it, "on" when it ran and passed, "off" where the binding does not exist.
 */
export async function checkLimit(request: Request): Promise<"limited" | "on" | "off"> {
  const limiter = cloudflareEnv()?.PUBLIC_API_LIMITER as RateLimiter | undefined;
  if (!limiter) return "off";
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await limiter.limit({ key: ip });
  return success ? "on" : "limited";
}

export type KeyLimitKind = "read" | "write";

/**
 * The per-key limits, keyed by key id so many keys behind one server IP do not share a
 * limit. Like checkLimit, "off" where the bindings do not exist (next dev, tests).
 */
export async function checkKeyLimit(keyId: string, kind: KeyLimitKind): Promise<"limited" | "on" | "off"> {
  const env = cloudflareEnv();
  const limiter = (kind === "read" ? env?.API_KEY_READ_LIMITER : env?.API_KEY_WRITE_LIMITER) as RateLimiter | undefined;
  if (!limiter) return "off";
  const { success } = await limiter.limit({ key: `${kind}:${keyId}` });
  return success ? "on" : "limited";
}

/** Checks the request's API key, if it sends one (see lib/api-keys/server.ts). */
export function checkRequestKey(request: Request): Promise<KeyCheck> {
  return checkApiKey(db(), request.headers);
}

export const INVALID_KEY_MESSAGE = "This API key is wrong or was revoked. Make a new one on your Zolva Dashboard.";
export { KEY_LIMIT_MESSAGES };

/**
 * A JSON body from the edge cache, or from the loader (then stored for maxAge seconds).
 * Used by the MCP tools, which share the REST routes' loaders and cache times. null bodies
 * (not found) are not cached.
 */
export async function cachedBody<T>(key: string, maxAge: number, load: () => Promise<T | null>): Promise<T | null> {
  const cache = edgeCache();
  const cacheKey = new Request(`https://cache.zolvaagent.app/public-api/${key}`);
  const cached = await cache?.match(cacheKey);
  if (cached) return (await cached.json()) as T;
  const body = await load();
  if (body !== null) await cache?.put(cacheKey, Response.json(body, { headers: { "Cache-Control": `public, max-age=${maxAge}` } }));
  return body;
}

/**
 * Runs a public GET handler with the limit and the cache. The handler returns the JSON
 * body, or null for "not found". maxAge is how long (seconds) a response may be reused.
 */
export async function publicGet(request: NextRequest, maxAge: number, handler: () => Promise<unknown | null>): Promise<Response> {
  let key: KeyCheck;
  try {
    key = await checkRequestKey(request);
  } catch (cause) {
    console.error("public api key", cause);
    return apiError(500, "internal_error", "Something went wrong on our side. Please try again later.");
  }
  if (key.kind === "invalid") return apiError(401, "invalid_api_key", INVALID_KEY_MESSAGE);
  const limit = key.kind === "ok" ? await checkKeyLimit(key.caller.keyId, "read") : await checkLimit(request);
  if (limit === "limited") {
    const message = key.kind === "ok" ? KEY_LIMIT_MESSAGES.read : IP_LIMIT_MESSAGE;
    return apiError(429, "rate_limited", message, { "Retry-After": "60" });
  }
  // Says whether the per-IP limit ran, so a missing binding shows up in any response.
  const limitHeader = { "X-Zolva-Rate-Limit": limit };

  // Cache by the URL without query parameters: none are used, so they must not bust the cache.
  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}${url.pathname}`);
  const cache = edgeCache();
  const cacheControl = `public, max-age=${maxAge}, s-maxage=${maxAge}`;
  const cached = await cache?.match(cacheKey);
  if (cached) {
    // Cloudflare serves cache hits with the zone's browser TTL (4 hours); keep ours, so
    // clients never hold the data longer than maxAge.
    const response = new Response(cached.body, cached);
    response.headers.set("Cache-Control", cacheControl);
    response.headers.set("X-Zolva-Rate-Limit", limitHeader["X-Zolva-Rate-Limit"]);
    return response;
  }

  let body: unknown | null;
  try {
    body = await handler();
  } catch (cause) {
    console.error("public api", url.pathname, cause);
    return apiError(500, "internal_error", "Something went wrong on our side. Please try again later.");
  }
  if (body === null) return apiError(404, "not_found", "No public agent or market matches this path.");

  const response = NextResponse.json(body, { headers: { ...HEADERS, ...limitHeader, "Cache-Control": cacheControl } });
  await cache?.put(cacheKey, response.clone());
  return response;
}

/** Answers CORS preflight requests. */
export function publicOptions() {
  return new Response(null, { status: 204, headers: { ...HEADERS, "Access-Control-Max-Age": "86400" } });
}
