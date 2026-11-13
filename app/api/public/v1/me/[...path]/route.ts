import { NextResponse, type NextRequest } from "next/server";

import { ActionError, runAction } from "@/lib/public-api/actions";
import { API_VERSION } from "@/lib/public-api/format";
import { checkKeyLimit, checkRequestKey, INVALID_KEY_MESSAGE, KEY_LIMIT_MESSAGES } from "@/lib/public-api/http";
import { matchMeRoute } from "@/lib/public-api/me-routes";
import { actionDeps } from "@/lib/public-api/store";

export const dynamic = "force-dynamic";

/**
 * /api/public/v1/me/...: the API key actions over REST (paths in lib/public-api/me-routes.ts,
 * docs: /docs/public-api). Needs "Authorization: Bearer zk_...". Never cached, and no CORS:
 * keys belong on a server or in a CLI, not in a web page.
 */

const HEADERS = { "Cache-Control": "no-store", "X-Zolva-Api-Version": API_VERSION };

const fail = (status: number, code: string, message: string, extra: Record<string, string> = {}) =>
  NextResponse.json({ error: { code, message } }, { status, headers: { ...HEADERS, ...extra } });

async function handle(request: NextRequest, context: RouteContext<"/api/public/v1/me/[...path]">): Promise<Response> {
  const { path } = await context.params;
  const route = matchMeRoute(request.method, path);
  if ("error" in route) {
    return route.error === 405 ? fail(405, "method_not_allowed", `Use ${route.allow} on this path.`, { Allow: route.allow ?? "" }) : fail(404, "not_found", "No API path matches. See https://zolvaagent.app/docs/public-api.");
  }

  let key;
  try {
    key = await checkRequestKey(request);
  } catch (cause) {
    console.error("me api key", cause);
    return fail(500, "internal_error", "Something went wrong on our side. Please try again later.");
  }
  if (key.kind === "none") return fail(401, "api_key_required", "Send an API key: Authorization: Bearer zk_... Make one on your Zolva Dashboard.", { "WWW-Authenticate": 'Bearer realm="zolva"' });
  if (key.kind === "invalid") return fail(401, "invalid_api_key", INVALID_KEY_MESSAGE, { "WWW-Authenticate": 'Bearer realm="zolva"' });
  if ((await checkKeyLimit(key.caller.keyId, "read")) === "limited") return fail(429, "rate_limited", KEY_LIMIT_MESSAGES.read, { "Retry-After": "60" });

  let body: unknown = {};
  if (request.method !== "GET") {
    const text = await request.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        return fail(400, "invalid_json", "The body must be JSON.");
      }
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return fail(400, "invalid_json", "The body must be a JSON object.");
  }
  const input = route.agentId === null ? body : { ...(body as object), agentId: route.agentId };
  const idempotencyKey = request.headers.get("idempotency-key")?.trim().slice(0, 200) || null;

  try {
    const result = await runAction(route.action, input, { caller: key.caller, deps: actionDeps(), idempotencyKey });
    const status = route.action === "create_paper_agent" && result.created === true && result.duplicate === false ? 201 : 200;
    return NextResponse.json(result, { status, headers: HEADERS });
  } catch (cause) {
    const error = cause instanceof ActionError ? cause : new ActionError(500, "internal_error", "Something went wrong on our side. Please try again later.");
    return fail(error.status, error.code, error.message, error.status === 429 ? { "Retry-After": "60" } : {});
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
