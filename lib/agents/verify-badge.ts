/**
 * The README badge "replay-verified N/M agents" in shields.io's endpoint format
 * (https://shields.io/badges/endpoint-badge), from the stored verify results (agent_verify_status).
 * Pure: the loader (lib/data/verify-status.ts) brings the rows.
 */

export type StoredVerify = { agentId: string; status: "match" | "differs" | "no_history"; checkedAt: number };

export type ShieldsBadge = { schemaVersion: 1; label: string; message: string; color: string; cacheSeconds: number };

/** A stored result older than this no longer counts: the agent is "being checked" again. */
export const VERIFY_STALE_SECONDS = 24 * 3600;
/** How long shields.io may reuse the badge (it re-reads the endpoint after this). */
const BADGE_CACHE_SECONDS = 3600;

/**
 * Counts the public agents whose latest replay matches. Red when any public agent differs; yellow while
 * some have no fresh result yet (so the badge never claims more than was checked); green when all match.
 * An agent that has not run yet (no_history) has nothing to differ, so it counts as matching.
 */
export function verifyBadge(publicAgentIds: string[], rows: StoredVerify[], nowSeconds: number): ShieldsBadge {
  const latest = new Map(rows.filter((row) => nowSeconds - row.checkedAt <= VERIFY_STALE_SECONDS).map((row) => [row.agentId, row.status]));
  const total = publicAgentIds.length;
  const statuses = publicAgentIds.map((id) => latest.get(id));
  const matching = statuses.filter((status) => status === "match" || status === "no_history").length;
  const differing = statuses.filter((status) => status === "differs").length;
  const unchecked = statuses.filter((status) => status === undefined).length;
  const color = differing > 0 ? "red" : unchecked > 0 ? "yellow" : "brightgreen";
  return { schemaVersion: 1, label: "replay-verified", message: `${matching}/${total} agents`, color, cacheSeconds: BADGE_CACHE_SECONDS };
}
