import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { planAgentHours, type AgentRow, type PositionRow } from "../agents/plan.ts";
import { getMarket, RUNNER_MARKET_HOURS } from "../data/market.ts";
import { engineStateFromLighter, lighterOrderFor, parseAccount, reconcile, type EnginePositionRow, type LighterAccount } from "./lighter.ts";

/**
 * Real money perps on Lighter RH (owner only, docs/plan-actions-perps-live.md step P). Runs every live
 * agent that Zolva gave a Lighter sub-account, on the newest hour only, after the paper agents.
 *
 * Lighter is the truth: at the start of each hour the agent's positions and cash are copied from its
 * Lighter account, and if they differ from what Zolva last recorded (a trade made elsewhere, a
 * liquidation, an order that never confirmed), the agent is paused instead of trading on a state
 * Zolva does not understand. Orders go through the zolva-lighter Worker (it holds the API keys).
 *
 * Off unless live_settings.enabled is true AND the LIGHTER service binding and its token are set;
 * zolva-lighter has its own switch (LIGHTER_ENABLED) on top.
 */

/** The zolva-lighter Worker, through a Cloudflare service binding. */
export type LighterBinding = { fetch(input: Request | string, init?: RequestInit): Promise<Response> };

export type PerpsLiveResult = {
  enabled: boolean;
  note: string | null;
  agents: number;
  orders: { agentId: string; token: string; side: string; status: string; detail: string }[];
  paused: { agentId: string; reason: string }[];
  failed: { agentId: string; error: string }[];
};

type Settings = { enabled: boolean; daily_volume_usd: number; max_slippage_bps: number };
type LighterAgent = AgentRow & { owner: string; lighter_account_index: number };
type PerpToken = { address: string; symbol: string; lighter_market_id: number };
type Fill = { token_address: string; side: "buy" | "sell" | "short" | "cover"; quantity: number; price: number; reason: string };

const HOUR = 3600;
const INTERNAL = "https://zolva-lighter.internal";

