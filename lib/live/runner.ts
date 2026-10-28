import "server-only";

import { PrivyClient } from "@privy-io/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { erc20Abi, formatUnits, parseUnits, type Hex } from "viem";

import { planAgentHours, type AgentRow, type PositionRow } from "@/lib/agents/plan";
import { getMarket } from "@/lib/data/market";
import { env } from "@/lib/env";
import { USDG } from "@/lib/live/contracts";
import { confirmSwap, executeSwap, type LiveContext, type SwapOrder, type SwapResult } from "@/lib/live/executor";
import { createChainClient } from "@/lib/prices/onchain";

const HOUR = 3600;
/** An order still pending this long without a transaction was abandoned by a crashed tick. */
const STALE_MS = 30 * 60 * 1000;
const ETH_USD_FEED = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9";
const FEED_ABI = [{ type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }] }] as const;

export type LiveResult = {
  enabled: boolean;
  note: string | null;
  agents: number;
  /** Hours a live agent did not act on because they were already old (never replayed with real money). */
  skippedHours: number;
  orders: { agentId: string; token: string; side: string; status: string; detail: string }[];
  recovered: number;
  failed: { agentId: string; error: string }[];
};

type Settings = { enabled: boolean; daily_volume_usd: number; max_slippage_bps: number; max_deviation_bps: number };
type TokenInfo = { address: string; symbol: string; price_pool: string; pool_kind: string; token_decimals: number; chainlink_feed: string | null };
type LiveAgent = AgentRow & { owner: string; trading_wallet: string };
type WalletRow = { address: string; privy_wallet_id: string };
type ExecutionRow = { id: string; agent_id: string; token_address: string; side: "buy" | "sell"; amount_in: number | null; tx_hash: string | null; status: string; created_at: string };

const usdOf = (side: string, amountIn: number, amountOut: number) => (side === "buy" ? amountIn : amountOut);

/**
 * Runs every active live agent on the newest hour, after the paper agents.
 * Does nothing unless live_settings.enabled is true and the signer key is set.
 * Live agents never replay missed hours: acting on an old price with real
 * money is worse than waiting. Each decision becomes an execution row first
 * (unique per agent, hour, token and side), so two ticks cannot double-trade.
 */
