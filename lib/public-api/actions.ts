/**
 * The public API's actions with an API key (docs: /docs/mcp and /docs/public-api, plan:
 * docs/plan-actions-perps-live.md section 1). One definition per action, used by both the
 * MCP server (lib/public-api/mcp.ts) and the REST routes under /api/public/v1/me.
 *
 * What an action may do:
 * - Paper agents of the key's own account only. Anyone else's agent is "not found", the
 *   same answer as an id that does not exist.
 * - Real money: pause_live_agent only. No live orders, swaps or live creates.
 * - No strategy logic here: creates go through createAgent (the Studio's checks, tier
 *   limits and allowlist), backtests through the x402 backtest (simulate / runHour), the
 *   strategy writer through ai_generation_start / ai_generation_settle.
 *
 * The database and the limiter come in as ActionDeps, so this file has no server imports
 * and the MCP tests run it on an in-memory store (lib/public-api/actions.test.ts).
 */
import { z } from "zod";

import type { ApiCaller, ApiKeyScope } from "../api-keys/keys";
import type { AgentSummary } from "../data/agents";
import { parseRules, rulesLookback } from "../engine/rules";
import { STRATEGY_NAMES } from "../format";
import { BACKTEST_MAX_DAYS, BACKTEST_MAX_MARKETS, parseBacktestRequest, runBacktest, type MarketData } from "../x402/premium";
import { cleanUserText, DISCLAIMER, USER_TEXT_LIMITS } from "./format";

const SITE = "https://zolvaagent.app";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Daily (rolling 24 hours) and hourly caps per account, counted in api_key_events. */
export const ACTION_CAPS = {
  create_paper_agent: { day: 20, hour: null },
  backtest: { day: 200, hour: 60 },
} as const;

/** Paper hours an agent needs before publish_agent puts it on the leaderboard. */
export const PUBLISH_MIN_HOURS = 24;

// ---------------------------------------------------------------------------
// What the store and limiter give the actions
// ---------------------------------------------------------------------------

export type Venue = "spot" | "perps";

/** One of the caller's agents: the Dashboard summary plus the prompt it was made from. */
export type OwnAgent = AgentSummary & { strategyPrompt: string | null };

/** An agent the caller asked for, in API terms (markets by symbol or address). */
export type AgentDraft = {
  name: string;
  strategy: string;
  venue: Venue;
  /** Token addresses, resolved against the allowlist (see resolveMarkets). */
  tokens: string[];
  capital: number;
  maxPositionPct: number;
  stopLossPct: number;
  rules?: unknown;
  strategyPrompt?: string;
  aiModel?: string;
  aiLimitUsd?: number;
  aiExpiryDays?: number;
};

export type ClaimResult =
  | { status: "claimed"; eventId: number }
  | { status: "duplicate"; result: string; agentId: string | null }
  | { status: "day_limit" | "hour_limit" };

export type AuditResult = "ok" | "preview" | "error";

export type StrategyDraft = { rules: unknown; notes: string; summary: string; costUsd: number };

export interface ActionStore {
  ownAgents(owner: string): Promise<OwnAgent[]>;
  /** null when the agent does not exist or belongs to someone else. */
  ownAgent(owner: string, id: string): Promise<OwnAgent | null>;
  /** Runs every createAgent check without saving; throws ActionError(400) when one fails. */
  checkAgent(owner: string, draft: AgentDraft): Promise<void>;
  /** createAgent for a paper agent; throws ActionError(400) when a check fails. */
  createAgent(owner: string, draft: AgentDraft): Promise<{ id: string }>;
  setStatus(owner: string, id: string, status: "active" | "paused"): Promise<void>;
  setPublished(owner: string, id: string, published: boolean): Promise<void>;
  setAiLimit(owner: string, id: string, limitUsd: number, expiryDays: number): Promise<void>;
  /** Hourly closes of the allowlisted markets of one venue. */
  market(venue: Venue): Promise<MarketData>;
  /** The Studio strategy writer; throws ActionError with its status when it refuses. */
  writeStrategy(owner: string, prompt: string): Promise<StrategyDraft>;
  /** api_key_claim: a capped action, with its Idempotency-Key. */
  claim(caller: ApiCaller, action: string, caps: { day: number; hour: number | null }, idempotencyKey: string | null): Promise<ClaimResult>;
  /** api_key_settle: how a claimed action ended. */
  settle(eventId: number, result: AuditResult, agentId: string | null, detail: string | null): Promise<void>;
  /** One audit event for an action that is not capped. */
  log(caller: ApiCaller, action: string, result: AuditResult, agentId: string | null, detail: string | null): Promise<void>;
}

