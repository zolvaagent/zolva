/**
 * What /docs/public-api and /docs/mcp show about the keyed actions, the MCP tools, the
 * errors and the limits, built from the code that runs them. api.test.ts checks that every
 * route, tool, error code and example stays in step.
 */
import { DEFAULT_SCOPES, MAX_KEYS_PER_ACCOUNT, SCOPE_LABELS, API_KEY_SCOPES, type ApiKeyScope } from "../api-keys/keys";
import { TIERS } from "../tiers";
import { PREMIUM_ENDPOINTS } from "../x402/catalog";
import { BACKTEST_MAX_DAYS, BACKTEST_MAX_MARKETS } from "../x402/premium";
import { ACTION_CAPS, ACTION_NAMES, ACTIONS, PUBLISH_MIN_HOURS, type ActionName } from "../public-api/actions";
import { RATE_LIMITS, TTL } from "../public-api/limits";
import { ME_ROUTES } from "../public-api/me-routes";
import { READ_TOOLS } from "../public-api/tools";
import { EXAMPLE_RULES } from "./rules";
import { paramRows, type ParamRow } from "./schema";

export const SITE = "https://zolvaagent.app";
export const API_BASE = `${SITE}/api/public/v1`;
export const MCP_URL = `${SITE}/mcp`;

export const SCOPE_ROWS = API_KEY_SCOPES.map((scope) => ({ scope, ...SCOPE_LABELS[scope], byDefault: DEFAULT_SCOPES.includes(scope) }));

/** A sample request body per action (agentId goes in the path, so it is left out). Checked against each action's input in the tests. */
export const EXAMPLE_BODIES: Record<ActionName, Record<string, unknown> | null> = {
  my_agents: null,
  validate_rules: { rules: EXAMPLE_RULES },
  backtest: { strategy: "custom", rules: EXAMPLE_RULES, markets: ["NVDA", "ETH"], days: 30, stopLossPct: 8 },
  write_strategy: { prompt: "Buy when the 14 hour RSI is under 30, sell when it is back above 55, take profit at 6%" },
  create_paper_agent: {
    name: "RSI dip NVDA ETH",
    strategy: "custom",
    rules: EXAMPLE_RULES,
    markets: ["NVDA", "ETH"],
    capital: 10000,
    maxPositionPct: 50,
    stopLossPct: 8,
    confirm: false,
  },
  pause_agent: null,
  resume_agent: null,
  publish_agent: { confirm: false },
  unpublish_agent: null,
  set_ai_limit: { limitUsd: 1, expiryDays: 30 },
  pause_live_agent: null,
};

export type ActionReference = {
  name: ActionName;
  title: string;
  description: string;
  method: string;
  /** With {id} for the agent id. */
  path: string;
  scopes: ApiKeyScope[];
  readOnly: boolean;
  twoStep: boolean;
  /** Counts toward the 30 writes a minute. */
  write: boolean;
  params: ParamRow[];
  example: string;
};

function curl(method: string, path: string, body: Record<string, unknown> | null, idempotent: boolean): string {
  const lines = [`curl${method === "GET" ? "" : ` -X ${method}`} ${API_BASE}${path.replace("{id}", "$AGENT_ID")}`, `  -H "Authorization: Bearer $ZOLVA_KEY"`];
  if (body) {
    lines.push(`  -H "Content-Type: application/json"`);
    if (idempotent) lines.push(`  -H "Idempotency-Key: rsi-dip-1"`);
    lines.push(`  -d '${JSON.stringify(body)}'`);
  }
  return lines.join(" \\\n");
}

/** Every keyed action in the order of ME_ROUTES, with its REST path, MCP name, scopes, inputs and a curl example. */
export const ACTION_REFERENCE: ActionReference[] = ME_ROUTES.map((route) => {
  const spec = ACTIONS[route.action];
  const path = `/me/${route.path.map((part) => (part === ":id" ? "{id}" : part)).join("/")}`;
  const params = paramRows(spec.input).filter((row) => !(row.name === "agentId" && route.path.includes(":id")));
  return {
    name: route.action,
    title: spec.title,
    description: spec.description,
    method: route.method,
    path,
    scopes: [...spec.scopes],
    readOnly: spec.annotations.readOnlyHint,
    twoStep: "confirm" in spec.input,
    write: spec.kind === "write",
    params,
    example: curl(route.method, path, EXAMPLE_BODIES[route.action], route.action === "create_paper_agent"),
  };
});

/** The five keyless MCP tools. */
export const READ_TOOL_REFERENCE = (Object.keys(READ_TOOLS) as (keyof typeof READ_TOOLS)[]).map((name) => ({
  name,
  title: READ_TOOLS[name].title,
  description: READ_TOOLS[name].description,
  params: paramRows(READ_TOOLS[name].inputSchema),
}));

