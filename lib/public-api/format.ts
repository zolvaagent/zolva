/**
 * Public API v1 response shapes (docs: /docs/public-api). Pure functions from the
 * app's data types to the JSON the API returns, so what goes public is decided here
 * and nowhere else: no owner wallets, no AI usage, no private or live agents, no
 * strategy prompts. Every agent result is paper trading and says so.
 */
import type { ActivityTrade } from "../activity";
import type { AgentDetail, AgentSummary } from "../data/agents";
import type { MarketDetail, MarketRow } from "../data/markets";
import { STRATEGY_NAMES } from "../format";

export const API_VERSION = "v1";
const SITE = "https://zolvaagent.app";

/** Hours of decision reasons the API shares; older reasons stay on the site only. */
export const DECISION_HOURS = 24;
/** Hours of equity history in an agent's detail. */
export const EQUITY_HOURS = 168;

export const DISCLAIMER = "Paper trading with virtual money. Past results do not predict future results. Not investment advice.";

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();
// Halves round away from zero, so a loss rounds like the same gain (-1.555 to -1.56).
const round = (value: number, digits = 4) => (Math.sign(value) * Math.round(Math.abs(value) * 10 ** digits)) / 10 ** digits;

export type PublicAgent = ReturnType<typeof publicAgent>;

export function publicAgent(agent: AgentSummary) {
  return {
    id: agent.id,
    name: agent.name,
    strategy: agent.strategy,
    strategyName: STRATEGY_NAMES[agent.strategy] ?? agent.strategy,
    markets: agent.tokens.map((token) => token.symbol),
    // spot: tokens on the DEX, long only; perps: Lighter perps (paper, no leverage).
    venue: agent.venue,
    shorts: agent.shorts,
    byZolva: agent.isHouse,
    status: agent.status,
    paper: true as const,
    startCapitalUsd: round(agent.startCapital, 2),
    valueUsd: round(agent.equity, 2),
    returnPct: round(agent.returnPct, 2),
    holdingReturnPct: round(agent.returnPct - agent.edge, 2),
    vsHoldingPts: round(agent.edge, 2),
    maxDrawdownPct: round(agent.maxDrawdownPct, 2),
    trades: agent.trades,
    hoursRun: agent.runs,
    createdAt: iso(agent.createdAt),
    lastRunAt: agent.lastTs === null ? null : iso(agent.lastTs),
    url: `${SITE}/agents/${agent.id}`,
  };
}

/** Only published paper agents are public; anything else is a 404. */
export function isPublicAgent(detail: AgentDetail): boolean {
  return detail.agent.mode === "paper" && detail.agent.published_at !== null;
}

export function publicAgentDetail(detail: AgentDetail, nowSeconds: number) {
  const { agent, summary } = detail;
  // runs come newest first; the API returns them oldest first.
  const runs = [...detail.runs].sort((a, b) => a.ts - b.ts);
  const equity = runs.filter((run) => run.ts > nowSeconds - EQUITY_HOURS * 3600);
  const symbolOf = new Map(summary.tokens.map((token) => [token.address, token.symbol]));
  const decisions = runs
    .filter((run) => run.ts > nowSeconds - DECISION_HOURS * 3600)
    .flatMap((run) =>
      run.decisions.map((decision) => ({
        at: iso(run.ts),
        market: symbolOf.get(decision.token) ?? decision.token,
        action: decision.action,
        reasoning: decision.reasoning,
      })),
    );
  return {
    agent: {
      ...publicAgent(summary),
      settings: {
        maxPositionPct: Number(agent.params.max_position_pct),
        stopLossPct: Number(agent.params.stop_loss_pct),
        // Custom agents' rules are their strategy; presets are described in the docs.
        rules: agent.strategy === "custom" ? (agent.params.rules ?? null) : null,
        aiCoPilot: agent.ai_model !== null,
      },
    },
    // [time, agent value USD, value of holding the same markets USD], hourly, oldest first.
    equity: equity.map((run) => [iso(run.ts), round(run.equity, 2), round(run.holdEquity, 2)] as const),
    positions: detail.positions.map((position) => ({
      market: position.symbol,
      side: position.side,
      quantity: round(position.quantity, 8),
      entryPrice: round(position.entryPrice, 6),
      openedAt: position.openedAt === null ? null : iso(position.openedAt),
    })),
    trades: detail.trades.map((trade) => ({
      at: iso(trade.ts),
      market: trade.symbol,
      side: trade.side,
      quantity: round(trade.quantity, 8),
      price: round(trade.price, 6),
      costUsd: round(trade.costUsd, 4),
      reason: trade.reason,
    })),
    decisions,
    decisionHours: DECISION_HOURS,
    disclaimer: DISCLAIMER,
  };
}

export function publicMarket(row: MarketRow) {
  const { stats } = row;
  return {
    symbol: row.symbol,
    name: row.name,
    address: row.address,
    assetClass: row.assetClass,
    // spot: a token priced from its USDG pool; perps: a Lighter perp (no token contract).
    venue: row.venue === "lighter" ? ("perps" as const) : ("spot" as const),
    priceUsd: round(stats.price, 6),
    change1hPct: stats.change1h === null ? null : round(stats.change1h, 2),
    change24hPct: stats.change24h === null ? null : round(stats.change24h, 2),
    change7dPct: stats.change7d === null ? null : round(stats.change7d, 2),
    change30dPct: stats.change30d === null ? null : round(stats.change30d, 2),
    high7dUsd: round(stats.high7d, 6),
    low7dUsd: round(stats.low7d, 6),
    // Hourly closes of the last 7 days, oldest first.
    spark7d: stats.week.map((close) => round(close, 6)),
    activeAgents: row.agents,
    pool: row.pool,
    poolKind: row.poolKind,
    // Perps only: funding as a yearly percent (positive: longs pay shorts), at the last hour and over 7 days.
    funding: row.funding
      ? {
          yearlyPct: row.funding.lastYearly === null ? null : round(row.funding.lastYearly * 100, 2),
          yearlyPct7dAvg: row.funding.weekYearly === null ? null : round(row.funding.weekYearly * 100, 2),
        }
      : null,
    url: `${SITE}/markets/${row.symbol}`,
  };
}

export function publicMarketDetail(detail: MarketDetail) {
  return {
    market: publicMarket(detail.row),
    // [hour start, close USD], hourly, oldest first, up to 30 days.
    closes: detail.closes.map((close, index) => [iso(detail.startTs + index * 3600), round(close, 6)] as const),
    asOf: iso(detail.asOf),
    usMarketOpen: detail.marketOpen,
    agents: detail.agents.map(publicAgent),
  };
}

export function publicTrade(trade: ActivityTrade) {
  return {
    at: iso(trade.ts),
    agentId: trade.agentId,
    agentName: trade.agentName,
    byZolva: trade.isHouse,
    strategy: trade.strategy,
    market: trade.symbol,
    side: trade.side,
    quantity: round(trade.quantity, 8),
    price: round(trade.price, 6),
    costUsd: round(trade.costUsd, 4),
    reason: trade.reason,
    reasoning: trade.reasoning,
  };
}
