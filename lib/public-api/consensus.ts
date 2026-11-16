/**
 * get_consensus (MCP) and GET /api/public/v1/consensus: per market, how many Tested published
 * agents (lib/agents/tested.ts) hold it long, short or not at all, and what they did in the newest
 * hour. Statistics about paper agents, not a trading signal: it is never fed back into runHour.
 * Owner's rule (2026-11-16): Tested agents of any age. Pure, so it is unit tested.
 */
import type { Decision } from "../engine/engine.ts";

/** Below this many agents a market's numbers are too few to say much; the answer says so. */
export const MIN_CONSENSUS_AGENTS = 3;

export type ConsensusAgent = {
  id: string;
  venue: "spot" | "perps";
  /** Market symbols the agent watches. */
  markets: string[];
  /** Days of hourly record (runs / 24). */
  recordDays: number;
  /** Open positions by market symbol. */
  positions: Record<string, "long" | "short">;
  /** The newest hour's action by market symbol, or null when the agent has no run in that hour. */
  lastHour: Record<string, Decision["action"]> | null;
};

export type ConsensusMarket = {
  market: string;
  venue: "spot" | "perps";
  /** How many Tested agents watch this market: everything below is out of this count. */
  agents: number;
  long: number;
  short: number;
  /** Watching the market with no position (in cash). */
  flat: number;
  /** What those agents did in the newest hour; agents without a run that hour are not counted here. */
  lastHour: { buy: number; sell: number; short: number; cover: number; hold: number };
  enoughAgents: boolean;
  agentIds: string[];
  /** Days of record of the youngest and oldest of these agents. */
  recordDays: { min: number; max: number };
};

export function buildConsensus(agents: ConsensusAgent[], options: { market?: string; venue?: "spot" | "perps" } = {}): ConsensusMarket[] {
  const wanted = options.market?.toUpperCase();
  const byMarket = new Map<string, ConsensusMarket>();
  for (const agent of agents) {
    if (options.venue && agent.venue !== options.venue) continue;
    for (const market of agent.markets) {
      if (wanted && market !== wanted) continue;
      const row =
        byMarket.get(market) ??
        ({ market, venue: agent.venue, agents: 0, long: 0, short: 0, flat: 0, lastHour: { buy: 0, sell: 0, short: 0, cover: 0, hold: 0 }, enoughAgents: false, agentIds: [], recordDays: { min: agent.recordDays, max: agent.recordDays } } satisfies ConsensusMarket);
      row.agents += 1;
      row.agentIds.push(agent.id);
      const side = agent.positions[market];
      if (side === "long") row.long += 1;
      else if (side === "short") row.short += 1;
      else row.flat += 1;
      const action = agent.lastHour?.[market];
      if (action) row.lastHour[action] += 1;
      row.recordDays.min = Math.min(row.recordDays.min, agent.recordDays);
      row.recordDays.max = Math.max(row.recordDays.max, agent.recordDays);
      byMarket.set(market, row);
    }
  }
  return [...byMarket.values()]
    .map((row) => ({ ...row, enoughAgents: row.agents >= MIN_CONSENSUS_AGENTS }))
    .sort((a, b) => b.agents - a.agents || a.market.localeCompare(b.market));
}

/** One plain sentence on how much the numbers can carry. */
export function consensusNote(markets: ConsensusMarket[], agentCount: number): string {
  const base = `Counts of Tested published paper agents (rules that passed Zolva's 6 year backtest), any record length; ${agentCount} agents in total.`;
  if (!markets.length) return `${base} No Tested agent watches this market.`;
  const thin = markets.filter((market) => !market.enoughAgents).length;
  return thin === markets.length
    ? `${base} Every market here has fewer than ${MIN_CONSENSUS_AGENTS} agents: too few to say much, and agents running the same rule tend to agree.`
    : `${base} ${thin} of ${markets.length} markets have fewer than ${MIN_CONSENSUS_AGENTS} agents (enoughAgents false): too few to say much.`;
}
