/**
 * Works out what an agent does in the hours since it last ran. Pure (no
 * database), so the hourly runner and the tests share it. The runner then
 * writes each planned hour atomically with the `apply_agent_hour` function.
 */
import { COST_RATE, runHour, type AgentParams, type AgentState, type Decision, type Fill, type RunHourOptions } from "../engine/engine.ts";
import type { Rules } from "../engine/rules.ts";
import type { StrategyKey } from "../engine/strategies.ts";

const HOUR = 3600;
/** An agent that missed more hours than this only replays the most recent week. */
export const MAX_CATCH_UP_HOURS = 168;

export type AgentRow = {
  id: string;
  strategy: StrategyKey | "custom";
  params: {
    max_position_pct: number;
    stop_loss_pct: number;
    rules?: Rules;
    /** Close of each token at launch, for the buy and hold comparison. */
    start_prices: Record<string, number>;
  };
  token_addresses: string[];
  start_capital: number;
  cash: number;
  last_run_ts: string | null;
};

export type PositionRow = { token_address: string; quantity: number; avg_entry_price: number; opened_at: string | null };

export type MarketSeries = {
  /** Start of the hour at index 0, unix seconds. */
  startTs: number;
  closes: Record<string, (number | null)[]>;
};

export type HourWrite = {
  ts: string;
  cash: number;
  equity: number;
  holdEquity: number;
  decisions: Decision[];
  positions: { token_address: string; quantity: number; avg_entry_price: number; opened_at: string | null }[];
  trades: { token_address: string; side: Fill["side"]; quantity: number; price: number; cost_usd: number; reason: Fill["reason"] }[];
};

export function agentParams(agent: AgentRow): AgentParams {
  return {
    strategy: agent.strategy,
    rules: agent.params.rules,
    maxPositionPct: Number(agent.params.max_position_pct),
    stopLossPct: Number(agent.params.stop_loss_pct),
  };
}

/**
 * @param latestTs  start of the newest hour with prices (unix seconds)
 */
export function planAgentHours(
  agent: AgentRow,
  positions: PositionRow[],
  market: MarketSeries,
  latestTs: number,
  /** The AI co-pilot's vetoes for one hour (unix seconds), from the runner. */
  copilot?: { ts: number } & RunHourOptions,
): HourWrite[] {
  const lastRun = agent.last_run_ts ? Date.parse(agent.last_run_ts) / 1000 : null;
  let firstTs = lastRun === null ? latestTs : lastRun + HOUR;
  firstTs = Math.max(firstTs, latestTs - (MAX_CATCH_UP_HOURS - 1) * HOUR);
  if (firstTs > latestTs) return [];

  const series: Record<string, (number | null)[]> = {};
  for (const address of agent.token_addresses) series[address] = market.closes[address] ?? [];

  let state: AgentState = {
    cash: Number(agent.cash),
    positions: Object.fromEntries(
      positions.map((position) => [
        position.token_address,
        {
          quantity: Number(position.quantity),
          entryPrice: Number(position.avg_entry_price),
          openedAt: position.opened_at ? Date.parse(position.opened_at) / 1000 : undefined,
        },
      ]),
    ),
  };

  const params = agentParams(agent);
  const writes: HourWrite[] = [];
  for (let ts = firstTs; ts <= latestTs; ts += HOUR) {
    const index = (ts - market.startTs) / HOUR;
    if (index < 0) continue;
    const hour = runHour(state, params, series, index, ts, copilot && copilot.ts === ts ? { veto: copilot.veto } : {});
    state = hour.state;
    writes.push({
      ts: new Date(ts * 1000).toISOString(),
      cash: state.cash,
      equity: hour.equity,
      holdEquity: holdEquity(agent, series, index),
      decisions: hour.decisions,
      positions: Object.entries(state.positions).map(([address, position]) => ({
        token_address: address,
        quantity: position.quantity,
        avg_entry_price: position.entryPrice,
        opened_at: position.openedAt === undefined ? null : new Date(position.openedAt * 1000).toISOString(),
      })),
      trades: hour.fills.map((fill) => ({
        token_address: fill.token,
        side: fill.side,
        quantity: fill.quantity,
        price: fill.price,
        cost_usd: fill.costUsd,
        reason: fill.reason,
      })),
    });
  }
  return writes;
}

/** Equal-weight buy and hold of the agent's tokens since launch, paying the cost once. */
export function holdEquity(agent: AgentRow, series: Record<string, (number | null)[]>, index: number): number {
  const share = Number(agent.start_capital) / agent.token_addresses.length;
  let equity = 0;
  for (const address of agent.token_addresses) {
    const start = agent.params.start_prices?.[address];
    const now = series[address]?.[index];
    equity += start && now ? share * (1 - COST_RATE) * (now / start) : share;
  }
  return equity;
}