export async function runLiveAgents(db: SupabaseClient): Promise<LiveResult> {
  const result: LiveResult = { enabled: false, note: null, agents: 0, skippedHours: 0, orders: [], recovered: 0, failed: [] };
  const { data: settings, error: settingsError } = await db.from("live_settings").select("enabled, daily_volume_usd, max_slippage_bps, max_deviation_bps").eq("id", 1).single<Settings>();
  if (settingsError) throw new Error(`Loading live settings failed: ${settingsError.message}`);
  if (!settings.enabled) return { ...result, note: "live trading is switched off" };
  const privyConfig = env.privy;
  const authorizationKey = env.privyAuthorizationKey;
  if (!privyConfig || !authorizationKey) return { ...result, note: "Privy signer key not configured" };
  result.enabled = true;

  const chain = createChainClient(env.robinhoodRpcUrl);
  const privy = new PrivyClient({ appId: privyConfig.appId, appSecret: privyConfig.appSecret });
  const [, ethAnswer] = await chain.readContract({ address: ETH_USD_FEED, abi: FEED_ABI, functionName: "latestRoundData" });
  const ethUsd = Number(ethAnswer) / 1e8;

  const [{ data: tokens, error: tokensError }, { data: wallets, error: walletsError }] = await Promise.all([
    db.from("tokens").select("address, symbol, price_pool, pool_kind, token_decimals, chainlink_feed"),
    db.from("live_wallets").select("address, privy_wallet_id"),
  ]);
  if (tokensError || walletsError) throw new Error(`Loading live config failed: ${(tokensError ?? walletsError)!.message}`);
  const tokenOf = new Map((tokens as TokenInfo[]).map((token) => [token.address, token]));
  const walletOf = new Map((wallets as WalletRow[]).map((wallet) => [wallet.address, wallet]));
  const contextFor = (wallet: WalletRow): LiveContext => ({ chain, privy, authorizationKey, walletId: wallet.privy_wallet_id, wallet: wallet.address as Hex, ethUsd });

  const { data: agents, error: agentsError } = await db
    .from("agents")
    .select("id, owner, trading_wallet, strategy, params, token_addresses, start_capital, cash, last_run_ts")
    .eq("mode", "live")
    .eq("status", "active");
  if (agentsError) throw new Error(`Loading live agents failed: ${agentsError.message}`);
  const agentOf = new Map((agents as LiveAgent[]).map((agent) => [agent.id, agent]));
  result.agents = agents.length;

  // 1. Finish what a crashed tick left behind.
  const { data: open } = await db.from("executions").select("id, agent_id, token_address, side, amount_in, tx_hash, status, created_at").in("status", ["pending", "submitted"]);
  for (const execution of (open ?? []) as ExecutionRow[]) {
    const agent = agentOf.get(execution.agent_id);
    const wallet = agent && walletOf.get(agent.trading_wallet);
    const token = tokenOf.get(execution.token_address);
    if (execution.status === "submitted" && execution.tx_hash && wallet && token && execution.amount_in) {
      const decimals = execution.side === "buy" ? 6 : token.token_decimals;
      const confirmed = await confirmSwap(
        contextFor(wallet),
        { tokenOut: (execution.side === "buy" ? token.address : USDG) as Hex, amountIn: parseUnits(String(execution.amount_in), decimals), side: execution.side, tokenDecimals: token.token_decimals },
        execution.tx_hash as Hex,
      );
      await settle(db, execution.id, execution.side, token.token_decimals, confirmed);
      result.recovered += 1;
    } else if (Date.now() - Date.parse(execution.created_at) > STALE_MS) {
      await db.from("executions").update({ status: "cancelled", error: "abandoned by an interrupted tick" }).eq("id", execution.id);
      result.recovered += 1;
    }
  }
  if (!agents.length) return result;

  // 2. Decide on the newest hour and execute.
  const market = await getMarket(db);
  if (!market.hours) return result;
  const latestTs = market.startTs + (market.hours - 1) * HOUR;
  const closes = Object.fromEntries(market.tokens.map((token) => [token.address, token.closes]));
  const { data: positions } = await db.from("positions").select("agent_id, token_address, quantity, avg_entry_price, opened_at").in("agent_id", [...agentOf.keys()]);

  for (const agent of agents as LiveAgent[]) {
    try {
      const wallet = walletOf.get(agent.trading_wallet);
      if (!wallet) throw new Error(`wallet ${agent.trading_wallet} is not on the live allowlist`);
      const lastRun = agent.last_run_ts ? Date.parse(agent.last_run_ts) / 1000 : null;
      if (lastRun !== null && lastRun >= latestTs) continue;
      if (lastRun !== null && lastRun < latestTs - HOUR) result.skippedHours += (latestTs - HOUR - lastRun) / HOUR;

      const own = ((positions ?? []) as (PositionRow & { agent_id: string })[]).filter((position) => position.agent_id === agent.id);
      // Only the newest hour: pretend the agent ran up to the hour before it.
      const [hour] = planAgentHours({ ...agent, last_run_ts: new Date((latestTs - HOUR) * 1000).toISOString() }, own, { startTs: market.startTs, closes }, latestTs);
      if (!hour) continue;
      // Record the decisions; trades, positions and cash only change with real fills.
      const { data: written, error: writeError } = await db.rpc("apply_agent_hour", {
        p_agent_id: agent.id,
        p_ts: hour.ts,
        p_cash: Number(agent.cash),
        p_equity: hour.equity,
        p_hold_equity: hour.holdEquity,
        p_decisions: hour.decisions,
        p_positions: own.map(({ token_address, quantity, avg_entry_price, opened_at }) => ({ token_address, quantity, avg_entry_price, opened_at })),
        p_trades: [],
      });
      if (writeError) throw new Error(writeError.message);
      if (!written) continue; // another tick owns this hour

      // Sells first, so their USDG is back before any buy.
      const fills = [...hour.trades].sort((a, b) => (a.side === b.side ? 0 : a.side === "sell" ? -1 : 1));
      for (const fill of fills) {
        const outcome = await executeFill(db, agent, wallet, contextFor(wallet), tokenOf, settings, hour.ts, fill, own);
        result.orders.push({ agentId: agent.id, token: tokenOf.get(fill.token_address)?.symbol ?? fill.token_address, side: fill.side, ...outcome });
      }
    } catch (cause) {
      result.failed.push({ agentId: agent.id, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  return result;
}

type Fill = { token_address: string; side: "buy" | "sell"; quantity: number; price: number; cost_usd: number; reason: string };

async function executeFill(
  db: SupabaseClient,
  agent: LiveAgent,
  wallet: WalletRow,
  ctx: LiveContext,
  tokenOf: Map<string, TokenInfo>,
  settings: Settings,
  decidedTs: string,
  fill: Fill,
  positions: PositionRow[],
): Promise<{ status: string; detail: string }> {
  const token = tokenOf.get(fill.token_address);
  if (!token) return { status: "skipped", detail: "unknown token" };
  if (token.pool_kind !== "v3") return { status: "skipped", detail: `${token.symbol} trades through a v4 pool, not supported live` };

  // Reference price: Chainlink when the token has a feed, otherwise the hourly close the decision used.
  let referencePrice = fill.price;
  let oraclePrice: number | null = null;
  if (token.chainlink_feed) {
    const [, answer] = await ctx.chain.readContract({ address: token.chainlink_feed as Hex, abi: FEED_ABI, functionName: "latestRoundData" });
    oraclePrice = Number(answer) / 1e8;
    referencePrice = oraclePrice;
  }

  // Amount in human units: USDG for buys, tokens for sells (never more than the wallet holds).
  let amountIn: number;
  let raw: bigint;
  if (fill.side === "buy") {
    amountIn = Math.min(fill.quantity * fill.price + fill.cost_usd, Number(agent.cash));
    raw = parseUnits(amountIn.toFixed(6), 6);
  } else {
    const held = positions.find((position) => position.token_address === fill.token_address);
    const balance = await ctx.chain.readContract({ address: token.address as Hex, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address as Hex] });
    const wanted = parseUnits(Number(held?.quantity ?? fill.quantity).toFixed(token.token_decimals), token.token_decimals);
    raw = wanted < balance ? wanted : balance;
    amountIn = Number(formatUnits(raw, token.token_decimals));
  }
  if (raw <= 0n) return { status: "skipped", detail: "nothing to trade" };

  // Daily volume cap per wallet.
  const dayStart = new Date(new Date().toISOString().slice(0, 10)).toISOString();
  const { data: today } = await db.from("executions").select("side, amount_in, amount_out, agents!inner(trading_wallet)").eq("status", "confirmed").eq("agents.trading_wallet", wallet.address).gte("confirmed_at", dayStart);
  const volume = ((today ?? []) as { side: string; amount_in: number; amount_out: number }[]).reduce((sum, row) => sum + usdOf(row.side, Number(row.amount_in), Number(row.amount_out)), 0);
  const orderUsd = fill.side === "buy" ? amountIn : amountIn * fill.price;

  const { data: inserted, error: insertError } = await db
    .from("executions")
    .upsert(
      {
        agent_id: agent.id,
        token_address: token.address,
        side: fill.side,
        reason: fill.reason,
        decided_ts: decidedTs,
        ...(fill.side === "buy" ? { intended_usd: amountIn } : { intended_quantity: amountIn }),
        decision_price: fill.price,
        oracle_price: oraclePrice,
        max_slippage_bps: settings.max_slippage_bps,
        amount_in: amountIn,
        status: "pending",
      },
      { onConflict: "agent_id,decided_ts,token_address,side", ignoreDuplicates: true },
    )
    .select("id");
  if (insertError) throw new Error(`Recording the order failed: ${insertError.message}`);
  const executionId = inserted?.[0]?.id as string | undefined;
  if (!executionId) return { status: "skipped", detail: "already ordered by another tick" };

  if (volume + orderUsd > Number(settings.daily_volume_usd)) {
    await db.from("executions").update({ status: "cancelled", error: `daily volume cap $${settings.daily_volume_usd} reached` }).eq("id", executionId);
    return { status: "cancelled", detail: "daily volume cap" };
  }

  const order: SwapOrder = {
    tokenIn: (fill.side === "buy" ? USDG : token.address) as Hex,
    tokenOut: (fill.side === "buy" ? token.address : USDG) as Hex,
    amountIn: raw,
    pool: token.price_pool as Hex,
    side: fill.side,
    tokenDecimals: token.token_decimals,
    referencePrice,
    maxSlippageBps: settings.max_slippage_bps,
    maxDeviationBps: settings.max_deviation_bps,
  };
  const swap = await executeSwap(ctx, order, async (txHash) => {
    await db.from("executions").update({ status: "submitted", tx_hash: txHash, submitted_at: new Date().toISOString() }).eq("id", executionId);
  });
  await settle(db, executionId, fill.side, token.token_decimals, swap);
  if (!swap.ok) await pauseAfterRepeatedFailures(db, agent.id);
  return swap.ok ? { status: "confirmed", detail: swap.txHash } : { status: swap.stage === "price" || swap.stage === "balance" ? "cancelled" : "failed", detail: `${swap.stage}: ${swap.error}` };
}

/** Writes the outcome of a swap: the fill on success, the reason otherwise. */
async function settle(db: SupabaseClient, executionId: string, side: "buy" | "sell", tokenDecimals: number, swap: SwapResult) {
  if (swap.ok) {
    const amountIn = Number(formatUnits(swap.amountIn, side === "buy" ? 6 : tokenDecimals));
    const amountOut = Number(formatUnits(swap.amountOut, side === "buy" ? tokenDecimals : 6));
    const { error } = await db.rpc("apply_live_fill", {
      p_execution_id: executionId,
      p_tx_hash: swap.txHash.toLowerCase(),
      p_amount_in: amountIn,
      p_amount_out: amountOut,
      p_gas_used: Number(swap.gasUsed),
      p_gas_cost_usd: swap.gasCostUsd,
    });
    if (error) throw new Error(`Recording the fill failed (tx ${swap.txHash}): ${error.message}`);
    return;
  }
  // Nothing sent (price moved, not enough balance): cancelled. Sent and failed: failed.
  const status = swap.stage === "price" || swap.stage === "balance" || swap.stage === "quote" ? "cancelled" : "failed";
  await db
    .from("executions")
    .update({ status, error: `${swap.stage}: ${swap.error}`.slice(0, 500), ...(swap.txHash ? { tx_hash: swap.txHash.toLowerCase() } : {}) })
    .eq("id", executionId);
}

/** Two failed transactions in a row pause the agent until its owner looks at it. */
async function pauseAfterRepeatedFailures(db: SupabaseClient, agentId: string) {
  const { data } = await db.from("executions").select("status").eq("agent_id", agentId).in("status", ["confirmed", "failed"]).order("created_at", { ascending: false }).limit(2);
  if (data?.length === 2 && data.every((row) => row.status === "failed")) {
    await db.from("agents").update({ status: "paused" }).eq("id", agentId);
  }
}