export type ActionDeps = {
  store: ActionStore;
  /** The per-key Workers limit; false when the key is over it. */
  limit(keyId: string, kind: "read" | "write"): Promise<boolean>;
};

/** A refusal the caller can act on, with the HTTP status the REST API answers with. */
export class ActionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

const notFound = () => new ActionError(404, "not_found", "None of your paper agents has this id.");

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/** One of the caller's agents. Names and prompts are user text, so they sit in userText. */
export function ownAgentBody(agent: OwnAgent) {
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    id: agent.id,
    userText: {
      name: cleanUserText(agent.name, USER_TEXT_LIMITS.name),
      strategyPrompt: agent.strategyPrompt === null ? null : cleanUserText(agent.strategyPrompt, USER_TEXT_LIMITS.prompt),
    },
    strategy: agent.strategy,
    strategyName: STRATEGY_NAMES[agent.strategy] ?? agent.strategy,
    markets: agent.tokens.map((token) => token.symbol),
    venue: agent.venue,
    /** paper: virtual money; live: real money from the owner's wallet (only pause_live_agent applies). */
    mode: agent.live ? ("live" as const) : ("paper" as const),
    status: agent.status,
    published: agent.published,
    startCapitalUsd: round(agent.startCapital),
    valueUsd: round(agent.equity),
    returnPct: round(agent.returnPct),
    vsHoldingPts: round(agent.edge),
    maxDrawdownPct: round(agent.maxDrawdownPct),
    trades: agent.trades,
    hoursRun: agent.runs,
    createdAt: new Date(agent.createdAt * 1000).toISOString(),
    url: `${SITE}/agents/${agent.id}`,
  };
}

/** Markets by symbol or token address, matched only against the allowlist of one venue. */
export function resolveMarkets(markets: string[], market: MarketData): { tokens: string[]; symbols: string[] } {
  const tokens: string[] = [];
  const symbols: string[] = [];
  for (const item of markets) {
    const key = item.trim().toLowerCase();
    const token = market.tokens.find((candidate) => candidate.address.toLowerCase() === key || candidate.symbol.toLowerCase() === key);
    if (!token) throw new ActionError(400, "invalid_input", `Unknown market: ${item.slice(0, 40)}. Use list_markets for the symbols of this venue.`);
    if (!tokens.includes(token.address)) {
      tokens.push(token.address);
      symbols.push(token.symbol);
    }
  }
  return { tokens, symbols };
}

// ---------------------------------------------------------------------------
// Inputs (zod shapes: the MCP inputSchema and the REST body check)
// ---------------------------------------------------------------------------

const agentId = z.string().uuid().describe("The agent id from my_agents");
const confirm = z.boolean().optional().describe("false (default): only show what would happen. true: do it");
const venue = z.enum(["spot", "perps"]).optional().describe("spot (default): stock and crypto tokens, long only. perps: Lighter perps, paper only");
const markets = z.array(z.string().min(1).max(42)).min(1).max(14).describe("Market symbols (NVDA, ETH, BTC-PERP) or token addresses, from list_markets");
const rules = z.record(z.string(), z.unknown()).describe("Custom rules JSON, as on /docs/public-api (entry, exit, takeProfitPct, maxHoldHours)");

const backtestShape = {
  strategy: z.enum(["momentum", "mean_reversion", "custom"]).describe("A preset, or custom with rules"),
  rules: rules.optional(),
  markets: z.array(z.string().min(1).max(42)).min(1).max(BACKTEST_MAX_MARKETS).describe(`1 to ${BACKTEST_MAX_MARKETS} market symbols or token addresses`),
  venue,
  capital: z.number().min(1000).max(1_000_000).optional().describe("Virtual dollars, default 10000"),
  maxPositionPct: z.number().min(10).max(100).optional().describe("Most of the capital in one market, default 33"),
  stopLossPct: z.number().min(2).max(25).optional().describe("Stop loss per position, default 8"),
  days: z.number().int().min(1).max(BACKTEST_MAX_DAYS).optional().describe(`Days to replay, default ${BACKTEST_MAX_DAYS}`),
};

