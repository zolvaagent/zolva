/**
 * The REST paths for the API key actions, under /api/public/v1/me (docs: /docs/public-api).
 * Each path is one action of lib/public-api/actions.ts, so REST and MCP never drift apart.
 */
import type { ActionName } from "./actions";

type Route = { method: "GET" | "POST" | "PUT"; path: string[]; action: ActionName };

/** ":id" is the agent id, passed to the action as agentId. */
export const ME_ROUTES: Route[] = [
  { method: "GET", path: ["agents"], action: "my_agents" },
  { method: "POST", path: ["agents"], action: "create_paper_agent" },
  { method: "POST", path: ["agents", ":id", "pause"], action: "pause_agent" },
  { method: "POST", path: ["agents", ":id", "resume"], action: "resume_agent" },
  { method: "POST", path: ["agents", ":id", "publish"], action: "publish_agent" },
  { method: "POST", path: ["agents", ":id", "unpublish"], action: "unpublish_agent" },
  { method: "PUT", path: ["agents", ":id", "ai-limit"], action: "set_ai_limit" },
  { method: "POST", path: ["live-agents", ":id", "pause"], action: "pause_live_agent" },
  { method: "POST", path: ["rules", "validate"], action: "validate_rules" },
  { method: "POST", path: ["backtest"], action: "backtest" },
  { method: "POST", path: ["strategy"], action: "write_strategy" },
];

export type RouteMatch = { action: ActionName; agentId: string | null } | { error: 404 | 405; allow?: string };

export function matchMeRoute(method: string, segments: string[]): RouteMatch {
  const fits = (route: Route) => route.path.length === segments.length && route.path.every((part, i) => part === ":id" || part === segments[i]);
  const candidates = ME_ROUTES.filter(fits);
  if (!candidates.length) return { error: 404 };
  const route = candidates.find((candidate) => candidate.method === method);
  if (!route) return { error: 405, allow: candidates.map((candidate) => candidate.method).join(", ") };
  const index = route.path.indexOf(":id");
  return { action: route.action, agentId: index >= 0 ? segments[index] : null };
}
