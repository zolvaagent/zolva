import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isHouseOwner } from "@/lib/agents/house";
import { tokenSymbols } from "@/lib/data/agents";
import { isPerpSymbol } from "@/lib/format";

/** What the share card and the share text show for one agent. */
export type AgentShare = {
  id: string;
  name: string;
  symbols: string[];
  createdAt: number;
  live: boolean;
  perps: boolean;
  startCapital: number;
  equity: number;
  returnPct: number;
  pnlUsd: number;
  holdReturnPct: number;
  /** Hourly [agent value, holding value], oldest first, for the small chart. */
  curve: [number, number][];
};

/** Most points the card's chart draws; longer histories are thinned evenly. */
const CURVE_POINTS = 120;

/**
 * The share data for an agent, or null when it must not be shared: unknown, private (not
 * published) or not run yet. House agents are always public. Same rule as the Share button.
 */
export async function getAgentShare(db: SupabaseClient, id: string): Promise<AgentShare | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [stats, record, runs, symbols] = await Promise.all([
    db.from("agent_stats").select("id, owner, name, token_addresses, start_capital, equity, hold_equity, created_at, published_at, mode").eq("id", id).maybeSingle(),
    db.from("agents").select("first_published_at").eq("id", id).maybeSingle(),
    db.from("agent_runs").select("equity, hold_equity").eq("agent_id", id).order("ts", { ascending: false }).limit(720),
    tokenSymbols(db),
  ]);
  if (stats.error) throw new Error(`Loading the agent failed: ${stats.error.message}`);
  if (runs.error) throw new Error(`Loading the agent's runs failed: ${runs.error.message}`);
  const row = stats.data;
  // Same rule as the page: once published, always shareable (unpublishing only leaves the leaderboard).
  const everPublished = row?.published_at != null || record.data?.first_published_at != null;
  if (!row || (!everPublished && !isHouseOwner(row.owner)) || !runs.data.length) return null;

  const start = Number(row.start_capital);
  const equity = Number(row.equity);
  const all = runs.data.map((run) => [Number(run.equity), Number(run.hold_equity ?? run.equity)] as [number, number]).reverse();
  const step = Math.max(1, Math.ceil(all.length / CURVE_POINTS));
  const curve = all.filter((_, index) => index % step === 0 || index === all.length - 1);
  const symbolList = (row.token_addresses as string[]).map((address) => symbols.get(address) ?? "?");

  return {
    id: row.id,
    name: row.name,
    symbols: symbolList,
    createdAt: Date.parse(row.created_at) / 1000,
    live: row.mode === "live",
    perps: symbolList.some(isPerpSymbol),
    startCapital: start,
    equity,
    returnPct: (equity / start - 1) * 100,
    pnlUsd: equity - start,
    holdReturnPct: (Number(row.hold_equity) / start - 1) * 100,
    curve,
  };
}