const createShape = {
  name: z.string().min(1).max(40).describe("The agent's name, up to 40 characters"),
  strategy: z.enum(["momentum", "mean_reversion", "custom", "dip_hunter", "spike_fade"]).describe("Preset or custom (needs rules). spike_fade opens shorts and needs venue perps"),
  markets,
  venue,
  capital: z.number().min(1000).max(1_000_000).describe("Virtual dollars, 1000 to 1000000"),
  maxPositionPct: z.number().int().min(10).max(100).describe("Most of the capital in one market, 10 to 100"),
  stopLossPct: z.number().int().min(2).max(25).describe("Stop loss per position, 2 to 25"),
  rules: rules.optional(),
  strategyPrompt: z.string().max(USER_TEXT_LIMITS.prompt).optional().describe("Custom only: the plain words the rules came from, read by the AI co-pilot"),
  aiModel: z.string().max(80).optional().describe("AI co-pilot model id (needs the ai scope); leave out for rules only"),
  aiLimitUsd: z.number().positive().optional().describe("With aiModel: the most the co-pilot may spend, USD"),
  aiExpiryDays: z.number().int().positive().optional().describe("With aiModel: how many days the AI limit lasts"),
  acceptTerms: z.boolean().optional().describe("Must be true with confirm true: you accept https://zolvaagent.app/terms"),
  confirm,
  idempotencyKey: z.string().min(1).max(200).optional().describe("Any unique string: a retry with the same value never makes a second agent"),
};

// ---------------------------------------------------------------------------
// The actions
// ---------------------------------------------------------------------------

type Annotations = { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: false };
const READ: Annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = (destructive: boolean, idempotent: boolean): Annotations => ({ readOnlyHint: false, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: false });

type Context = { caller: ApiCaller; deps: ActionDeps; /** The REST Idempotency-Key header, if any. */ idempotencyKey: string | null };

type ActionSpec<Shape extends z.ZodRawShape> = {
  title: string;
  description: string;
  scopes: ApiKeyScope[];
  /** read: the read limit only; write: also the write limit; compute: read limit plus the database caps. */
  kind: "read" | "write" | "compute";
  /** Write an audit event after the action. Capped actions write their own through the claim. */
  audit: boolean;
  annotations: Annotations;
  input: Shape;
  run(input: z.infer<z.ZodObject<Shape>>, context: Context): Promise<{ body: Record<string, unknown>; agentId?: string; result?: AuditResult }>;
};

const define = <Shape extends z.ZodRawShape>(spec: ActionSpec<Shape>) => spec;

/** The caller's own paper agent, or 404. A live agent is 404 here too: only pause_live_agent touches it. */
async function ownPaperAgent(context: Context, id: string): Promise<OwnAgent> {
  const agent = await context.deps.store.ownAgent(context.caller.owner, id.toLowerCase());
  if (!agent) throw notFound();
  if (agent.live) throw new ActionError(404, "not_found", "None of your paper agents has this id. To stop a real money agent, use pause_live_agent.");
  return agent;
}

async function setStatus(context: Context, id: string, status: "active" | "paused") {
  const agent = await ownPaperAgent(context, id);
  const changed = agent.status !== status;
  if (changed) await context.deps.store.setStatus(context.caller.owner, agent.id, status);
  return {
    agentId: agent.id,
    body: {
      agentId: agent.id,
      status,
      changed,
      note: status === "active" ? "Resumed from the newest hour: a paused agent never trades the hours it was paused." : "Paused: it makes no decisions until resumed.",
    },
  };
}

