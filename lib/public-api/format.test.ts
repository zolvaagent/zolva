import { describe, expect, it } from "vitest";

import type { AgentDetail, AgentSummary } from "../data/agents";
import type { MarketDetail, MarketRow } from "../data/markets";

import { DECISION_HOURS, EQUITY_HOURS, isPublicAgent, publicAgent, publicAgentDetail, publicMarket, publicMarketDetail, publicTrade } from "./format";

const OWNER = "0x1111111111111111111111111111111111111111";
const WALLET = "0x2222222222222222222222222222222222222222";
const NOW = 1_793_700_000; // unix seconds, on the hour
const HOUR = 3600;

const summary: AgentSummary = {
  id: "ae0581f0-e99b-4d80-abf0-fd98fff11c78",
  owner: OWNER,
  isHouse: true,
  name: "Lab · Dip Hunter",
  strategy: "dip_hunter",
  status: "active",
  tokens: [
    { address: "0xaaa", symbol: "NVDA" },
    { address: "0xbbb", symbol: "ETH" },
  ],
  startCapital: 10_000,
  equity: 10_250.123,
  holdEquity: 9_800,
  returnPct: 2.50123,
  edge: 4.50123,
  maxDrawdownPct: 1.234,
  trades: 6,
  runs: 200,
  venue: "spot",
  shorts: false,
  createdAt: NOW - 200 * HOUR,
  lastTs: NOW - HOUR,
  published: true,
};

function detail(overrides: Partial<AgentDetail["agent"]> = {}): AgentDetail {
  // 10 days of hourly runs, oldest first like getAgentDetail returns them.
  const runs = Array.from({ length: 240 }, (_, i) => {
    const ts = NOW - (240 - i) * HOUR;
    return { ts, equity: 10_000 + i, holdEquity: 10_000 - i, cash: 5_000, decisions: [{ token: "0xaaa", action: "hold" as const, reasoning: `hour ${i}` }] };
  });
  return {
    agent: {
      id: summary.id,
      owner: OWNER,
      name: summary.name,
      strategy: "dip_hunter",
      params: { max_position_pct: 100, stop_loss_pct: 10 },
      token_addresses: ["0xaaa", "0xbbb"],
      start_capital: 10_000,
      cash: 5_000,
      last_run_ts: null,
      status: "active",
      created_at: new Date((NOW - 200 * HOUR) * 1000).toISOString(),
      ai_model: null,
      published_at: new Date(NOW * 1000).toISOString(),
      ai_limit_micro: 500_000,
      ai_limit_expires_at: null,
      mode: "paper",
      trading_wallet: WALLET,
      ...overrides,
    } as AgentDetail["agent"],
    aiSpentUsd: 0.42,
    aiLimitExpired: false,
    summary,
    runs,
    trades: [{ ts: NOW - 2 * HOUR, token: "0xaaa", symbol: "NVDA", side: "buy", quantity: 1.123456789, price: 201.5, costUsd: 1.0075, reason: "signal", txHash: "0xdeadbeef" }],
    orders: [{ decidedTs: NOW - HOUR, symbol: "NVDA", side: "buy", status: "failed", txHash: null, error: "approve: rpc" }],
    positions: [{ token: "0xaaa", symbol: "NVDA", quantity: 1.123456789, entryPrice: 201.5, openedAt: NOW - 2 * HOUR, side: "long" }],
  };
}

describe("publicAgent", () => {
  it("returns the public fields, rounded, and marks paper trading", () => {
    const agent = publicAgent(summary);
    expect(agent).toMatchObject({
      id: summary.id,
      strategy: "dip_hunter",
      strategyName: "Dip hunter",
      markets: ["NVDA", "ETH"],
      byZolva: true,
      paper: true,
      valueUsd: 10_250.12,
      returnPct: 2.5,
      vsHoldingPts: 4.5,
      holdingReturnPct: -2,
      maxDrawdownPct: 1.23,
      url: `https://zolvaagent.app/agents/${summary.id}`,
    });
    expect(agent).not.toHaveProperty("owner");
    expect(JSON.stringify(agent)).not.toContain(OWNER);
  });
});

