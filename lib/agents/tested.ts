/**
 * "Tested" vs "Experiment" on the leaderboard (Research's rule, 2026-11-16, grok-research-items.md):
 * an agent is Tested only when its rules, sizing, stop, max position, venue and single market exactly
 * match a rule that passed Research's pre-registered 6 year test (positive in at least 4 of 6 years,
 * worst drop under 30%) at that venue's cost. Everything else is an Experiment. Only Research changes
 * this list, after a new pass. Pure, so it is unit tested.
 */
import type { Rules } from "../engine/rules.ts";

import { canonicalJson } from "./canonical-json.ts";
import { VOL_TREND_1200, VOL_TREND_1200_LS } from "./house.ts";

type TestedRule = { venue: "spot" | "perps"; rules: Rules; markets: string[] };

const SIZING = { kind: "volTarget", targetPct: 20, hours: 720 } as const;
const STOP_LOSS_PCT = 15;
const MAX_POSITION_PCT = 100;

export const TESTED_RULES: TestedRule[] = [
  // Spot (0.5% a fill): Vol Trend long, one market, BTC or ETH.
  { venue: "spot", rules: VOL_TREND_1200, markets: ["BTC", "ETH"] },
  // Perps paper (0.05% a fill plus funding): Vol Trend long and long + short with the funding filter.
  { venue: "perps", rules: VOL_TREND_1200, markets: ["SOL-PERP", "XRP-PERP", "NEAR-PERP", "ZEC-PERP", "BTC-PERP", "ETH-PERP"] },
  { venue: "perps", rules: VOL_TREND_1200_LS, markets: ["SOL-PERP", "XRP-PERP", "NEAR-PERP", "ZEC-PERP", "BTC-PERP", "ETH-PERP"] },
];

export type TestedInput = {
  strategy: string;
  venue: "spot" | "perps";
  symbols: string[];
  params: { rules?: unknown; sizing?: unknown; stop_loss_pct?: unknown; max_position_pct?: unknown };
};

export function isTested(agent: TestedInput): boolean {
  if (agent.strategy !== "custom" || agent.symbols.length !== 1) return false;
  const { params } = agent;
  if (Number(params.stop_loss_pct) !== STOP_LOSS_PCT || Number(params.max_position_pct) !== MAX_POSITION_PCT) return false;
  if (canonicalJson(params.sizing) !== canonicalJson(SIZING)) return false;
  const rules = canonicalJson(params.rules);
  return TESTED_RULES.some((tested) => tested.venue === agent.venue && tested.markets.includes(agent.symbols[0]) && canonicalJson(tested.rules) === rules);
}

/** Research's minimum track record before an agent is ranked or shows risk numbers. */
export const MIN_RANKED_DAYS = 30;
export const MIN_RANKED_RUNS = 720;

/**
 * Whether an agent's record is long enough to be ranked: 30 days and 720 hourly runs, measured from its
 * own record so it never depends on the clock. Unix seconds.
 */
export function isRankedRecord(agent: { runs: number; createdAt: number; lastTs: number | null }): boolean {
  return agent.runs >= MIN_RANKED_RUNS && ((agent.lastTs ?? agent.createdAt) - agent.createdAt) / 86400 >= MIN_RANKED_DAYS;
}
