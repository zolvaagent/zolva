import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import { API_KEY_SCOPES, type ApiCaller, type ApiKeyScope } from "../api-keys/keys";
import type { MarketData } from "../x402/premium";
import { ACTION_CAPS, ActionError, runAction, type ActionDeps, type ActionStore, type AgentDraft, type AuditResult, type OwnAgent } from "./actions";
import { registerActionTools } from "./mcp-actions";
import { matchMeRoute } from "./me-routes";

/**
 * The API key actions end to end through a real MCP SDK client, on an in-memory store
 * that stands in for Supabase (the real one is lib/public-api/store.ts). What is checked
 * here is the API's own behaviour: scopes, two-step writes, ownership, limits, idempotency
 * and the audit log. createAgent's own checks are tested where they live.
 */

const ME = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const NVDA = "0x00000000000000000000000000000000000000a1";
const ETH = "0x00000000000000000000000000000000000000a2";

function market(): MarketData {
  const hours = 24 * 40;
  const wave = (offset: number) => Array.from({ length: hours }, (_, i) => 100 + 10 * Math.sin(i / 9 + offset) + i * 0.01);
  return {
    startTs: 1_760_000_000 - (1_760_000_000 % 3600),
    hours,
    tokens: [
      { address: NVDA, symbol: "NVDA", name: "NVIDIA", assetClass: "stock", closes: wave(0) },
      { address: ETH, symbol: "ETH", name: "Ether", assetClass: "crypto", closes: wave(2) },
    ],
  };
}

let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

function agent(owner: string, overrides: Partial<OwnAgent> = {}): OwnAgent {
  return {
    id: uuid(),
    owner,
    isHouse: false,
    name: "Agent",
    strategy: "momentum",
    status: "active",
    tokens: [{ address: NVDA, symbol: "NVDA" }],
    startCapital: 10_000,
    equity: 10_100,
    holdEquity: 10_050,
    returnPct: 1,
    edge: 0.5,
    maxDrawdownPct: 2,
    trades: 3,
    runs: 0,
    createdAt: 1_760_000_000,
    lastTs: null,
    published: false,
    venue: "spot",
    shorts: false,
    live: false,
    strategyPrompt: null,
    ...overrides,
  };
}

type Event = { keyId: string; owner: string; action: string; result: AuditResult | "pending"; agentId: string | null; idempotencyKey: string | null; detail: string | null };

function fakeStore(agents: OwnAgent[]) {
  const events: Event[] = [];
  const store: ActionStore = {
    async ownAgents(owner) {
      return agents.filter((item) => item.owner === owner);
    },
    async ownAgent(owner, id) {
      return agents.find((item) => item.id === id && item.owner === owner) ?? null;
    },
    async checkAgent(_owner, draft: AgentDraft) {
      if (draft.strategy === "custom" && !draft.rules) throw new ActionError(400, "invalid_input", "Custom agents need rules.");
    },
    async createAgent(owner, draft) {
      const created = agent(owner, { name: draft.name, strategy: draft.strategy, tokens: draft.tokens.map((address) => ({ address, symbol: address === NVDA ? "NVDA" : "ETH" })) });
      agents.push(created);
      return { id: created.id };
    },
    async setStatus(owner, id, status) {
      const found = agents.find((item) => item.id === id && item.owner === owner)!;
      found.status = status;
    },
    async setPublished(owner, id, published) {
      agents.find((item) => item.id === id && item.owner === owner)!.published = published;
    },
    async setAiLimit() {},
    async market() {
      return market();
    },
    async writeStrategy() {
      return { rules: {}, notes: "", summary: "", costUsd: 0.001 };
    },
    async claim(caller, action, caps, idempotencyKey) {
      if (idempotencyKey) {
        const first = events.find((event) => event.keyId === caller.keyId && event.idempotencyKey === idempotencyKey);
        if (first) return { status: "duplicate", result: first.result, agentId: first.agentId };
      }
      const used = events.filter((event) => event.owner === caller.owner && event.action === action && (event.result === "ok" || event.result === "pending")).length;
      if (used >= caps.day) return { status: "day_limit" };
      if (caps.hour !== null && used >= caps.hour) return { status: "hour_limit" };
      events.push({ keyId: caller.keyId, owner: caller.owner, action, result: "pending", agentId: null, idempotencyKey, detail: null });
      return { status: "claimed", eventId: events.length - 1 };
    },
    async settle(eventId, result, agentId, detail) {
      Object.assign(events[eventId], { result, agentId, detail });
    },
    async log(caller, action, result, agentId, detail) {
      events.push({ keyId: caller.keyId, owner: caller.owner, action, result, agentId, idempotencyKey: null, detail });
    },
  };
  return { store, events };
}

