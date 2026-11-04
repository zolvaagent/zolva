import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { checkLimit } from "@/lib/public-api/http";
import { createMcpServer } from "@/lib/public-api/mcp";

export const dynamic = "force-dynamic";

/**
 * Zolva's MCP server over Streamable HTTP: https://zolvaagent.app/mcp (docs: /docs/mcp).
 * Stateless: every request gets a fresh server and transport and a plain JSON answer, so
 * it runs on any Worker isolate with no sessions to keep. Read-only and keyless, with the
 * public API's per-IP limit.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

async function handle(request: Request): Promise<Response> {
  if ((await checkLimit(request)) === "limited") {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Too many requests: about 60 a minute per IP." }, id: null },
      { status: 429, headers: { ...CORS, "Retry-After": "60" } },
    );
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = createMcpServer();
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
