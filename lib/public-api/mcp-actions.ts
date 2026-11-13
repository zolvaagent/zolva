/**
 * The MCP tools that need an API key (lib/public-api/actions.ts), registered only for the
 * scopes the caller's key holds, so an AI client never sees a tool it cannot use. No
 * server imports: the tests connect an MCP SDK client to a server built with this.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ApiCaller } from "../api-keys/keys";
import { ACTION_NAMES, ACTIONS, ActionError, allowedFor, runAction, type ActionDeps } from "./actions";

/** Added to the MCP instructions for a keyed session. */
export const KEYED_INSTRUCTIONS = [
  "This session uses an API key and acts for one Zolva account: it can only change that account's paper agents, and the only real money action is pause_live_agent.",
  "create_paper_agent and publish_agent take two steps: call with confirm false (the default) to get a preview, show it to the user, and only call again with confirm true when the user agreed.",
].join(" ");

const errorResult = (error: ActionError) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ error: { code: error.code, status: error.status, message: error.message } }) }],
  isError: true,
});

export function registerActionTools(server: McpServer, caller: ApiCaller, deps: ActionDeps): void {
  for (const name of ACTION_NAMES) {
    if (!allowedFor(name, caller.scopes)) continue;
    const spec = ACTIONS[name];
    server.registerTool(
      name,
      { title: spec.title, description: spec.description, inputSchema: spec.input, annotations: { title: spec.title, ...spec.annotations } },
      async (input: unknown) => {
        try {
          const body = await runAction(name, input, { caller, deps, idempotencyKey: null });
          return { content: [{ type: "text" as const, text: JSON.stringify(body) }] };
        } catch (cause) {
          return errorResult(cause instanceof ActionError ? cause : new ActionError(500, "internal_error", "Something went wrong on our side. Please try again later."));
        }
      },
    );
  }
}