/** Every keyed MCP tool, with the scopes that make it appear. */
export const KEY_TOOL_REFERENCE = ACTION_NAMES.map((name) => ({ name, title: ACTIONS[name].title, scopes: [...ACTIONS[name].scopes], params: paramRows(ACTIONS[name].input) }));

export type ApiErrorRow = { status: number; code: string; when: string };

/** Every error code the public API and the keyed routes return. api.test.ts finds each code in the source. */
export const API_ERRORS: ApiErrorRow[] = [
  { status: 400, code: "invalid_input", when: "A field is missing, has the wrong type or is out of range, or the rules or markets do not pass the checks. The message says which." },
  { status: 400, code: "invalid_json", when: "The body is not a JSON object." },
  { status: 400, code: "terms_required", when: "A create with confirm true but without acceptTerms true." },
  { status: 401, code: "api_key_required", when: "A /me path called without an Authorization header." },
  { status: 401, code: "invalid_api_key", when: "The key is wrong or was revoked. A bad key is never treated as no key." },
  { status: 402, code: "out_of_credits", when: "write_strategy with no AI credits left." },
  { status: 403, code: "insufficient_scope", when: "The key lacks a scope the action needs. The message names it." },
  { status: 404, code: "not_found", when: "Unknown path, agent or market. An agent that is not yours, private or real money (outside pause_live_agent) is also a 404." },
  { status: 405, code: "method_not_allowed", when: "Wrong HTTP method for the path. The Allow header lists the right one." },
  { status: 409, code: "too_new", when: `Publishing an agent with fewer than ${PUBLISH_MIN_HOURS} paper hours.` },
  { status: 409, code: "in_progress", when: "A create with the same Idempotency-Key is still running. Retry in a moment." },
  { status: 409, code: "idempotency_key_used", when: "The first create with this Idempotency-Key failed. Fix the input and use a new key." },
  { status: 422, code: "not_a_strategy", when: "write_strategy could not turn the prompt into rules. Describe a buy and a sell signal." },
  { status: 429, code: "rate_limited", when: "Over a per-minute limit or a daily or hourly cap. Wait for Retry-After (seconds) and try again." },
  { status: 500, code: "internal_error", when: "Something failed on Zolva's side. Retry later." },
  { status: 502, code: "ai_unavailable", when: "The AI provider failed during write_strategy. Nothing was charged; retry later." },
];

export type LimitRow = { what: string; limit: string; scope: string };

const duration = (seconds: number) => (seconds >= 60 ? `${seconds / 60} minutes` : `${seconds} seconds`);

/** One table of every limit and price a developer meets. */
export const LIMIT_ROWS: LimitRow[] = [
  { what: "Keyless reads (REST and MCP)", limit: `about ${RATE_LIMITS.ipPerMinute} a minute`, scope: "per IP" },
  { what: "Requests with an API key", limit: `${RATE_LIMITS.keyReadPerMinute} a minute`, scope: "per key" },
  { what: "Writes with an API key (also count as requests)", limit: `${RATE_LIMITS.keyWritePerMinute} a minute`, scope: "per key" },
  { what: "Backtests", limit: `${ACTION_CAPS.backtest.hour} an hour, ${ACTION_CAPS.backtest.day} a day (rolling)`, scope: "per account" },
  { what: "Paper agent creates", limit: `${ACTION_CAPS.create_paper_agent.day} a day (rolling)`, scope: "per account" },
  { what: "Backtest size", limit: `1 to ${BACKTEST_MAX_MARKETS} markets, 1 to ${BACKTEST_MAX_DAYS} days`, scope: "per call" },
  { what: "Running paper agents", limit: Object.values(TIERS).map((tier) => `${tier.activeAgents} (${tier.label})`).join(", "), scope: "per account, by ZOLVA tier" },
  { what: "AI strategy writer tries", limit: Object.values(TIERS).map((tier) => `${tier.writerPerDay} a day (${tier.label})`).join(", "), scope: "per account, by ZOLVA tier" },
  { what: "API keys", limit: `${MAX_KEYS_PER_ACCOUNT}`, scope: "per account" },
  { what: "Publishing", limit: `after ${PUBLISH_MIN_HOURS} paper hours`, scope: "per agent" },
  { what: "Cache of /agents and /agents/{id}", limit: duration(TTL.agents), scope: "keyless reads" },
  { what: "Cache of /markets and /markets/{symbol}", limit: duration(TTL.markets), scope: "keyless reads" },
  { what: "Cache of /activity", limit: duration(TTL.activity), scope: "keyless reads" },
  ...Object.values(PREMIUM_ENDPOINTS).map((endpoint) => ({ what: `x402 ${endpoint.method} ${endpoint.path}`, limit: `${endpoint.price} USDG a call`, scope: "paid per call, no key" })),
];
