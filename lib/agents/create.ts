import "server-only";

import { getMarket, latestCandleTime } from "@/lib/data/market";
import { parseRules, rulesLookback, type Rules } from "@/lib/engine/rules";
import { LOOKBACK_HOURS } from "@/lib/engine/strategies";
import { db } from "@/lib/supabase";

export type CreateAgentInput = {
  name: unknown;
  strategy: unknown;
  rules?: unknown;
  tokens: unknown;
  capital: unknown;
  maxPositionPct: unknown;
  stopLossPct: unknown;
  acceptTerms: unknown;
};

export class AgentInputError extends Error {}

const STRATEGIES = ["momentum", "mean_reversion", "custom"] as const;

/**
 * Validates untrusted Studio input and launches a paper agent for `owner`.
 * The agent starts at the newest stored hour, so its first decision is made
 * by the next hourly tick, never on the past.
 */
export async function createAgent(owner: string, input: CreateAgentInput): Promise<{ id: string }> {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 1 || name.length > 40) throw new AgentInputError("Give your agent a name of up to 40 characters.");

  const strategy = STRATEGIES.find((key) => key === input.strategy);
  if (!strategy) throw new AgentInputError("Pick a strategy.");

  let rules: Rules | undefined;
  if (strategy === "custom") {
    const parsed = parseRules(input.rules);
    if (!parsed.rules) throw new AgentInputError(parsed.errors[0]);
    rules = parsed.rules;
  }

  if (input.acceptTerms !== true) throw new AgentInputError("Please accept the terms to launch.");

  const capital = Number(input.capital);
  const maxPositionPct = Number(input.maxPositionPct);
  const stopLossPct = Number(input.stopLossPct);
  if (!Number.isFinite(capital) || capital < 1000 || capital > 1_000_000) throw new AgentInputError("Capital must be between $1,000 and $1,000,000.");
  if (!Number.isInteger(maxPositionPct) || maxPositionPct < 10 || maxPositionPct > 100) throw new AgentInputError("Max per stock must be between 10% and 100%.");
  if (!Number.isInteger(stopLossPct) || stopLossPct < 2 || stopLossPct > 25) throw new AgentInputError("Stop loss must be between 2% and 25%.");

  const tokens = Array.isArray(input.tokens) ? [...new Set(input.tokens.map((token) => String(token).toLowerCase()))] : [];
  if (tokens.length < 1 || tokens.length > 3) throw new AgentInputError("Pick 1 to 3 stocks.");

  // Every stock must be on the allowlist and have enough clean history right now.
  const market = await getMarket();
  const lastIndex = market.hours - 1;
  const lookback = rules ? rulesLookback(rules) : LOOKBACK_HOURS;
  const startPrices: Record<string, number> = {};
  for (const address of tokens) {
    const token = market.tokens.find((item) => item.address === address);
    const price = token?.closes[lastIndex];
    if (!token || price == null) throw new AgentInputError("One of the stocks is not available.");
    if (token.firstIndex === null || lastIndex - token.firstIndex < lookback) {
      throw new AgentInputError(`${token.symbol} is too new for this strategy. Pick another stock.`);
    }
    startPrices[address] = price;
  }

  const { data, error } = await db()
    .from("agents")
    .insert({
      owner,
      name,
      strategy,
      params: { max_position_pct: maxPositionPct, stop_loss_pct: stopLossPct, start_prices: startPrices, ...(rules ? { rules } : {}) },
      token_addresses: tokens,
      start_capital: capital,
      cash: capital,
      status: "active",
      mode: "paper",
      last_run_ts: new Date((market.startTs + lastIndex * 3600) * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.includes("active_agent_limit")) {
      throw new AgentInputError("You already run 5 agents, the most at once. Pause one in your dashboard to launch another.");
    }
    throw new Error(`Saving the agent failed: ${error.message}`);
  }

  await db().from("wallets").update({ terms_accepted_at: new Date().toISOString() }).eq("address", owner).is("terms_accepted_at", null);
  return { id: data.id };
}

/**
 * Pause or resume one of the owner's agents. Resuming continues from the
 * newest hour: a paused agent never trades the hours it was paused.
 */
export async function setAgentStatus(owner: string, id: string, status: unknown): Promise<void> {
  if (status !== "active" && status !== "paused") throw new AgentInputError("Unknown status.");
  const changes: { status: string; last_run_ts?: string } = { status };
  if (status === "active") {
    const latest = await latestCandleTime();
    if (latest !== null) changes.last_run_ts = new Date(latest * 1000).toISOString();
  }
  const { data, error } = await db().from("agents").update(changes).eq("id", id).eq("owner", owner).select("id");
  if (error) {
    if (error.message.includes("active_agent_limit")) throw new AgentInputError("You can run up to 5 agents. Pause another one first.");
    throw new Error(`Updating the agent failed: ${error.message}`);
  }
  if (!data?.length) throw new AgentInputError("Agent not found.");
}