describe("isPublicAgent", () => {
  it("allows only published paper agents", () => {
    expect(isPublicAgent(detail())).toBe(true);
    expect(isPublicAgent(detail({ published_at: null }))).toBe(false);
    expect(isPublicAgent(detail({ mode: "live" }))).toBe(false);
  });
});

describe("publicAgentDetail", () => {
  const body = publicAgentDetail(detail(), NOW);

  it("shares decision reasons for the last 24 hours only", () => {
    expect(body.decisionHours).toBe(DECISION_HOURS);
    expect(body.decisions).toHaveLength(DECISION_HOURS - 1);
    expect(body.decisions[0]).toEqual({ at: new Date((NOW - 23 * HOUR) * 1000).toISOString(), market: "NVDA", action: "hold", reasoning: "hour 217" });
  });

  it("returns 7 days of value vs holding, oldest first", () => {
    expect(body.equity).toHaveLength(EQUITY_HOURS - 1);
    expect(body.equity[0][0] < body.equity[body.equity.length - 1][0]).toBe(true);
    expect(body.equity[body.equity.length - 1]).toEqual([new Date((NOW - HOUR) * 1000).toISOString(), 10_239, 9_761]);
  });

  it("carries positions with their side and keeps preset rules out", () => {
    expect(body.positions).toEqual([{ market: "NVDA", side: "long", quantity: 1.12345679, entryPrice: 201.5, openedAt: new Date((NOW - 2 * HOUR) * 1000).toISOString() }]);
    expect(body.agent.settings).toEqual({ maxPositionPct: 100, stopLossPct: 10, rules: null, aiCoPilot: false });
    expect(body.agent.paper).toBe(true);
  });

  it("never exposes wallets, AI spend, orders or transaction hashes", () => {
    const text = JSON.stringify(body);
    for (const secret of [OWNER, WALLET, "0xdeadbeef", "aiSpent", "ai_limit", "approve: rpc", "orders"]) expect(text).not.toContain(secret);
  });
});

const row: MarketRow = {
  address: "0xaaa",
  symbol: "NVDA",
  name: "NVIDIA",
  assetClass: "stock",
  stats: { price: 201.123456789, change1h: 0.1234, change24h: -1.556, change7d: null, change30d: 4, high7d: 210, low7d: 190, hourlyMovePct: 0.4, week: [200, 201.1234567] },
  agents: 3,
  pool: "0xpool",
  poolKind: "v3",
  verifiedOfficial: true,
};

describe("publicMarket", () => {
  it("returns prices, changes and the sparkline", () => {
    expect(publicMarket(row)).toMatchObject({
      symbol: "NVDA",
      assetClass: "stock",
      priceUsd: 201.123457,
      change1hPct: 0.12,
      change24hPct: -1.56,
      change7dPct: null,
      spark7d: [200, 201.123457],
      activeAgents: 3,
      url: "https://zolvaagent.app/markets/NVDA",
    });
  });

  it("gives each hourly close its time", () => {
    const market: MarketDetail = { row, closes: [200, 201], startTs: NOW - 2 * HOUR, asOf: NOW, marketOpen: false, agents: [summary] };
    const body = publicMarketDetail(market);
    expect(body.closes).toEqual([
      [new Date((NOW - 2 * HOUR) * 1000).toISOString(), 200],
      [new Date((NOW - HOUR) * 1000).toISOString(), 201],
    ]);
    expect(body.agents[0].paper).toBe(true);
    expect(JSON.stringify(body)).not.toContain(OWNER);
  });
});

describe("publicTrade", () => {
  it("returns a feed entry with the agent and the reason", () => {
    const trade = publicTrade({ ts: NOW, agentId: summary.id, agentName: summary.name, isHouse: true, strategy: "dip_hunter", symbol: "ETH", side: "short", quantity: 0.5, price: 2300, costUsd: 5.75, reason: "signal", reasoning: "Spike." });
    expect(trade).toEqual({
      at: new Date(NOW * 1000).toISOString(),
      agentId: summary.id,
      agentName: summary.name,
      byZolva: true,
      strategy: "dip_hunter",
      market: "ETH",
      side: "short",
      quantity: 0.5,
      price: 2300,
      costUsd: 5.75,
      reason: "signal",
      reasoning: "Spike.",
    });
  });
});
