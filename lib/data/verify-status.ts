import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { verifyBadge, type ShieldsBadge, type StoredVerify } from "@/lib/agents/verify-badge";

import { loadAndVerifyAgent, type VerifyReport } from "./verify";

/** Agents re-checked per hourly tick, oldest result first: 51 public agents take about 9 hours. */
export const VERIFY_PER_TICK = 6;

/** Stores an agent's latest verify result (agent_verify_status) for the badge. */
export async function saveVerifyStatus(db: SupabaseClient, report: VerifyReport): Promise<void> {
  const { error } = await db.from("agent_verify_status").upsert({
    agent_id: report.agentId,
    status: report.status,
    hours: report.hours,
    hours_differing: report.hoursDiffering,
    unverifiable_differing: report.unverifiable?.hoursDiffering ?? 0,
    checked_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Saving the verify result failed: ${error.message}`);
}

/** Ids of the published paper agents: the ones the public API lists and the badge counts. */
async function publicAgentIds(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from("agents").select("id").eq("mode", "paper").not("published_at", "is", null);
  if (error) throw new Error(`Loading public agents failed: ${error.message}`);
  return (data as { id: string }[]).map((row) => row.id);
}

async function storedResults(db: SupabaseClient, ids: string[]): Promise<StoredVerify[]> {
  if (!ids.length) return [];
  const { data, error } = await db.from("agent_verify_status").select("agent_id, status, checked_at").in("agent_id", ids);
  if (error) throw new Error(`Loading verify results failed: ${error.message}`);
  return (data as { agent_id: string; status: StoredVerify["status"]; checked_at: string }[]).map((row) => ({
    agentId: row.agent_id,
    status: row.status,
    checkedAt: Date.parse(row.checked_at) / 1000,
  }));
}

/**
 * Hourly tick step: replays the public agents whose stored result is missing or oldest and saves each.
 * Best effort: one agent failing is listed and the rest still run.
 */
export async function refreshVerifyStatuses(db: SupabaseClient, perTick = VERIFY_PER_TICK): Promise<{ checked: number; differs: string[]; failed: string[] }> {
  const ids = await publicAgentIds(db);
  const checkedAt = new Map((await storedResults(db, ids)).map((row) => [row.agentId, row.checkedAt]));
  const due = [...ids].sort((a, b) => (checkedAt.get(a) ?? 0) - (checkedAt.get(b) ?? 0)).slice(0, perTick);
  const result = { checked: 0, differs: [] as string[], failed: [] as string[] };
  for (const id of due) {
    try {
      const report = await loadAndVerifyAgent(db, id);
      if (!report) continue;
      await saveVerifyStatus(db, report);
      result.checked += 1;
      if (report.status === "differs") result.differs.push(id);
    } catch (cause) {
      result.failed.push(`${id}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  return result;
}

/** The README badge from the stored results. */
export async function loadVerifyBadge(db: SupabaseClient, nowSeconds = Date.now() / 1000): Promise<ShieldsBadge> {
  const ids = await publicAgentIds(db);
  return verifyBadge(ids, await storedResults(db, ids), nowSeconds);
}
