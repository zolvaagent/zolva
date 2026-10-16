import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isHouseOwner } from "@/lib/agents/house";
import type { AgentRow } from "@/lib/agents/plan";
import type { Decision } from "@/lib/engine/engine";

export type TokenRef = { address: string; symbol: string };

export type AgentSummary = {
  id: string;
  owner: string;
  isHouse: boolean;
  name: string;
  strategy: string;
  status: "active" | "paused";
  tokens: TokenRef[];
  startCapital: number;
  equity: number;
  holdEquity: number;
  returnPct: number;
  /** Return minus buy and hold return, in percentage points. */
  edge: number;
  maxDrawdownPct: number;
  trades: number;
  /** Hours the agent has been run. */
  runs: number;
  createdAt: number;
  lastTs: number | null;
};

let symbolCache: Map<string, string> | null = null;

export async function tokenSymbols(db: SupabaseClient): Promise<Map<string, string>> {
  if (symbolCache) return symbolCache;
  const { data, error } = await db.from("tokens").select("address, symbol");
  if (error) throw new Error(`Loading tokens failed: ${error.message}`);
  symbolCache = new Map(data.map((token) => [token.address, token.symbol]));
  return symbolCache;
}

type StatsRow = {
  id: string;
  owner: string;
  name: string;
  strategy: string;
  status: "active" | "paused";
  token_addresses: string[];
  start_capital: number;
  equity: number;
  hold_equity: number;
  runs: number;
  max_drawdown: number;
  trades: number;
  created_at: string;
  last_ts: string | null;
};

async function toSummaries(db: SupabaseClient, rows: StatsRow[]): Promise<AgentSummary[]> {
  const symbols = await tokenSymbols(db);
  return rows.map((row) => {
    const start = Number(row.start_capital);
    const returnPct = (Number(row.equity) / start - 1) * 100;
    const holdPct = (Number(row.hold_equity) / start - 1) * 100;
    return {
      id: row.id,
      owner: row.owner,
      isHouse: isHouseOwner(row.owner),
      name: row.name,
      strategy: row.strategy,
      status: row.status,
      tokens: row.token_addresses.map((address) => ({ address, symbol: symbols.get(address) ?? "?" })),
      startCapital: start,
      equity: Number(row.equity),
      holdEquity: Number(row.hold_equity),
      returnPct,
      edge: returnPct - holdPct,
      maxDrawdownPct: Number(row.max_drawdown) * 100,
      trades: Number(row.trades),
      runs: Number(row.runs),
      createdAt: Date.parse(row.created_at) / 1000,
      lastTs: row.last_ts ? Date.parse(row.last_ts) / 1000 : null,
    };
  });
}

const STATS_COLUMNS = "id, owner, name, strategy, status, token_addresses, start_capital, equity, hold_equity, runs, max_drawdown, trades, created_at, last_ts";

/** Every paper agent (active and paused), newest first. */
export async function listAgents(db: SupabaseClient): Promise<AgentSummary[]> {
  const { data, error } = await db.from("agent_stats").select(STATS_COLUMNS).eq("mode", "paper").order("created_at", { ascending: false });
  if (error) throw new Error(`Loading agents failed: ${error.message}`);
  return toSummaries(db, data as StatsRow[]);
}

export async function listAgentsByOwner(db: SupabaseClient, owner: string): Promise<AgentSummary[]> {
  const { data, error } = await db.from("agent_stats").select(STATS_COLUMNS).eq("owner", owner).order("created_at", { ascending: false });
  if (error) throw new Error(`Loading your agents failed: ${error.message}`);
  return toSummaries(db, data as StatsRow[]);
}

export type RunPoint = { ts: number; equity: number; holdEquity: number; cash: number; decisions: Decision[] };

/** Equity curves (last `hours` runs) for several agents, oldest first. */
export async function equityCurves(db: SupabaseClient, agentIds: string[], hours = 168): Promise<Map<string, number[]>> {
  const curves = new Map<string, number[]>();
  if (!agentIds.length) return curves;
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data, error } = await db.from("agent_runs").select("agent_id, ts, equity").in("agent_id", agentIds).gte("ts", since).order("ts").limit(5000);
  if (error) throw new Error(`Loading equity failed: ${error.message}`);
  for (const row of data) {
    const list = curves.get(row.agent_id) ?? [];
    list.push(Number(row.equity));
    curves.set(row.agent_id, list);
  }
  return curves;
}

