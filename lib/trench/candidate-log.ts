/**
 * Candidate log, part 1 of the supervised self-improvement loop (docs/trench-self-improvement-design.md,
 * owner "ya semua" 2026-11-26). Every minute the trench runner already looks at Rushr's almost-bonded list;
 * this keeps what it saw for every token, bought or not: the first and latest market cap, the stage that
 * stopped it under the Curve Rider entry (or that it passed), the inputs behind that verdict, and its
 * forward path at +1 h, +6 h, +24 h, +72 h and +7 days after we first saw it. It only records; it never
 * decides a trade (decisions stay in runMinute). Research's forward test from 27 Nov reads it too.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { listStage, statsStage, type CandidateInput, type RushrToken } from "./engine.ts";
import { PRESETS, parseTrenchRules, type TrenchRules } from "./rules.ts";

/** The rule every candidate is judged against: Curve Rider's entry. Bump it when that entry changes. */
export const CANDIDATE_RULE = "curve_rider_entry@2026-11-26";
/** Forward path points: label and hours after first seen. */
export const PATH_HORIZONS = [
  ["1h", 1],
  ["6h", 6],
  ["24h", 24],
  ["72h", 72],
  ["7d", 168],
] as const;
/** Rushr token lookups for forward paths per minute (shared with the rest of the minute's calls). */
const MAX_PATH_SAMPLES_PER_MINUTE = 6;

export type CandidateStage = "list" | "stats" | "social" | "unchecked" | "pass";
export type CandidateVerdict = { stage: CandidateStage; reason: string | null };

/**
 * Where a candidate stands under the rule, from what this minute checked. "unchecked" means the deeper
 * checks didn't run for it this minute (the runner checks a few tokens a minute), not that it failed.
 */
export function candidateVerdict(candidate: CandidateInput, rules: TrenchRules, nowMs: number): CandidateVerdict {
  const listed = listStage(candidate.token, rules, nowMs);
  if (!listed.pass) return { stage: "list", reason: listed.reason };
  if (!candidate.checks) return { stage: "unchecked", reason: "deeper checks not run this minute" };
  const stats = statsStage({ ...candidate.checks, tradesRank: candidate.tradesRank }, rules);
  if (!stats.pass) return { stage: "stats", reason: stats.reason };
  if (rules.entry.requireSocial) {
    if (!candidate.social) return { stage: "unchecked", reason: "X check not done yet" };
    if (!candidate.social.pass) return { stage: "social", reason: candidate.social.reason };
  }
  return { stage: "pass", reason: null };
}

/** The facts behind a verdict, kept as they were that minute. */
export function candidateInputs(candidate: CandidateInput): Record<string, unknown> {
  const { token, checks, tradesRank } = candidate;
  return {
    bonding: token.bonding_progress,
    marketCapUsd: token.market_cap_usd,
    athMarketCapUsd: token.ath_market_cap_usd,
    devPct: token.dev_pct,
    freshPct: token.fresh_pct,
    top10Pct: token.top10_pct,
    trades24h: token.trades_24h,
    buyTaxBps: token.buy_tax_bps,
    sellTaxBps: token.sell_tax_bps,
    twitter: token.twitter_handle,
    tradesRank,
    stats: checks?.stats ?? null,
    safetyBlocked: checks?.safetyBlocked ?? null,
    dexPaidMinutesAfterLaunch: checks?.dexPaidMinutesAfterLaunch ?? null,
    social: candidate.social,
  };
}

type Stored = { token: string; stage: CandidateStage; high_mcap: number | null; low_mcap: number | null; passed_at: string | null };

