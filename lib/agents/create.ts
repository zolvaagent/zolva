import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { maxMarketsFor, STUDIO_STRATEGIES, strategyNeedsPerps } from "@/lib/agents/copy";
import { getMarket, latestCandleTime } from "@/lib/data/market";
import { parseAiLimit, type AiLimit } from "@/lib/ai/limits";
import { aiModel } from "@/lib/ai/models";
import { PROMPT_MAX_LENGTH } from "@/lib/ai/strategy-writer";
import { parseRules, rulesLookback, type Rules } from "@/lib/engine/rules";
import { LOOKBACK_HOURS } from "@/lib/engine/strategies";

/** The active agent limit named in the database error (it follows the ZOLVA tier: 5, 10 or 20). */
function activeLimitIn(message: string): string {
  return /at most (\d+) active/.exec(message)?.[1] ?? "5";
}

export type CreateAgentInput = {
  name: unknown;
  strategy: unknown;
  rules?: unknown;
  tokens: unknown;
  capital: unknown;
  maxPositionPct: unknown;
  stopLossPct: unknown;
  acceptTerms: unknown;
  /** OpenRouter model id for the AI co-pilot, or empty for rules only. */
  aiModel?: unknown;
  /** Required with aiModel: the most the co-pilot may spend on this agent, in USD. */
  aiLimitUsd?: unknown;
  /** Required with aiModel: how many days the AI limit lasts (see AI_EXPIRY_DAYS). */
  aiExpiryDays?: unknown;
  /** Custom strategies made in prompt mode: the user's own words, read by the co-pilot. */
  strategyPrompt?: unknown;
  /** "paper" (default) or "live" for real money from the owner's own wallet. */
  mode?: unknown;
  /** "spot" (default: stock and crypto tokens on the DEX) or "perps" (Lighter perps, paper only). */
  venue?: unknown;
};

/** What a live launch needs from the chain, read by the route: the owner's USDG balance. */
export type LiveLaunch = { usdg: number };

export class AgentInputError extends Error {}


/**
 * Validates untrusted Studio input and launches a paper agent for `owner`.
 * The agent starts at the newest stored hour, so its first decision is made
 * by the next hourly tick, never on the past.
 */