export type DecisionEvent = Decision & { ts: number; agentId: string; agentName: string; symbol: string };

/** The latest buys and sells across all agents, newest first. */
export async function recentTrades(db: SupabaseClient, limit = 14): Promise<DecisionEvent[]> {
  const [{ data, error }, symbols] = await Promise.all([
    db.from("trades").select("agent_id, ts, token_address, side, reason, price, agents(name)").order("ts", { ascending: false }).limit(limit),
    tokenSymbols(db),
  ]);
  if (error) throw new Error(`Loading trades failed: ${error.message}`);
  const runs = await db
    .from("agent_runs")
    .select("agent_id, ts, decisions")
    .in(
      "agent_id",
      [...new Set(data.map((row) => row.agent_id))],
    )
    .in(
      "ts",
      [...new Set(data.map((row) => row.ts))],
    );
  const reasoning = new Map<string, string>();
  for (const run of runs.data ?? []) {
    for (const decision of run.decisions as Decision[]) reasoning.set(`${run.agent_id}|${run.ts}|${decision.token}`, decision.reasoning);
  }
  return data.map((row) => ({
    token: row.token_address,
    symbol: symbols.get(row.token_address) ?? "?",
    action: row.side as "buy" | "sell",
    reasoning: reasoning.get(`${row.agent_id}|${row.ts}|${row.token_address}`) ?? (row.side === "buy" ? "Bought." : "Sold."),
    ts: Date.parse(row.ts) / 1000,
    agentId: row.agent_id,
    agentName: (row.agents as unknown as { name: string } | null)?.name ?? "Agent",
  }));
}

export type AgentDetail = {
  agent: AgentRow & { owner: string; name: string; status: "active" | "paused"; created_at: string; ai_model: string | null };
  summary: AgentSummary;
  runs: RunPoint[];
  trades: { ts: number; token: string; symbol: string; side: "buy" | "sell"; quantity: number; price: number; costUsd: number; reason: string }[];
  positions: { token: string; symbol: string; quantity: number; entryPrice: number; openedAt: number | null }[];
};

/** Everything the agent page needs; null if the agent does not exist. */
export async function getAgentDetail(db: SupabaseClient, id: string): Promise<AgentDetail | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data: agent, error } = await db
    .from("agents")
    .select("id, owner, name, strategy, params, token_addresses, start_capital, cash, last_run_ts, status, created_at, ai_model")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Loading the agent failed: ${error.message}`);
  if (!agent) return null;

  const [stats, runs, trades, positions, symbols] = await Promise.all([
    db.from("agent_stats").select(STATS_COLUMNS).eq("id", id).single(),
    db.from("agent_runs").select("ts, equity, hold_equity, cash, decisions").eq("agent_id", id).order("ts", { ascending: false }).limit(720),
    db.from("trades").select("ts, token_address, side, quantity, price, cost_usd, reason").eq("agent_id", id).order("ts", { ascending: false }).limit(50),
    db.from("positions").select("token_address, quantity, avg_entry_price, opened_at").eq("agent_id", id),
    tokenSymbols(db),
  ]);
  for (const result of [stats, runs, trades, positions]) if (result.error) throw new Error(result.error.message);

  const [summary] = await toSummaries(db, [stats.data as StatsRow]);
  return {
    agent: agent as AgentDetail["agent"],
    summary,
    runs: (runs.data ?? [])
      .map((run) => ({ ts: Date.parse(run.ts) / 1000, equity: Number(run.equity), holdEquity: Number(run.hold_equity ?? run.equity), cash: Number(run.cash), decisions: run.decisions as Decision[] }))
      .reverse(),
    trades: (trades.data ?? []).map((trade) => ({
      ts: Date.parse(trade.ts) / 1000,
      token: trade.token_address,
      symbol: symbols.get(trade.token_address) ?? "?",
      side: trade.side as "buy" | "sell",
      quantity: Number(trade.quantity),
      price: Number(trade.price),
      costUsd: Number(trade.cost_usd),
      reason: trade.reason,
    })),
    positions: (positions.data ?? []).map((position) => ({
      token: position.token_address,
      symbol: symbols.get(position.token_address) ?? "?",
      quantity: Number(position.quantity),
      entryPrice: Number(position.avg_entry_price),
      openedAt: position.opened_at ? Date.parse(position.opened_at) / 1000 : null,
    })),
  };
}
