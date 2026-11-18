import "server-only";

/**
 * Read models for the Trenches pages. Never selects the encrypted Rushr key or Privy ids.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { agentRules, type PresetId, type TrenchRules } from "./rules.ts";
import type { TrenchSettings } from "./runner.ts";

export type TrenchAgentView = {
  id: string;
  name: string;
  preset: PresetId;
  /** Its rules, parsed (a preset's, or the owner's edited copy). */
  rules: TrenchRules;
  custom: boolean;
  budgetUsd: number;
  status: "setup" | "active" | "paused" | "halted" | "closed";
  walletAddress: string | null;
  rushrHandle: string | null;
  onRushr: boolean;
  /** Wallet made, on Rushr, and handed over to the user with Zolva as a limited signer. */
  setupDone: boolean;
  callouts: boolean;
  haltedReason: string | null;
  lastRunAt: string | null;
  createdAt: string;
};

export type TrenchPositionView = { token: string; symbol: string; costUsd: number; openedAt: string; closedAt: string | null; laddersDone: number };
export type TrenchTradeView = { ts: string; token: string; symbol: string; side: "buy" | "sell"; usd: number; pnlUsd: number | null; reason: string; txHash: string };
export type TrenchDecisionView = { ts: string; symbol: string | null; action: string; reason: string };

const AGENT_COLUMNS = "id, name, preset, rules, custom, budget_usd, status, wallet_address, policy_id, rushr_handle, rushr_key_enc, callouts, halted_reason, last_run_at, created_at";

type AgentRow = {
  id: string;
  name: string;
  preset: PresetId;
  rules: unknown;
  custom: boolean | null;
  budget_usd: number;
  status: TrenchAgentView["status"];
  wallet_address: string | null;
  policy_id: string | null;
  rushr_handle: string | null;
  rushr_key_enc: string | null;
  callouts: boolean;
  halted_reason: string | null;
  last_run_at: string | null;
  created_at: string;
};

const toView = (row: AgentRow): TrenchAgentView => ({
  id: row.id,
  name: row.name,
  preset: row.preset,
  rules: agentRules({ preset: row.preset, rules: row.rules, custom: row.custom }),
  custom: row.custom === true,
  budgetUsd: Number(row.budget_usd),
  status: row.status,
  walletAddress: row.wallet_address,
  rushrHandle: row.rushr_handle,
  // Only whether a key exists leaves the server, never the key.
  onRushr: Boolean(row.rushr_key_enc),
  setupDone: Boolean(row.policy_id && row.rushr_key_enc && row.wallet_address),
  callouts: row.callouts,
  haltedReason: row.halted_reason,
  lastRunAt: row.last_run_at,
  createdAt: row.created_at,
});

/** Agents can be created by everyone once open, and by the test wallets before that. */
export function mayCreateTrenchAgent(settings: TrenchSettings | null, owner: string | null): boolean {
  if (!settings) return false;
  if (settings.new_agents_open) return true;
  return Boolean(owner) && (settings.test_owners ?? []).includes(owner!.toLowerCase());
}

export async function getTrenchSettings(db: SupabaseClient): Promise<TrenchSettings | null> {
  const { data } = await db.from("trench_settings").select("*").eq("id", 1).maybeSingle();
  return (data as TrenchSettings | null) ?? null;
}

export async function listMyTrenchAgents(db: SupabaseClient, owner: string): Promise<TrenchAgentView[]> {
  const { data, error } = await db.from("trench_agents").select(AGENT_COLUMNS).eq("owner", owner).is("archived_at", null).order("created_at", { ascending: false });
  if (error) return [];
  return (data as AgentRow[]).map(toView);
}

export async function getMyTrenchAgent(db: SupabaseClient, owner: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data, error } = await db.from("trench_agents").select(AGENT_COLUMNS).eq("id", id).eq("owner", owner).maybeSingle();
  if (error || !data) return null;
  const [positions, trades, decisions] = await Promise.all([
    db.from("trench_positions").select("token, symbol, cost_usd, opened_at, closed_at, ladders_done").eq("agent_id", id).order("opened_at", { ascending: false }).limit(50),
    db.from("trench_trades").select("ts, token, symbol, side, usd, pnl_usd, reason, tx_hash").eq("agent_id", id).order("ts", { ascending: false }).limit(50),
    db.from("trench_decisions").select("ts, symbol, action, reason").eq("agent_id", id).order("ts", { ascending: false }).limit(150),
  ]);
  return {
    agent: toView(data as AgentRow),
    positions: (positions.data ?? []).map((row) => ({ token: row.token, symbol: row.symbol, costUsd: Number(row.cost_usd), openedAt: row.opened_at, closedAt: row.closed_at, laddersDone: row.ladders_done })) as TrenchPositionView[],
    trades: (trades.data ?? []).map((row) => ({ ts: row.ts, token: row.token, symbol: row.symbol, side: row.side, usd: Number(row.usd), pnlUsd: row.pnl_usd === null ? null : Number(row.pnl_usd), reason: row.reason, txHash: row.tx_hash })) as TrenchTradeView[],
    decisions: (decisions.data ?? []) as TrenchDecisionView[],
  };
}

export type ListedTrenchAgent = { handle: string; name: string; preset: PresetId; status: TrenchAgentView["status"] };

/** Zolva trench agents listed on Rushr (their handles are public there anyway). */
export async function listListedTrenchAgents(db: SupabaseClient): Promise<ListedTrenchAgent[]> {
  const { data, error } = await db
    .from("trench_agents")
    .select("rushr_handle, name, preset, status, created_at")
    .not("rushr_handle", "is", null)
    .in("status", ["active", "paused", "halted"])
    .order("created_at", { ascending: true })
    .limit(19);
  if (error) return [];
  return (data ?? []).map((row) => ({ handle: row.rushr_handle as string, name: row.name as string, preset: row.preset as PresetId, status: row.status as TrenchAgentView["status"] }));
}
