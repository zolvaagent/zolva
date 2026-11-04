import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

import { API_VERSION } from "@/lib/public-api/format";

/**
 * Shared plumbing for every public API v1 route:
 * - a per-IP limit (Cloudflare rate limiting binding PUBLIC_API_LIMITER, 60 a minute;
 *   skipped where the binding does not exist, such as next dev),
 * - an edge cache (the Worker's Cache API) so repeated calls do not reach Supabase,
 * - open CORS, since the data is public and read-only,
 * - one error shape: { "error": { "code", "message" } }.
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
 * Runs a public GET handler with the limit and the cache. The handler returns the JSON
 * body, or null for "not found". maxAge is how long (seconds) a response may be reused.
 */
export async function publicGet(request: NextRequest, maxAge: number, handler: () => Promise<unknown | null>): Promise<Response> {
  const limiter = cloudflareEnv()?.PUBLIC_API_LIMITER as RateLimiter | undefined;
  if (limiter) {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await limiter.limit({ key: ip });
    if (!success) return apiError(429, "rate_limited", "Too many requests: at most 60 a minute per IP. Cache responses on your side.", { "Retry-After": "60" });
  }

  // Cache by the URL without query parameters: none are used, so they must not bust the cache.
  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}${url.pathname}`);
  const cache = edgeCache();
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  let body: unknown | null;
  try {
    body = await handler();
  } catch (cause) {
    console.error("public api", url.pathname, cause);
    return apiError(500, "internal_error", "Something went wrong on our side. Please try again later.");
  }
  if (body === null) return apiError(404, "not_found", "No public agent or market matches this path.");

  const response = NextResponse.json(body, { headers: { ...HEADERS, "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}` } });
  await cache?.put(cacheKey, response.clone());
  return response;
}

/** Answers CORS preflight requests. */
export function publicOptions() {
  return new Response(null, { status: 204, headers: { ...HEADERS, "Access-Control-Max-Age": "86400" } });
}
