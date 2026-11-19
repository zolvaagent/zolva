/**
 * QProof shadow log (QHooks pilot, owner 2026-11-19; docs/outreach-qhooks.md). Log only: it never
 * changes a buy or a sell, and nothing here runs inside a trade.
 *
 * Every trench buy candidate is noted in trench_qproof. Once a minute, at most one call goes to QHooks'
 * MCP (https://qhooks.com/mcp, stateless JSON-RPC, one request per POST), and only to the free tool
 * `qproof_check`:
 *  - request:true asks QHooks to queue a fresh scan (queueing is not completion);
 *  - request:false reads the stored report only (no queue, no scan, no cost).
 * Never `qproof_scan` (paid, x402) and never a wallet. Public limit: 5 new checks per client per hour
 * with one in flight, so one token is queued at a time and at most MAX_REQUESTS_PER_HOUR are asked.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const MCP_URL = "https://qhooks.com/mcp?ref=zolva";
const PROTOCOL_VERSION = "2025-06-18";
/** QHooks' public limit is 5; one is kept spare for their own retries. */
export const MAX_REQUESTS_PER_HOUR = 4;
/** Wait this long after queueing before reading the report. */
const FIRST_POLL_MS = 3 * 60_000;
const POLL_EVERY_MS = 2 * 60_000;
/** Give up waiting for a fresh scan after this long; keep whatever report is stored then. */
const GIVE_UP_MS = 2 * 3_600_000;
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

/** What one qproof_check answer means for us. */
export type CheckAnswer = {
  /** QHooks' state, e.g. "ready" when a report is stored. */
  state: string;
  queued: boolean;
  /** Seconds QHooks asks us to wait before the next request, if any. */
  retryAfterSec: number | null;
  level: string | null;
  label: string | null;
  headline: string | null;
  /** When the stored report was completed (ms), if given. */
  completedAtMs: number | null;
  /** The whole parsed answer, stored as is. */
  raw: unknown;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, 500) : null;
}

/**
 * Reads a JSON-RPC body (plain JSON or one server-sent event) from QHooks' MCP into a CheckAnswer.
 * Throws with a short reason when it is an error or not the expected shape.
 */
export function parseCheckAnswer(body: string): CheckAnswer {
  const json = body.trimStart().startsWith("{") ? body : (body.split("\n").find((line) => line.startsWith("data:"))?.slice(5) ?? "");
  const rpc = JSON.parse(json) as { error?: { message?: string }; result?: { isError?: boolean; content?: { type: string; text?: string }[] } };
  if (rpc.error) throw new Error(`QHooks error: ${rpc.error.message ?? "unknown"}`);
  const content = rpc.result?.content?.find((part) => part.type === "text")?.text;
  if (!content) throw new Error("QHooks answer has no text content");
  if (rpc.result?.isError) throw new Error(`QHooks tool error: ${content.slice(0, 200)}`);
  const answer = JSON.parse(content) as Record<string, unknown>;
  const verdict = (answer.verdict ?? (answer.report as Record<string, unknown> | undefined)?.verdict ?? {}) as Record<string, unknown>;
  const report = (answer.report ?? {}) as Record<string, unknown>;
  const completed = typeof report.completedAt === "string" || typeof report.completedAt === "number" ? Date.parse(String(report.completedAt)) || Number(report.completedAt) : NaN;
  const retry = Number(answer.retryAfter);
  return {
    state: typeof answer.state === "string" ? answer.state : "unknown",
    queued: answer.queued === true,
    retryAfterSec: Number.isFinite(retry) && retry > 0 ? retry : null,
    level: text(verdict.level),
    label: text(verdict.label),
    headline: text(verdict.headline ?? verdict.reason),
    completedAtMs: Number.isFinite(completed) && completed > 0 ? completed : null,
    raw: answer,
  };
}

/** One qproof_check call. `request` true queues a fresh scan; false only reads what is stored. */
export async function qproofCheck(token: string, request: boolean, fetchImpl: typeof fetch = fetch): Promise<{ status: number; answer: CheckAnswer | null; retryAfterSec: number | null }> {
  const response = await fetchImpl(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL_VERSION },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "qproof_check", arguments: { chain: "robinhood", token, request } } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const header = Number(response.headers.get("retry-after"));
  const retryAfterSec = Number.isFinite(header) && header > 0 ? header : null;
  if (!response.ok) return { status: response.status, answer: null, retryAfterSec };
  return { status: response.status, answer: parseCheckAnswer(await response.text()), retryAfterSec };
}

/** Notes a trench buy candidate for a QProof check. Never throws: a failure here must not touch the trade. */
export async function noteQproofCandidate(db: SupabaseClient, candidate: { token: string; symbol: string; agentId: string }): Promise<void> {
  try {
    await db
      .from("trench_qproof")
      .upsert({ token: candidate.token.toLowerCase(), symbol: candidate.symbol, source: "candidate", agent_id: candidate.agentId }, { onConflict: "token", ignoreDuplicates: true });
  } catch {
    // Shadow log only.
  }
}

type Row = { token: string; source: string; state: string; requested_at: string | null; polled_at: string | null; attempts: number; retry_after: string | null };
const COLUMNS = "token, source, state, requested_at, polled_at, attempts, retry_after";