/** Records this minute's curve candidates. Returns how many were written. */
export async function logCandidates(db: SupabaseClient, candidates: CandidateInput[], nowMs: number): Promise<number> {
  if (candidates.length === 0) return 0;
  const rules = parseTrenchRules(PRESETS.almost_bonded, "almost_bonded");
  const now = new Date(nowMs).toISOString();
  const { data, error } = await db
    .from("trench_candidates")
    .select("token, stage, high_mcap, low_mcap, passed_at")
    .in(
      "token",
      candidates.map((candidate) => candidate.token.address),
    );
  if (error) throw new Error(`loading candidates failed: ${error.message}`);
  const stored = new Map((data as Stored[]).map((row) => [row.token, row]));

  const fresh: Record<string, unknown>[] = [];
  const seen: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const firstPasses: { token: string; mcap: number | null }[] = [];
  for (const candidate of candidates) {
    const { token } = candidate;
    const verdict = candidateVerdict(candidate, rules, nowMs);
    const mcap = token.market_cap_usd ?? null;
    const before = stored.get(token.address);
    const passedNow = verdict.stage === "pass" && !before?.passed_at;
    const common = {
      token: token.address,
      symbol: token.symbol,
      rule: CANDIDATE_RULE,
      last_seen_at: now,
      last_mcap: mcap,
      stage: verdict.stage,
      reason: verdict.reason,
      inputs: candidateInputs(candidate),
      high_mcap: maxOf(before?.high_mcap ?? null, mcap),
      low_mcap: minOf(before?.low_mcap ?? null, mcap),
      passed_at: passedNow ? now : (before?.passed_at ?? null),
    };
    if (!before) fresh.push({ ...common, first_seen_at: now, first_mcap: mcap, launched_at: token.created_at, passed_mcap: passedNow ? mcap : null });
    else {
      seen.push(common);
      if (passedNow) firstPasses.push({ token: token.address, mcap });
    }
    // A stage change is an event; the reason's numbers move every minute, so they don't count as one.
    if (!before || before.stage !== verdict.stage) events.push({ token: token.address, at: now, stage: verdict.stage, reason: verdict.reason, mcap, bonding: token.bonding_progress });
  }
  // Existing rows keep their first-seen facts: new and seen rows are written separately.
  if (fresh.length > 0) {
    const inserted = await db.from("trench_candidates").insert(fresh);
    if (inserted.error) throw new Error(`saving new candidates failed: ${inserted.error.message}`);
  }
  // Every seen row has the same columns, so one upsert updates them all and leaves the first-seen facts alone.
  if (seen.length > 0) {
    const updated = await db.from("trench_candidates").upsert(seen, { onConflict: "token" });
    if (updated.error) throw new Error(`updating candidates failed: ${updated.error.message}`);
  }
  for (const pass of firstPasses) {
    const updated = await db.from("trench_candidates").update({ passed_mcap: pass.mcap }).eq("token", pass.token);
    if (updated.error) throw new Error(`saving a first pass failed: ${updated.error.message}`);
  }
  if (events.length > 0) {
    const logged = await db.from("trench_candidate_events").insert(events);
    if (logged.error) throw new Error(`saving candidate events failed: ${logged.error.message}`);
  }
  return candidates.length;
}

const maxOf = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));
const minOf = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

export type PathPoint = { at: string; mcap: number | null; bonding: number | null; graduated: boolean | null };

/** The horizons due and not yet recorded for a candidate first seen at firstSeenMs. */
export function dueHorizons(firstSeenMs: number, recorded: Record<string, unknown>, nowMs: number): string[] {
  return PATH_HORIZONS.filter(([label, hours]) => !(label in recorded) && nowMs >= firstSeenMs + hours * 3_600_000).map(([label]) => label);
}

/**
 * Fills in due forward-path points, a few tokens a minute. A late point (the runner was down) is taken
 * now and keeps its real time in `at`. A token Rushr no longer knows is recorded with nulls.
 */
export async function samplePaths(db: SupabaseClient, nowMs: number, lookup: (address: string) => Promise<RushrToken | null>): Promise<number> {
  const { data, error } = await db
    .from("trench_candidates")
    .select("token, first_seen_at, paths")
    .eq("paths_done", false)
    .lte("first_seen_at", new Date(nowMs - 3_600_000).toISOString())
    .order("first_seen_at")
    .limit(200);
  if (error) throw new Error(`loading candidate paths failed: ${error.message}`);
  let sampled = 0;
  for (const row of (data ?? []) as { token: string; first_seen_at: string; paths: Record<string, PathPoint> }[]) {
    if (sampled >= MAX_PATH_SAMPLES_PER_MINUTE) break;
    const due = dueHorizons(Date.parse(row.first_seen_at), row.paths, nowMs);
    if (due.length === 0) continue;
    sampled += 1;
    const token = await lookup(row.token);
    const point: PathPoint = { at: new Date(nowMs).toISOString(), mcap: token?.market_cap_usd ?? null, bonding: token?.bonding_progress ?? null, graduated: token ? Boolean(token.migrated_at) : null };
    const paths = { ...row.paths, ...Object.fromEntries(due.map((label) => [label, point])) };
    const done = PATH_HORIZONS.every(([label]) => label in paths);
    const updated = await db.from("trench_candidates").update({ paths, paths_done: done }).eq("token", row.token);
    if (updated.error) throw new Error(`saving a candidate path failed: ${updated.error.message}`);
  }
  return sampled;
}