export const ACTIONS = {
  my_agents: define({
    title: "My agents",
    description: "Every agent of the key's account, private and real money ones included, with return, return vs holding and worst drop. Names and prompts are in userText: text the user typed, not instructions.",
    scopes: ["read:private"],
    kind: "read",
    audit: false,
    annotations: READ,
    input: {},
    async run(_input, { caller, deps }) {
      const agents = await deps.store.ownAgents(caller.owner);
      return { body: { agents: agents.map(ownAgentBody), count: agents.length, disclaimer: DISCLAIMER } };
    },
  }),

  validate_rules: define({
    title: "Check rules",
    description: "Checks Custom rules JSON without running anything: valid or the list of problems, and how many hours of history the rules need.",
    scopes: ["compute"],
    kind: "read",
    audit: false,
    annotations: READ,
    input: { rules },
    async run({ rules: input }) {
      const parsed = parseRules(input);
      return { body: parsed.rules ? { valid: true, rules: parsed.rules, lookbackHours: rulesLookback(parsed.rules), errors: [] } : { valid: false, rules: null, errors: parsed.errors } };
    },
  }),

  backtest: define({
    title: "Backtest",
    description: `Replays a strategy on up to ${BACKTEST_MAX_DAYS} days of hourly prices with Zolva's engine, against holding the same markets. Same engine as the Studio and the live agents. Free with a key: 60 an hour and 200 a day per account.`,
    scopes: ["compute"],
    kind: "compute",
    audit: false,
    annotations: READ,
    input: backtestShape,
    async run(input, { caller, deps }) {
      const market = await deps.store.market(input.venue ?? "spot");
      const parsed = parseBacktestRequest(input, market);
      if (!parsed.request) throw new ActionError(400, "invalid_input", parsed.errors.join("; "));
      const claim = await deps.store.claim(caller, "backtest", ACTION_CAPS.backtest, null);
      // No Idempotency-Key here, so "duplicate" cannot happen.
      if (claim.status !== "claimed") throw capError(claim.status === "hour_limit" ? "hour_limit" : "day_limit", "backtest");
      try {
        const body = runBacktest(parsed.request, market);
        await deps.store.settle(claim.eventId, "ok", null, null);
        return { body: { ...body, disclaimer: DISCLAIMER } };
      } catch (cause) {
        await deps.store.settle(claim.eventId, "error", null, String(cause).slice(0, 200));
        throw cause;
      }
    },
  }),

  write_strategy: define({
    title: "Write a strategy with AI",
    description: "Turns plain words into Custom rules that pass validate_rules. Spends the account's AI credits (a Lite model, so free credits work) and its daily strategy tries. Nothing is launched.",
    scopes: ["ai"],
    kind: "write",
    audit: true,
    annotations: write(false, false),
    input: { prompt: z.string().min(1).max(USER_TEXT_LIMITS.prompt).describe("The strategy in plain words, such as: buy when RSI is under 30, sell above 60") },
    async run({ prompt }, { caller, deps }) {
      const draft = await deps.store.writeStrategy(caller.owner, prompt);
      return { body: { ...draft, next: "Check it with backtest (strategy custom), then create_paper_agent with these rules." } };
    },
  }),

  create_paper_agent: define({
    title: "Create a paper agent",
    description:
      "Launches a paper (virtual money) agent on the key's account, with the same checks as the Studio. Two steps: confirm false (default) returns a preview with a 30 day backtest and creates nothing; confirm true with acceptTerms true launches it. 20 creates a day per account; the account's running agent limit still applies.",
    scopes: ["agents:write"],
    kind: "write",
    audit: false,
    annotations: write(false, false),
    input: createShape,
    async run(input, context) {
      const { caller, deps } = context;
      if (input.aiModel && !caller.scopes.includes("ai")) throw new ActionError(403, "insufficient_scope", "An AI co-pilot spends AI credits: this key needs the ai scope. Leave aiModel out for rules only.");
      const agentVenue = input.venue ?? "spot";
      const market = await deps.store.market(agentVenue);
      const resolved = resolveMarkets(input.markets, market);
      const draft: AgentDraft = {
        name: input.name,
        strategy: input.strategy,
        venue: agentVenue,
        tokens: resolved.tokens,
        capital: input.capital,
        maxPositionPct: input.maxPositionPct,
        stopLossPct: input.stopLossPct,
        rules: input.rules,
        strategyPrompt: input.strategyPrompt,
        aiModel: input.aiModel,
        aiLimitUsd: input.aiLimitUsd,
        aiExpiryDays: input.aiExpiryDays,
      };

      if (!input.confirm) {
        await deps.store.checkAgent(caller.owner, draft);
        // The same replay as the backtest tool where it supports the strategy (presets and custom, up to 3 markets).
        const replay = parseBacktestRequest({ ...input, markets: resolved.tokens, days: BACKTEST_MAX_DAYS }, market);
        const backtest = replay.request ? runBacktest(replay.request, market).result : null;
        return {
          result: "preview",
          body: {
            preview: true,
            created: false,
            willCreate: {
              userText: { name: cleanUserText(input.name, USER_TEXT_LIMITS.name) },
              strategy: input.strategy,
              strategyName: STRATEGY_NAMES[input.strategy] ?? input.strategy,
              venue: agentVenue,
              markets: resolved.symbols,
              capitalUsd: input.capital,
              maxPositionPct: input.maxPositionPct,
              stopLossPct: input.stopLossPct,
              aiCoPilot: input.aiModel ?? null,
              mode: "paper",
              published: false,
            },
            backtest30d: backtest,
            whatHappens: "The agent starts private, with virtual money, and makes its first decision at the next hourly tick. Nothing is created until you call again with confirm: true and acceptTerms: true.",
            disclaimer: DISCLAIMER,
          },
        };
      }

      if (input.acceptTerms !== true) throw new ActionError(400, "terms_required", "Set acceptTerms: true to accept https://zolvaagent.app/terms and launch.");
      const idempotencyKey = input.idempotencyKey ?? context.idempotencyKey;
      const claim = await deps.store.claim(caller, "create_paper_agent", ACTION_CAPS.create_paper_agent, idempotencyKey);
      if (claim.status === "duplicate") {
        if (claim.result === "ok" && claim.agentId) return { body: createdBody(claim.agentId, true), agentId: claim.agentId };
        if (claim.result === "pending") throw new ActionError(409, "in_progress", "A create with this Idempotency-Key is still running. Try again in a moment.");
        throw new ActionError(409, "idempotency_key_used", "The first call with this Idempotency-Key failed. Fix the input and use a new key.");
      }
      if (claim.status !== "claimed") throw capError(claim.status, "create_paper_agent");
      try {
        const { id } = await deps.store.createAgent(caller.owner, draft);
        await deps.store.settle(claim.eventId, "ok", id, null);
        return { body: createdBody(id, false), agentId: id };
      } catch (cause) {
        await deps.store.settle(claim.eventId, "error", null, (cause instanceof Error ? cause.message : String(cause)).slice(0, 200));
        throw cause;
      }
    },
  }),

  pause_agent: define({
    title: "Pause a paper agent",
    description: "Pauses one of your paper agents: it makes no decisions until resumed. Real money agents: use pause_live_agent.",
    scopes: ["agents:write"],
    kind: "write",
    audit: true,
    annotations: write(false, true),
    input: { agentId },
    run: ({ agentId: id }, context) => setStatus(context, id, "paused"),
  }),

  resume_agent: define({
    title: "Resume a paper agent",
    description: "Resumes one of your paused paper agents from the newest hour. The account's running agent limit applies.",
    scopes: ["agents:write"],
    kind: "write",
    audit: true,
    annotations: write(false, true),
    input: { agentId },
    run: ({ agentId: id }, context) => setStatus(context, id, "active"),
  }),

  publish_agent: define({
    title: "Publish a paper agent",
    description: `Shows one of your paper agents on the public leaderboard, API and MCP, with its record against holding. Needs at least ${PUBLISH_MIN_HOURS} paper hours. Two steps: confirm false (default) shows what goes public; confirm true publishes.`,
    scopes: ["agents:write"],
    kind: "write",
    audit: true,
    annotations: write(false, true),
    input: { agentId, confirm },
    async run({ agentId: id, confirm: confirmed }, context) {
      const agent = await ownPaperAgent(context, id);
      if (agent.runs < PUBLISH_MIN_HOURS) {
        throw new ActionError(409, "too_new", `An agent needs ${PUBLISH_MIN_HOURS} paper hours before it can be published; this one has ${agent.runs}.`);
      }
      if (!confirmed) {
        return {
          result: "preview",
          agentId: agent.id,
          body: {
            preview: true,
            published: agent.published,
            willShow: { ...ownAgentBody(agent), userText: { name: cleanUserText(agent.name, USER_TEXT_LIMITS.name) } },
            whatHappens: "Anyone can see the name, strategy, markets, results and hourly reasons on zolvaagent.app, the public API and MCP. The owner wallet and the strategy prompt stay private. Call again with confirm: true to publish.",
          },
        };
      }
      const changed = !agent.published;
      if (changed) await context.deps.store.setPublished(context.caller.owner, agent.id, true);
      return { agentId: agent.id, body: { agentId: agent.id, published: true, changed, url: `${SITE}/agents/${agent.id}` } };
    },
  }),

  unpublish_agent: define({
    title: "Unpublish a paper agent",
    description: "Takes one of your paper agents off the leaderboard and public lists. It keeps trading.",
    scopes: ["agents:write"],
    kind: "write",
    audit: true,
    annotations: write(false, true),
    input: { agentId },
    async run({ agentId: id }, context) {
      const agent = await ownPaperAgent(context, id);
      const changed = agent.published;
      if (changed) await context.deps.store.setPublished(context.caller.owner, agent.id, false);
      return { agentId: agent.id, body: { agentId: agent.id, published: false, changed } };
    },
  }),

  set_ai_limit: define({
    title: "Set an AI limit",
    description: "Replaces the AI co-pilot budget of one of your paper agents: a new total limit in USD and a new expiry counted from now.",
    scopes: ["agents:write", "ai"],
    kind: "write",
    audit: true,
    annotations: write(true, true),
    input: {
      agentId,
      limitUsd: z.number().positive().describe("The most the co-pilot may spend in total, USD"),
      expiryDays: z.number().int().positive().describe("How many days the limit lasts from now"),
    },
    async run({ agentId: id, limitUsd, expiryDays }, context) {
      const agent = await ownPaperAgent(context, id);
      await context.deps.store.setAiLimit(context.caller.owner, agent.id, limitUsd, expiryDays);
      return { agentId: agent.id, body: { agentId: agent.id, aiLimitUsd: limitUsd, expiryDays } };
    },
  }),

  pause_live_agent: define({
    title: "Stop a real money agent",
    description:
      "Pauses one of your real money agents: it places no more orders until you resume it in the browser. The only real money action over the API: resuming, creating, editing and orders stay on zolvaagent.app. Open positions are kept.",
    scopes: ["live:stop"],
    kind: "write",
    audit: true,
    annotations: write(false, true),
    input: { agentId: z.string().uuid().describe("The id of a real money agent (mode live) from my_agents") },
    async run({ agentId: id }, { caller, deps }) {
      const agent = await deps.store.ownAgent(caller.owner, id.toLowerCase());
      if (!agent || !agent.live) throw new ActionError(404, "not_found", "None of your real money agents has this id.");
      const changed = agent.status !== "paused";
      if (changed) await deps.store.setStatus(caller.owner, agent.id, "paused");
      return {
        agentId: agent.id,
        body: { agentId: agent.id, mode: "live", status: "paused", changed, note: "No more orders. Positions are kept. Resume it on zolvaagent.app." },
      };
    },
  }),
};