const stored = (answer: CheckAnswer, nowMs: number) => ({
  state: "ready",
  polled_at: new Date(nowMs).toISOString(),
  level: answer.level,
  label: answer.label,
  headline: answer.headline,
  completed_at: answer.completedAtMs ? new Date(answer.completedAtMs).toISOString() : null,
  report: answer.raw,
  error: null,
});

/**
 * One step of the shadow log, once a minute: read the report of the token in flight when it is due,
 * otherwise queue the next pending token if the hourly budget allows. At most one call per step.
 * Returns a short note for the minute summary.
 */
export async function qproofStep(db: SupabaseClient, nowMs: number, fetchImpl: typeof fetch = fetch): Promise<string> {
  const now = new Date(nowMs).toISOString();
  const { data: blocked } = await db.from("trench_qproof").select("token").gt("retry_after", now).limit(1);
  if (blocked && blocked.length > 0) return "waiting: QHooks asked us to retry later";

  // 1. The token in flight, if its report is due.
  const { data: inFlight } = await db.from("trench_qproof").select(COLUMNS).eq("state", "queued").order("requested_at").limit(1);
  const queued = (inFlight as Row[] | null)?.[0];
  if (queued) {
    const requestedMs = Date.parse(queued.requested_at ?? now);
    const lastPollMs = queued.polled_at ? Date.parse(queued.polled_at) : 0;
    if (nowMs - requestedMs < FIRST_POLL_MS || nowMs - lastPollMs < POLL_EVERY_MS) return `waiting for ${queued.token}`;
    const read = await qproofCheck(queued.token, false, fetchImpl);
    if (read.status === 429 || read.retryAfterSec) {
      await db.from("trench_qproof").update({ retry_after: new Date(nowMs + (read.retryAfterSec ?? 300) * 1000).toISOString(), polled_at: now }).eq("token", queued.token);
      return `read ${queued.token}: retry later`;
    }
    const answer = read.answer;
    // Fresh: completed after we asked (a minute of clock slack). Or waited long enough: keep what is stored.
    const fresh = answer?.state === "ready" && answer.completedAtMs !== null && answer.completedAtMs >= requestedMs - 60_000;
    if (answer && answer.state === "ready" && (fresh || nowMs - requestedMs >= GIVE_UP_MS)) {
      await db.from("trench_qproof").update(stored(answer, nowMs)).eq("token", queued.token);
      return `stored ${queued.token}: ${answer.level ?? "?"}${fresh ? "" : " (older report)"}`;
    }
    if (nowMs - requestedMs >= GIVE_UP_MS) {
      await db.from("trench_qproof").update({ state: "error", polled_at: now, error: `no report after ${GIVE_UP_MS / 3_600_000} h (state ${answer?.state ?? read.status})` }).eq("token", queued.token);
      return `gave up on ${queued.token}`;
    }
    await db.from("trench_qproof").update({ polled_at: now }).eq("token", queued.token);
    return `still queued: ${queued.token} (${answer?.state ?? read.status})`;
  }

  // 2. Queue the next pending token, within the hourly budget.
  const { count } = await db.from("trench_qproof").select("token", { count: "exact", head: true }).gt("requested_at", new Date(nowMs - 3_600_000).toISOString());
  if ((count ?? 0) >= MAX_REQUESTS_PER_HOUR) return "hourly budget used";
  const { data: pending } = await db.from("trench_qproof").select(COLUMNS).eq("state", "pending").order("first_seen_at").limit(1);
  const next = (pending as Row[] | null)?.[0];
  if (!next) return "nothing to check";
  try {
    // The pilot's baseline tokens were scanned by QHooks on 2026-11-19: read what is stored, queue nothing.
    if (next.source === "baseline") {
      const read = await qproofCheck(next.token, false, fetchImpl);
      if (read.answer?.state === "ready") {
        await db.from("trench_qproof").update({ ...stored(read.answer, nowMs), requested_at: null, attempts: next.attempts + 1 }).eq("token", next.token);
        return `stored baseline ${next.token}: ${read.answer.level ?? "?"}`;
      }
      // Nothing stored after all: fall through and ask for a scan like any candidate.
    }
    const asked = await qproofCheck(next.token, true, fetchImpl);
    if (asked.status === 429 || (asked.answer === null && asked.retryAfterSec)) {
      await db.from("trench_qproof").update({ retry_after: new Date(nowMs + (asked.retryAfterSec ?? 600) * 1000).toISOString() }).eq("token", next.token);
      return `queue ${next.token}: retry later`;
    }
    if (!asked.answer) throw new Error(`HTTP ${asked.status}`);
    await db.from("trench_qproof").update({ state: "queued", requested_at: now, attempts: next.attempts + 1, error: null }).eq("token", next.token);
    return `queued ${next.token} (${asked.answer.state}${asked.answer.queued ? ", scan queued" : ""})`;
  } catch (cause) {
    const message = (cause as Error).message.slice(0, 300);
    const attempts = next.attempts + 1;
    await db
      .from("trench_qproof")
      .update({ attempts, error: message, state: attempts >= MAX_ATTEMPTS ? "error" : "pending", retry_after: new Date(nowMs + 10 * 60_000).toISOString() })
      .eq("token", next.token);
    return `queue ${next.token} failed: ${message}`;
  }
}
