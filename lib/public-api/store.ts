import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AgentInputError, checkAgentInput, createAgent, setAgentAiLimit, setAgentPublished, setAgentStatus, type CreateAgentInput } from "@/lib/agents/create";
import { writeStrategy } from "@/lib/ai/write-strategy";
import { listAgentsByOwner } from "@/lib/data/agents";
import { getMarket } from "@/lib/data/market";
import { checkKeyLimit } from "@/lib/public-api/http";
import { db } from "@/lib/supabase";

import { ActionError, type ActionDeps, type ActionStore, type AgentDraft, type ClaimResult, type OwnAgent } from "./actions";

/**
 * The real ActionStore: Supabase plus the app's own agent functions (lib/agents/create.ts),
 * so an agent made over the API is checked and saved exactly like one made in the Studio.
 * One store per request; it remembers the caller's agents for that request only.
 */

/** createAgent's refusals become 400s the caller can act on. */
async function asInputError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof AgentInputError) throw new ActionError(400, "invalid_input", cause.message);
    throw cause;
  }
}

function toCreateInput(draft: AgentDraft): CreateAgentInput {
  return {
    name: draft.name,
    strategy: draft.strategy,
    rules: draft.rules,
    tokens: draft.tokens,
    capital: draft.capital,
    maxPositionPct: draft.maxPositionPct,
    stopLossPct: draft.stopLossPct,
    // The API asks for acceptTerms itself before a real create (lib/public-api/actions.ts).
    acceptTerms: true,
    aiModel: draft.aiModel,
    aiLimitUsd: draft.aiLimitUsd,
    aiExpiryDays: draft.aiExpiryDays,
    strategyPrompt: draft.strategyPrompt,
    // Never live over the API.
    mode: "paper",
    venue: draft.venue,
  };
}

const WRITER_CODES: Record<number, string> = { 400: "invalid_input", 402: "out_of_credits", 422: "not_a_strategy", 429: "rate_limited", 502: "ai_unavailable", 503: "ai_unavailable" };

export function createActionStore(client: SupabaseClient = db()): ActionStore {
  let agents: Promise<OwnAgent[]> | null = null;

  async function loadAgents(owner: string): Promise<OwnAgent[]> {
    const [summaries, prompts] = await Promise.all([
      listAgentsByOwner(client, owner),
      client.from("agents").select("id, strategy_prompt").eq("owner", owner),
    ]);
    if (prompts.error) throw new Error(`Loading your agents failed: ${prompts.error.message}`);
    const promptOf = new Map(prompts.data.map((row) => [row.id as string, (row.strategy_prompt as string | null) ?? null]));
    return summaries.map((summary) => ({ ...summary, strategyPrompt: promptOf.get(summary.id) ?? null }));
  }

  return {
    ownAgents(owner) {
      agents ??= loadAgents(owner);
      return agents;
    },
    async ownAgent(owner, id) {
      agents ??= loadAgents(owner);
      return (await agents).find((agent) => agent.id === id && agent.owner === owner) ?? null;
    },
    async checkAgent(owner, draft) {
      await asInputError(() => checkAgentInput(client, owner, toCreateInput(draft)));
    },
    createAgent(owner, draft) {
      return asInputError(() => createAgent(client, owner, toCreateInput(draft)));
    },
    setStatus(owner, id, status) {
      return asInputError(() => setAgentStatus(client, owner, id, status));
    },
    setPublished(owner, id, published) {
      return asInputError(() => setAgentPublished(client, owner, id, published));
    },
    setAiLimit(owner, id, limitUsd, expiryDays) {
      return asInputError(() => setAgentAiLimit(client, owner, id, limitUsd, expiryDays));
    },
    async market(venue) {
      const market = await getMarket(client, { perps: venue === "perps" });
      // getMarket with perps returns every venue; one agent trades one venue only.
      return venue === "perps" ? { ...market, tokens: market.tokens.filter((token) => token.venue === "lighter") } : market;
    },
    async writeStrategy(owner, prompt) {
      const result = await writeStrategy(client, owner, prompt);
      if (!result.ok) throw new ActionError(result.status, WRITER_CODES[result.status] ?? "internal_error", result.error);
      return { rules: result.rules, notes: result.notes, summary: result.summary, costUsd: result.costUsd };
    },
    async claim(caller, action, caps, idempotencyKey): Promise<ClaimResult> {
      const { data, error } = await client.rpc("api_key_claim", {
        p_key_id: caller.keyId,
        p_owner: caller.owner,
        p_action: action,
        p_day_limit: caps.day,
        p_hour_limit: caps.hour,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw new Error(`Claiming ${action} failed: ${error.message}`);
      const row = (data as { status: string; event_id: number | null; result: string | null; agent_id: string | null }[])[0];
      if (row?.status === "claimed" && row.event_id !== null) return { status: "claimed", eventId: row.event_id };
      if (row?.status === "duplicate") return { status: "duplicate", result: row.result ?? "error", agentId: row.agent_id };
      if (row?.status === "day_limit" || row?.status === "hour_limit") return { status: row.status };
      throw new Error(`Claiming ${action} returned ${JSON.stringify(data)}`);
    },
    async settle(eventId, result, agentId, detail) {
      const { error } = await client.rpc("api_key_settle", { p_event_id: eventId, p_result: result, p_agent_id: agentId, p_detail: detail });
      if (error) console.error("api_key_settle", error);
    },
    async log(caller, action, result, agentId, detail) {
      const { error } = await client.from("api_key_events").insert({ key_id: caller.keyId, owner: caller.owner, action, result, agent_id: agentId, detail: detail?.slice(0, 200) ?? null });
      if (error) console.error("api_key_events", error);
    },
  };
}

/** What runAction needs in production: the store and the Workers per-key limits. */
export function actionDeps(): ActionDeps {
  return {
    store: createActionStore(),
    async limit(keyId, kind) {
      return (await checkKeyLimit(keyId, kind)) !== "limited";
    },
  };
}