export type ActionName = keyof typeof ACTIONS;
export const ACTION_NAMES = Object.keys(ACTIONS) as ActionName[];

function createdBody(id: string, duplicate: boolean) {
  return {
    created: true,
    duplicate,
    agentId: id,
    mode: "paper",
    status: "active",
    published: false,
    url: `${SITE}/agents/${id}`,
    whatHappens: "The first decision is at the next hourly tick. It stays private until publish_agent.",
  };
}

function capError(status: "day_limit" | "hour_limit", action: "backtest" | "create_paper_agent"): ActionError {
  const caps = ACTION_CAPS[action];
  const what = action === "backtest" ? "backtests" : "agent creates";
  return new ActionError(
    429,
    "rate_limited",
    status === "hour_limit" ? `This account used its ${caps.hour} ${what} of the last hour.` : `This account used its ${caps.day} ${what} of the last 24 hours.`,
  );
}

/** Whether a key's scopes allow an action. */
export function allowedFor(name: ActionName, scopes: readonly ApiKeyScope[]): boolean {
  return ACTIONS[name].scopes.every((scope) => scopes.includes(scope));
}

/**
 * Runs one action for a caller: scope, per-key limit, input check, the action, the audit
 * event. Returns the response body or throws ActionError. Unexpected errors are logged
 * and become a 500 with no detail.
 */