export async function runLighterAgents(db: SupabaseClient, lighter: LighterBinding | null, internalToken: string | null): Promise<PerpsLiveResult> {
  const result: PerpsLiveResult = { enabled: false, note: null, agents: 0, orders: [], paused: [], failed: [] };
  const { data: settings, error: settingsError } = await db.from("live_settings").select("enabled, daily_volume_usd, max_slippage_bps").eq("id", 1).single<Settings>();
  if (settingsError) throw new Error(`Loading live settings failed: ${settingsError.message}`);
  if (!settings.enabled) return { ...result, note: "live trading is switched off" };
  if (!lighter || !internalToken) return { ...result, note: "zolva-lighter is not bound (LIGHTER binding and LIGHTER_INTERNAL_TOKEN)" };

  const { data: agents, error: agentsError } = await db
    .from("agents")
    .select("id, owner, strategy, params, token_addresses, start_capital, cash, last_run_ts, lighter_account_index")
    .eq("mode", "live")
    .eq("status", "active")
    .not("lighter_account_index", "is", null);
  // Before the perps_live migration the column does not exist: nothing to run.
  if (agentsError) return { ...result, note: `perps live not available: ${agentsError.message}` };
  result.enabled = true;
  result.agents = agents.length;
  if (!agents.length) return result;

  const { data: tokens, error: tokensError } = await db.from("tokens").select("address, symbol, lighter_market_id").eq("venue", "lighter");
  if (tokensError) throw new Error(`Loading perps markets failed: ${tokensError.message}`);
  const perpTokens = (tokens as PerpToken[]).filter((token) => Number.isInteger(token.lighter_market_id));
  const tokenOfMarket = new Map(perpTokens.map((token) => [Number(token.lighter_market_id), token.address]));
  const marketOfToken = new Map(perpTokens.map((token) => [token.address, Number(token.lighter_market_id)]));
  const symbolOf = new Map(perpTokens.map((token) => [token.address, token.symbol]));

  const market = await getMarket(db, { perps: true, hours: RUNNER_MARKET_HOURS });
  if (!market.hours) return result;
  const latestTs = market.startTs + (market.hours - 1) * HOUR;
  const latestIndex = market.hours - 1;
  const closes = Object.fromEntries(market.tokens.map((token) => [token.address, token.closes]));
  const funding = Object.fromEntries(market.tokens.filter((token) => token.funding).map((token) => [token.address, token.funding!]));
  const prices = Object.fromEntries(market.tokens.flatMap((token) => (token.closes[latestIndex] != null ? [[token.address, token.closes[latestIndex] as number]] : [])));

  const call = async (path: string, body?: unknown): Promise<Record<string, unknown>> => {
    const response = await lighter.fetch(`${INTERNAL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-internal-token": internalToken, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return (await response.json().catch(() => ({ status: "error", detail: `zolva-lighter answered ${response.status}` }))) as Record<string, unknown>;
  };
  const readAccount = async (index: number): Promise<LighterAccount | null> => {
    const body = await call(`/account?index=${index}`);
    // zolva-lighter returns the parsed account; parseAccount wants Lighter's raw shape, so rebuild it.
    if (!Array.isArray(body.positions)) return null;
    return parseAccount({
      accounts: [
        {
          index: body.index,
          collateral: body.collateral,
          available_balance: body.available,
          total_asset_value: body.totalValue,
          positions: (body.positions as Record<string, number>[]).map((p) => ({
            market_id: p.marketId,
            symbol: p.symbol,
            sign: p.size < 0 ? -1 : 1,
            position: Math.abs(p.size),
            avg_entry_price: p.avgEntryPrice,
            unrealized_pnl: p.unrealizedPnl,
            margin_mode: p.marginMode,
          })),
        },
      ],
    });
  };

  const { data: positionRows } = await db
    .from("positions")
    .select("agent_id, token_address, quantity, avg_entry_price, opened_at, side, stop_price")
    .in("agent_id", (agents as LighterAgent[]).map((agent) => agent.id));

  for (const agent of agents as LighterAgent[]) {
    try {
      const lastRun = agent.last_run_ts ? Date.parse(agent.last_run_ts) / 1000 : null;
      if (lastRun !== null && lastRun >= latestTs) continue;
      const accountIndex = Number(agent.lighter_account_index);
      const own = ((positionRows ?? []) as (EnginePositionRow & { agent_id: string })[]).filter((row) => row.agent_id === agent.id);

      // 1. Lighter first: anything Zolva did not do pauses the agent.
      const account = await readAccount(accountIndex);
      if (!account) throw new Error(`Lighter account ${accountIndex} could not be read`);
      const mismatches = reconcile(own, account, tokenOfMarket);
      const state = engineStateFromLighter(account, tokenOfMarket, prices, own, new Date(latestTs * 1000).toISOString());
      if (mismatches.length || state.unknownMarkets.length) {
        const reason = mismatches.length
          ? `positions differ from Lighter: ${mismatches.map((m) => `${symbolOf.get(m.token) ?? m.token} Zolva ${m.zolva} vs Lighter ${m.lighter}`).join("; ")}`
          : `Lighter holds markets Zolva does not trade (${state.unknownMarkets.join(", ")})`;
        await db.from("agents").update({ status: "paused" }).eq("id", agent.id);
        // Zolva's record follows Lighter, so the owner sees the real state on the agent page.
        await sync(db, agent.id, state);
        result.paused.push({ agentId: agent.id, reason });
        continue;
      }
      await sync(db, agent.id, state);

      // 2. Decide on the newest hour from Lighter's state.
      const synced: PositionRow[] = state.positions.map((row) => ({ ...row, margin: null }));
      const [hour] = planAgentHours(
        { ...agent, cash: state.cash, last_run_ts: new Date((latestTs - HOUR) * 1000).toISOString() },
        synced,
        { startTs: market.startTs, closes, funding },
        latestTs,
      );
      if (!hour) continue;
      const { data: written, error: writeError } = await db.rpc("apply_agent_hour", {
        p_agent_id: agent.id,
        p_ts: hour.ts,
        p_cash: state.cash,
        p_equity: account.totalValue,
        p_hold_equity: hour.holdEquity,
        p_decisions: hour.decisions,
        p_positions: state.positions.map((row) => ({ ...row, margin: null })),
        p_trades: [],
      });
      if (writeError) throw new Error(writeError.message);
      if (!written) continue; // another tick owns this hour

      // 3. Orders: whatever reduces risk first (sells and covers), then buys and shorts.
      const fills = [...(hour.trades as Fill[])].sort((a, b) => Number(lighterOrderFor(b.side).reduceOnly) - Number(lighterOrderFor(a.side).reduceOnly));
      for (const fill of fills) {
        const outcome = await placeFill(db, call, settings, agent, accountIndex, marketOfToken, hour.ts, fill);
        result.orders.push({ agentId: agent.id, token: symbolOf.get(fill.token_address) ?? fill.token_address, side: fill.side, ...outcome });
      }

      // 4. Lighter again: Zolva's positions and cash follow what really happened.
      if (fills.length) {
        const after = await readAccount(accountIndex);
        if (after) await sync(db, agent.id, engineStateFromLighter(after, tokenOfMarket, prices, state.positions, hour.ts));
      }
    } catch (cause) {
      result.failed.push({ agentId: agent.id, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  return result;
}

async function sync(db: SupabaseClient, agentId: string, state: { cash: number; positions: EnginePositionRow[] }) {
  const { error } = await db.rpc("sync_lighter_agent", { p_agent_id: agentId, p_cash: state.cash, p_positions: state.positions });
  if (error) throw new Error(`Syncing from Lighter failed: ${error.message}`);
}

async function placeFill(
  db: SupabaseClient,
  call: (path: string, body?: unknown) => Promise<Record<string, unknown>>,
  settings: Settings,
  agent: LighterAgent,
  accountIndex: number,
  marketOfToken: Map<string, number>,
  decidedTs: string,
  fill: Fill,
): Promise<{ status: string; detail: string }> {
  const marketId = marketOfToken.get(fill.token_address);
  if (marketId === undefined) return { status: "skipped", detail: "market has no Lighter id" };
  const order = lighterOrderFor(fill.side);

  // Daily volume cap for this agent, in dollars, from confirmed Lighter orders today.
  const dayStart = new Date(new Date().toISOString().slice(0, 10)).toISOString();
  const { data: today } = await db.from("executions").select("filled_base, fill_price").eq("agent_id", agent.id).eq("venue", "lighter").eq("status", "confirmed").gte("confirmed_at", dayStart);
  const volume = ((today ?? []) as { filled_base: number; fill_price: number }[]).reduce((sum, row) => sum + Number(row.filled_base) * Number(row.fill_price), 0);

  const { data: inserted, error: insertError } = await db
    .from("executions")
    .upsert(
      {
        agent_id: agent.id,
        token_address: fill.token_address,
        venue: "lighter",
        side: order.side,
        reduce_only: order.reduceOnly,
        reason: fill.reason,
        decided_ts: decidedTs,
        intended_quantity: fill.quantity,
        decision_price: fill.price,
        max_slippage_bps: settings.max_slippage_bps,
        status: "pending",
      },
      { onConflict: "agent_id,decided_ts,token_address,side", ignoreDuplicates: true },
    )
    .select("id");
  if (insertError) throw new Error(`Recording the order failed: ${insertError.message}`);
  const executionId = inserted?.[0]?.id as string | undefined;
  if (!executionId) return { status: "skipped", detail: "already ordered by another tick" };

  // Risk reducing orders always go; new risk respects the daily cap.
  if (!order.reduceOnly && volume + fill.quantity * fill.price > Number(settings.daily_volume_usd)) {
    await db.from("executions").update({ status: "cancelled", error: `daily volume cap $${settings.daily_volume_usd} reached` }).eq("id", executionId);
    return { status: "cancelled", detail: "daily volume cap" };
  }

  const response = await call("/order", { accountIndex, marketId, side: order.side, base: fill.quantity, reduceOnly: order.reduceOnly, maxSlippageBps: settings.max_slippage_bps });
  const status = String(response.status);
  const txHash = typeof response.txHash === "string" ? response.txHash.toLowerCase() : null;
  if (status === "filled" || status === "partial") {
    const { error } = await db.rpc("apply_lighter_fill", { p_execution_id: executionId, p_lighter_tx_hash: txHash, p_side: fill.side, p_filled_base: Number(response.filledBase), p_price: fill.price });
    if (error) throw new Error(`Recording the fill failed (tx ${txHash}): ${error.message}`);
    return { status, detail: `${response.filledBase} of ${response.plannedBase}` };
  }
  const detail = String(response.detail ?? response.error ?? status).slice(0, 300);
  if (status === "unconfirmed") {
    // Accepted by Lighter but no fill seen yet: the next hour's reconcile settles it from the account.
    await db.from("executions").update({ status: "submitted", lighter_tx_hash: txHash, submitted_at: new Date().toISOString() }).eq("id", executionId);
    return { status, detail: "accepted, fill not seen yet" };
  }
  const cancelled = status === "skipped" || status === "disabled";
  await db.from("executions").update({ status: cancelled ? "cancelled" : "failed", error: detail, ...(txHash ? { lighter_tx_hash: txHash } : {}) }).eq("id", executionId);
  if (!cancelled) await pauseAfterRepeatedFailures(db, agent.id);
  return { status: cancelled ? "cancelled" : "failed", detail };
}

/** Two failed orders in a row pause the agent until its owner looks at it (same rule as spot). */
async function pauseAfterRepeatedFailures(db: SupabaseClient, agentId: string) {
  const { data } = await db.from("executions").select("status").eq("agent_id", agentId).in("status", ["confirmed", "failed"]).order("created_at", { ascending: false }).limit(2);
  if (data?.length === 2 && data.every((row) => row.status === "failed")) await db.from("agents").update({ status: "paused" }).eq("id", agentId);
}
