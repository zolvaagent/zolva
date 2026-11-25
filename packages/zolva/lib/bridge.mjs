/**
 * A stdio bridge to Zolva's remote MCP server.
 *
 * MCP clients that only start local servers talk to this process over stdin and stdout;
 * every message is forwarded unchanged to https://zolvaagent.app/mcp (Streamable HTTP)
 * and every answer comes back the same way. No tools, data or logic live here, so new
 * server tools appear without a new package version.
 */
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

export const DEFAULT_URL = "https://zolvaagent.app/mcp";

/** JSON-RPC "server error" range: the code the remote server also uses for HTTP failures. */
const BRIDGE_ERROR_CODE = -32000;

/** Turns a failed HTTP call into a message the user can act on. */
function describeFailure(cause) {
  const status = typeof cause?.code === "number" ? cause.code : null;
  if (status === 401) return "Zolva refused the API key: it is wrong or was revoked. Make a new one at https://zolvaagent.app/settings#api-keys, or unset ZOLVA_API_KEY for read-only use.";
  if (status === 429) return "Too many requests to Zolva. Wait a minute and try again.";
  const detail = cause instanceof Error ? cause.message : String(cause);
  return `Could not reach Zolva's MCP server: ${detail}`;
}

/**
 * Starts the bridge. Streams default to the process's own; tests pass their own.
 * Returns a function that closes both sides.
 *
 * @param {{ apiKey?: string, url?: string, userAgent?: string, stdin?: import("node:stream").Readable, stdout?: import("node:stream").Writable, log?: (line: string) => void }} [options]
 */
export async function startBridge(options = {}) {
  const log = options.log ?? ((line) => process.stderr.write(`[zolva] ${line}\n`));
  const headers = {};
  if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;
  if (options.userAgent) headers["User-Agent"] = options.userAgent;

  const remote = new StreamableHTTPClientTransport(new URL(options.url ?? DEFAULT_URL), { requestInit: { headers } });
  const local = new StdioServerTransport(options.stdin, options.stdout);

  /** Ids of initialize requests, so the negotiated protocol version can be passed on to later calls. */
  const initializeIds = new Set();

  local.onmessage = (message) => {
    if (message.method === "initialize" && message.id !== undefined) initializeIds.add(message.id);
    // The transport already reports a failed send through onerror, which logs it.
    remote.send(message).catch((cause) => {
      // A request must get an answer, or the client waits forever. Notifications need none.
      if (message.id !== undefined && message.method !== undefined) {
        local.send({ jsonrpc: "2.0", id: message.id, error: { code: BRIDGE_ERROR_CODE, message: describeFailure(cause) } }).catch(() => {});
      }
    });
  };

  remote.onmessage = (message) => {
    if (message.id !== undefined && initializeIds.delete(message.id) && message.result?.protocolVersion) {
      remote.setProtocolVersion(message.result.protocolVersion);
    }
    local.send(message).catch((cause) => log(`Could not write to the client: ${cause}`));
  };

  remote.onerror = (cause) => log(describeFailure(cause));
  local.onerror = (cause) => log(`Client stream error: ${cause}`);

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await Promise.allSettled([remote.close(), local.close()]);
  };
  local.onclose = () => {
    close();
  };

  await remote.start();
  await local.start();
  return close;
}