export async function runAction(name: ActionName, rawInput: unknown, context: Context): Promise<Record<string, unknown>> {
  const spec = ACTIONS[name] as unknown as ActionSpec<z.ZodRawShape>;
  const { caller, deps } = context;
  if (!allowedFor(name, caller.scopes)) {
    throw new ActionError(403, "insufficient_scope", `This key cannot use ${name}: it needs the ${spec.scopes.join(" and ")} scope. Make a key with it on your Dashboard.`);
  }
  if (spec.kind === "write" && !(await deps.limit(caller.keyId, "write"))) {
    throw new ActionError(429, "rate_limited", "Too many writes for this API key: 30 a minute.");
  }

  const parsed = z.object(spec.input).strict().safeParse(rawInput ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
    throw new ActionError(400, "invalid_input", message.slice(0, 500));
  }

  try {
    const outcome = await spec.run(parsed.data, context);
    // Capped actions log through their claim; their previews are logged here.
    if (spec.audit || outcome.result === "preview") await deps.store.log(caller, name, outcome.result ?? "ok", outcome.agentId ?? null, null);
    return outcome.body;
  } catch (cause) {
    if (spec.audit) await deps.store.log(caller, name, "error", null, (cause instanceof Error ? cause.message : String(cause)).slice(0, 200)).catch(() => {});
    if (cause instanceof ActionError) throw cause;
    console.error("api action", name, cause);
    throw new ActionError(500, "internal_error", "Something went wrong on our side. Please try again later.");
  }
}
