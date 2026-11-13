import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import type { KeyCheck } from "@/lib/api-keys/server";
import { checkKeyLimit, checkLimit, checkRequestKey, INVALID_KEY_MESSAGE, KEY_LIMIT_MESSAGES } from "@/lib/public-api/http";
import { createMcpServer } from "@/lib/public-api/mcp";
import { actionDeps } from "@/lib/public-api/store";

export const dynamic = "force-dynamic";

/**
 * Zolva's MCP server over Streamable HTTP: https://zolvaagent.app/mcp (docs: /docs/mcp).
 * Stateless: every request gets a fresh server and transport and a plain JSON answer, so
 * it runs on any Worker isolate with no sessions to keep. Without a key: five read-only
 * tools with the public API's per-IP limit. With "Authorization: Bearer zk_..." the key's
 * own limit replaces the per-IP one and its action tools are added (lib/public-api/mcp-actions.ts).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

const rpcError = (status: number, message: string, extra: Record<string, string> = {}) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers: { ...CORS, ...extra } });

async function handle(request: Request): Promise<Response> {
  let key: KeyCheck;
  try {
    key = await checkRequestKey(request);
  } catch (cause) {
    console.error("mcp key", cause);
    return rpcError(500, "Something went wrong on our side. Please try again later.");
  }
  if (key.kind === "invalid") return rpcError(401, INVALID_KEY_MESSAGE, { "WWW-Authenticate": 'Bearer realm="zolva"' });

  const limit = key.kind === "ok" ? await checkKeyLimit(key.caller.keyId, "read") : await checkLimit(request);
  if (limit === "limited") return rpcError(429, key.kind === "ok" ? KEY_LIMIT_MESSAGES.read : "Too many requests: about 60 a minute per IP.", { "Retry-After": "60" });

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = createMcpServer(key.kind === "ok" ? { caller: key.caller, deps: actionDeps() } : undefined);
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}
