/**
 * Leaderboard timeframes: an agent's return, edge over holding and worst drop over its last 24 hours,
 * 7 days and 30 days, from the starting values agent_period_stats returns (lib/data/agents.ts).
 * Pure, so it is unit tested.
 */

export const AGENT_PERIODS = ["24h", "7d", "30d"] as const;
export type AgentPeriod = (typeof AGENT_PERIODS)[number];
export type PeriodStats = { returnPct: number; edge: number; maxDrawdownPct: number };

/** One row of agent_period_stats: the agent's value and holding value when the period began, and its worst drop since. */
export type PeriodRow = { agent_id: string; period: AgentPeriod; base_equity: number | null; base_hold_equity: number | null; max_drawdown: number | null };

/** The period's return and edge from its starting values to the agent's current value. */
export function periodsOf(summary: { equity: number; holdEquity: number }, rows: PeriodRow[] | undefined): Record<AgentPeriod, PeriodStats | null> {
  const out = { "24h": null, "7d": null, "30d": null } as Record<AgentPeriod, PeriodStats | null>;
  for (const row of rows ?? []) {
    const base = Number(row.base_equity);
    const baseHold = Number(row.base_hold_equity);
    if (!row.base_equity || !row.base_hold_equity || !(base > 0) || !(baseHold > 0)) continue;
    const returnPct = (summary.equity / base - 1) * 100;
    const holdPct = (summary.holdEquity / baseHold - 1) * 100;
    out[row.period] = { returnPct, edge: returnPct - holdPct, maxDrawdownPct: Number(row.max_drawdown ?? 0) * 100 };
  }
  return out;
}