export async function createAgent(db: SupabaseClient, owner: string, input: CreateAgentInput, live?: LiveLaunch): Promise<{ id: string }> {
  const mode = input.mode === "live" ? "live" : "paper";
  if (mode === "live" && !live) throw new AgentInputError("Real money needs your wallet balance; please try again.");
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 1 || name.length > 40) throw new AgentInputError("Give your agent a name of up to 40 characters.");

  const strategy = STUDIO_STRATEGIES.find((key) => key === input.strategy);
  if (!strategy) throw new AgentInputError("Pick a strategy.");
  const perps = input.venue === "perps";
  // Perps are paper only (agent_venue_guard), and shorts trade perps only.
  if (perps && mode === "live") throw new AgentInputError("Perps agents trade paper money only for now.");
  if (strategyNeedsPerps(strategy) && !perps) throw new AgentInputError("Spike fade opens shorts, which trade perps. Switch to Perps to launch it.");
  // Real money stays on the strategies it has run with; Dip hunter is paper only for now.
  if (mode === "live" && (strategy === "dip_hunter" || strategy === "spike_fade")) throw new AgentInputError("Dip hunter and Spike fade trade paper money only for now.");

  let rules: Rules | undefined;
  if (strategy === "custom") {
    const parsed = parseRules(input.rules);
    if (!parsed.rules) throw new AgentInputError(parsed.errors[0]);
    rules = parsed.rules;
  }

  const strategyPrompt = strategy === "custom" && typeof input.strategyPrompt === "string" ? input.strategyPrompt.trim().slice(0, PROMPT_MAX_LENGTH) || null : null;

  if (input.acceptTerms !== true) throw new AgentInputError("Please accept the terms to launch.");

  // Only models from our list; whether credits cover it is checked every hour.
  const aiModelId = typeof input.aiModel === "string" && input.aiModel ? input.aiModel : null;
  if (aiModelId && !aiModel(aiModelId)) throw new AgentInputError("Pick an AI model from the list, or turn the co-pilot off.");
  if (aiModelId && mode === "live") throw new AgentInputError("Real money agents trade on their rules alone. Turn the AI co-pilot off to launch.");
  let aiLimit: AiLimit | null = null;
  if (aiModelId) {
    const parsed = parseAiLimit(input.aiLimitUsd, input.aiExpiryDays);
    if (!parsed.ok) throw new AgentInputError(parsed.error);
    aiLimit = parsed.value;
  }

  const capital = Number(input.capital);
  const maxPositionPct = Number(input.maxPositionPct);
  const stopLossPct = Number(input.stopLossPct);
  if (mode === "paper" && (!Number.isFinite(capital) || capital < 1000 || capital > 1_000_000)) throw new AgentInputError("Capital must be between $1,000 and $1,000,000.");
  if (mode === "live") {
    // Real money: at least $10, at most the global cap (the database checks it too), and no
    // more than the USDG the wallet holds right now.
    const { data: settings } = await db.from("live_settings").select("max_agent_capital_usd").eq("id", 1).single();
    const cap = Number(settings?.max_agent_capital_usd ?? 0);
    if (!Number.isFinite(capital) || capital < 10 || capital > cap) throw new AgentInputError(`Real money capital must be between $10 and ${cap}.`);
    if (capital > live!.usdg) throw new AgentInputError(`Your wallet holds ${live!.usdg.toFixed(2)} USDG. Add more, or lower the capital.`);
  }
  if (!Number.isInteger(maxPositionPct) || maxPositionPct < 10 || maxPositionPct > 100) throw new AgentInputError("Max per stock must be between 10% and 100%.");
  if (!Number.isInteger(stopLossPct) || stopLossPct < 2 || stopLossPct > 25) throw new AgentInputError("Stop loss must be between 2% and 25%.");

  const tokens = Array.isArray(input.tokens) ? [...new Set(input.tokens.map((token) => String(token).toLowerCase()))] : [];
  const maxMarkets = maxMarketsFor(strategy);
  if (tokens.length < 1 || tokens.length > maxMarkets) throw new AgentInputError(`Pick 1 to ${maxMarkets} markets.`);

  // Every token (stock, coin or perp) must be on the allowlist and have enough clean history right now.
  const market = await getMarket(db, { perps });
  const lastIndex = market.hours - 1;
  const lookback = rules ? rulesLookback(rules) : LOOKBACK_HOURS;
  // Live agents swap on Uniswap v3 pools only (what SwapRouter02 and the wallet policy allow).
  if (mode === "live") {
    const { data: v3 } = await db.from("tokens").select("address").eq("enabled", true).eq("pool_kind", "v3").in("address", tokens);
    if ((v3?.length ?? 0) !== tokens.length) throw new AgentInputError("One of the picked markets cannot be traded with real money yet. Pick another one.");
  }
  const startPrices: Record<string, number> = {};
  for (const address of tokens) {
    const token = market.tokens.find((item) => item.address === address);
    const price = token?.closes[lastIndex];
    if (!token || price == null) throw new AgentInputError("One of the picked markets is not available.");
    // One venue per agent: perps agents trade Lighter perps only, spot agents DEX tokens only.
    if ((token.venue === "lighter") !== perps) throw new AgentInputError(perps ? `${token.symbol} is not a perps market. Pick perps only.` : `${token.symbol} is a perps market. Switch to Perps to use it.`);
    if (token.firstIndex === null || lastIndex - token.firstIndex < lookback) {
      throw new AgentInputError(`${token.symbol} is too new for this strategy. Pick another one.`);
    }
    startPrices[address] = price;
  }

  const { data, error } = await db
    .from("agents")
    .insert({
      owner,
      name,
      strategy,
      params: { max_position_pct: maxPositionPct, stop_loss_pct: stopLossPct, start_prices: startPrices, ...(rules ? { rules } : {}), ...(perps ? { venue: "perps" } : {}) },
      token_addresses: tokens,
      start_capital: capital,
      cash: capital,
      status: "active",
      mode,
      ...(mode === "live" ? { trading_wallet: owner } : {}),
      ai_model: aiModelId,
      ai_limit_micro: aiLimit?.limitMicro ?? null,
      ai_limit_expires_at: aiLimit?.expiresAt ?? null,
      strategy_prompt: strategyPrompt,
      last_run_ts: new Date((market.startTs + lastIndex * 3600) * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (mode === "live" && error.message.includes("active_agent_limit")) throw new AgentInputError("You already run a real money agent. Pause it in your dashboard to launch another.");
    if (error.message.includes("live_wallet_not_allowed")) throw new AgentInputError("Allow Zolva to trade from your wallet first.");
    if (error.message.includes("live_capital_over_cap")) throw new AgentInputError("That capital is above the real money limit.");
    if (error.message.includes("active_agent_limit")) {
      throw new AgentInputError(`You already run ${activeLimitIn(error.message)} agents, the most at once. Pause one in your dashboard to launch another.`);
    }
    throw new Error(`Saving the agent failed: ${error.message}`);
  }

  await db.from("wallets").update({ terms_accepted_at: new Date().toISOString() }).eq("address", owner).is("terms_accepted_at", null);
  return { id: data.id };
}

/** Change one of the owner's AI budgets: a new total limit and a new expiry counted from now. */
export async function setAgentAiLimit(db: SupabaseClient, owner: string, id: string, limitUsd: unknown, expiryDays: unknown): Promise<void> {
  const parsed = parseAiLimit(limitUsd, expiryDays);
  if (!parsed.ok) throw new AgentInputError(parsed.error);
  const { data, error } = await db
    .from("agents")
    .update({ ai_limit_micro: parsed.value.limitMicro, ai_limit_expires_at: parsed.value.expiresAt })
    .eq("id", id)
    .eq("owner", owner)
    .not("ai_model", "is", null)
    .select("id");
  if (error) throw new Error(`Updating the agent failed: ${error.message}`);
  if (!data.length) throw new AgentInputError("This agent has no AI co-pilot.");
}

/** Show one of the owner's agents on the leaderboard and other public lists, or take it off. */
export async function setAgentPublished(db: SupabaseClient, owner: string, id: string, published: unknown): Promise<void> {
  if (typeof published !== "boolean") throw new AgentInputError("Unknown request.");
  const { data, error } = await db
    .from("agents")
    .update({ published_at: published ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("owner", owner)
    .select("id");
  if (error) throw new Error(`Updating the agent failed: ${error.message}`);
  if (!data.length) throw new AgentInputError("Agent not found.");
}

/**
 * Pause or resume one of the owner's agents. Resuming continues from the
 * newest hour: a paused agent never trades the hours it was paused.
 */
export async function setAgentStatus(db: SupabaseClient, owner: string, id: string, status: unknown): Promise<void> {
  if (status !== "active" && status !== "paused") throw new AgentInputError("Unknown status.");
  const changes: { status: string; last_run_ts?: string } = { status };
  if (status === "active") {
    const latest = await latestCandleTime(db);
    if (latest !== null) changes.last_run_ts = new Date(latest * 1000).toISOString();
  }
  const { data, error } = await db.from("agents").update(changes).eq("id", id).eq("owner", owner).select("id");
  if (error) {
    if (error.message.includes("active_agent_limit")) throw new AgentInputError(`You can run up to ${activeLimitIn(error.message)} agents. Pause another one first.`);
    throw new Error(`Updating the agent failed: ${error.message}`);
  }
  if (!data?.length) throw new AgentInputError("Agent not found.");
}