function setup(options: { scopes?: ApiKeyScope[]; agents?: OwnAgent[]; writesAllowed?: () => boolean } = {}) {
  const agents = options.agents ?? [];
  const { store, events } = fakeStore(agents);
  const caller: ApiCaller = { keyId: "key-1", owner: ME, scopes: options.scopes ?? [...API_KEY_SCOPES] };
  const deps: ActionDeps = { store, limit: async (_key, kind) => kind === "read" || (options.writesAllowed?.() ?? true) };
  return { agents, events, caller, deps };
}

async function connect(caller: ApiCaller, deps: ActionDeps) {
  const server = new McpServer({ name: "zolva-test", version: "0.0.0" });
  registerActionTools(server, caller, deps);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "sdk-test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

/** Calls a tool and returns its JSON body, plus whether it was an error. */
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0].text;
  return { isError: result.isError === true, body: JSON.parse(text) };
}

const createArgs = { name: "My dip buyer", strategy: "momentum", markets: ["NVDA"], capital: 10_000, maxPositionPct: 50, stopLossPct: 8 };

describe("API key actions over MCP (SDK client)", () => {
  it("lists every action tool with annotations for a key with every scope", async () => {
    const { caller, deps } = setup();
    const client = await connect(caller, deps);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      ["backtest", "create_paper_agent", "my_agents", "pause_agent", "pause_live_agent", "publish_agent", "resume_agent", "set_ai_limit", "unpublish_agent", "validate_rules", "write_strategy"].sort(),
    );
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect(byName.get("my_agents")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    expect(byName.get("create_paper_agent")?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
    expect(byName.get("pause_live_agent")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
  });

  it("creates, pauses, publishes and unpublishes a paper agent", async () => {
    const { agents, events, caller, deps } = setup();
    const client = await connect(caller, deps);

    const preview = await call(client, "create_paper_agent", createArgs);
    expect(preview.isError).toBe(false);
    expect(preview.body).toMatchObject({ preview: true, created: false, willCreate: { markets: ["NVDA"], mode: "paper", userText: { name: "My dip buyer" } } });
    expect(preview.body.backtest30d).toHaveProperty("returnPct");
    expect(agents).toHaveLength(0);

    const noTerms = await call(client, "create_paper_agent", { ...createArgs, confirm: true });
    expect(noTerms.body.error.code).toBe("terms_required");
    expect(agents).toHaveLength(0);

    const created = await call(client, "create_paper_agent", { ...createArgs, confirm: true, acceptTerms: true, idempotencyKey: "run-1" });
    expect(created.body).toMatchObject({ created: true, duplicate: false, mode: "paper", published: false });
    const id = created.body.agentId as string;
    expect(agents.map((item) => item.id)).toEqual([id]);

    // A retry with the same Idempotency-Key returns the same agent and makes no second one.
    const retry = await call(client, "create_paper_agent", { ...createArgs, confirm: true, acceptTerms: true, idempotencyKey: "run-1" });
    expect(retry.body).toMatchObject({ created: true, duplicate: true, agentId: id });
    expect(agents).toHaveLength(1);

    const paused = await call(client, "pause_agent", { agentId: id });
    expect(paused.body).toMatchObject({ agentId: id, status: "paused", changed: true });
    expect(agents[0].status).toBe("paused");

    const tooNew = await call(client, "publish_agent", { agentId: id, confirm: true });
    expect(tooNew.body.error).toMatchObject({ code: "too_new", status: 409 });

    agents[0].runs = 30;
    const publishPreview = await call(client, "publish_agent", { agentId: id });
    expect(publishPreview.body).toMatchObject({ preview: true, published: false });
    expect(agents[0].published).toBe(false);

    const published = await call(client, "publish_agent", { agentId: id, confirm: true });
    expect(published.body).toMatchObject({ published: true, changed: true });
    expect(agents[0].published).toBe(true);

    const unpublished = await call(client, "unpublish_agent", { agentId: id });
    expect(unpublished.body).toMatchObject({ published: false, changed: true });
    expect(agents[0].published).toBe(false);

    const mine = await call(client, "my_agents");
    expect(mine.body.agents).toHaveLength(1);
    expect(mine.body.agents[0]).toMatchObject({ id, mode: "paper", status: "paused", userText: { name: "My dip buyer" } });
    expect(mine.body.agents[0]).not.toHaveProperty("name");

    // Every write is in the audit log, previews included.
    expect(events.map((event) => `${event.action}:${event.result}`)).toEqual([
      "create_paper_agent:preview",
      "create_paper_agent:ok",
      "pause_agent:ok",
      "publish_agent:error",
      "publish_agent:preview",
      "publish_agent:ok",
      "unpublish_agent:ok",
    ]);
  });

  it("answers not found for another account's private agent, and never changes it", async () => {
    const theirs = agent(OTHER, { name: "Their private agent", runs: 100 });
    const { caller, deps } = setup({ agents: [theirs] });
    const client = await connect(caller, deps);

    for (const [tool, args] of [
      ["pause_agent", { agentId: theirs.id }],
      ["resume_agent", { agentId: theirs.id }],
      ["publish_agent", { agentId: theirs.id, confirm: true }],
      ["unpublish_agent", { agentId: theirs.id }],
      ["set_ai_limit", { agentId: theirs.id, limitUsd: 1, expiryDays: 7 }],
      ["pause_live_agent", { agentId: theirs.id }],
    ] as const) {
      const result = await call(client, tool, args);
      expect(result.isError, tool).toBe(true);
      expect(result.body.error, tool).toMatchObject({ code: "not_found", status: 404 });
    }
    expect(theirs).toMatchObject({ status: "active", published: false });
    expect((await call(client, "my_agents")).body.agents).toEqual([]);
  });

  it("only pauses real money agents through pause_live_agent", async () => {
    const live = agent(ME, { live: true });
    const paper = agent(ME);
    const { caller, deps } = setup({ agents: [live, paper] });
    const client = await connect(caller, deps);

    expect((await call(client, "pause_agent", { agentId: live.id })).body.error.code).toBe("not_found");
    expect((await call(client, "resume_agent", { agentId: live.id })).body.error.code).toBe("not_found");
    expect((await call(client, "pause_live_agent", { agentId: paper.id })).body.error.code).toBe("not_found");

    const stopped = await call(client, "pause_live_agent", { agentId: live.id });
    expect(stopped.body).toMatchObject({ mode: "live", status: "paused", changed: true });
    expect(live.status).toBe("paused");
  });

  it("shows a key only the tools of its scopes", async () => {
    const { caller, deps } = setup({ scopes: ["read:private", "compute"] });
    const client = await connect(caller, deps);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["backtest", "my_agents", "validate_rules"]);
  });

  it("returns 429 when the key is over its write limit", async () => {
    const { agents, caller, deps } = setup({ writesAllowed: () => false });
    const client = await connect(caller, deps);
    const result = await call(client, "create_paper_agent", { ...createArgs, confirm: true, acceptTerms: true });
    expect(result.body.error).toMatchObject({ code: "rate_limited", status: 429 });
    expect(agents).toHaveLength(0);
  });

  it("returns 429 after the daily create cap and the hourly backtest cap", async () => {
    const { caller, deps } = setup();
    for (let i = 0; i < ACTION_CAPS.create_paper_agent.day; i++) {
      await runAction("create_paper_agent", { ...createArgs, confirm: true, acceptTerms: true }, { caller, deps, idempotencyKey: null });
    }
    await expect(runAction("create_paper_agent", { ...createArgs, confirm: true, acceptTerms: true }, { caller, deps, idempotencyKey: null })).rejects.toMatchObject({ status: 429, code: "rate_limited" });

    const backtest = { strategy: "momentum", markets: ["NVDA"], days: 7 };
    for (let i = 0; i < ACTION_CAPS.backtest.hour; i++) await runAction("backtest", backtest, { caller, deps, idempotencyKey: null });
    await expect(runAction("backtest", backtest, { caller, deps, idempotencyKey: null })).rejects.toMatchObject({ status: 429, message: expect.stringContaining("last hour") });
  });
});

describe("runAction", () => {
  it("refuses a key without the scope", async () => {
    const { caller, deps } = setup({ scopes: ["read:private"] });
    await expect(runAction("create_paper_agent", createArgs, { caller, deps, idempotencyKey: null })).rejects.toMatchObject({ status: 403, code: "insufficient_scope" });
  });

  it("needs the ai scope for an AI co-pilot", async () => {
    const { caller, deps } = setup({ scopes: ["agents:write"] });
    await expect(runAction("create_paper_agent", { ...createArgs, aiModel: "x" }, { caller, deps, idempotencyKey: null })).rejects.toMatchObject({ status: 403 });
  });

  it("refuses unknown fields and markets outside the allowlist", async () => {
    const { caller, deps } = setup();
    await expect(runAction("pause_agent", { agentId: uuid(), mode: "live" }, { caller, deps, idempotencyKey: null })).rejects.toMatchObject({ status: 400, code: "invalid_input" });
    await expect(runAction("create_paper_agent", { ...createArgs, markets: ["NVDAX"] }, { caller, deps, idempotencyKey: null })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("Unknown market") });
  });

  it("uses the REST Idempotency-Key header when the body has none", async () => {
    const { agents, caller, deps } = setup();
    const input = { ...createArgs, confirm: true, acceptTerms: true };
    const first = await runAction("create_paper_agent", input, { caller, deps, idempotencyKey: "header-1" });
    const second = await runAction("create_paper_agent", input, { caller, deps, idempotencyKey: "header-1" });
    expect(second).toMatchObject({ agentId: first.agentId, duplicate: true });
    expect(agents).toHaveLength(1);
  });

  it("validates rules without running anything", async () => {
    const { caller, deps } = setup();
    const result = await runAction("validate_rules", { rules: { entry: { join: "all", conditions: [] } } }, { caller, deps, idempotencyKey: null });
    expect(result.valid).toBe(false);
    expect(result.errors).not.toHaveLength(0);
  });
});

describe("matchMeRoute", () => {
  it("maps REST paths to actions", () => {
    expect(matchMeRoute("GET", ["agents"])).toEqual({ action: "my_agents", agentId: null });
    expect(matchMeRoute("POST", ["agents"])).toEqual({ action: "create_paper_agent", agentId: null });
    expect(matchMeRoute("POST", ["agents", "abc", "pause"])).toEqual({ action: "pause_agent", agentId: "abc" });
    expect(matchMeRoute("PUT", ["agents", "abc", "ai-limit"])).toEqual({ action: "set_ai_limit", agentId: "abc" });
    expect(matchMeRoute("POST", ["live-agents", "abc", "pause"])).toEqual({ action: "pause_live_agent", agentId: "abc" });
    expect(matchMeRoute("DELETE", ["agents"])).toEqual({ error: 405, allow: "GET, POST" });
    expect(matchMeRoute("POST", ["live-agents", "abc", "resume"])).toEqual({ error: 404 });
  });
});
