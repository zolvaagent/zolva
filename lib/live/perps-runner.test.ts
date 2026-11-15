import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Rules } from "../engine/rules";

vi.mock("server-only", () => ({}));
// Five hours of SOL-PERP closes (the rule needs 3 hours of look-back); the newest is above its 2 hour average, so a "price above sma" rule buys.
vi.mock("../data/market.ts", () => ({
  RUNNER_MARKET_HOURS: 5,
  getMarket: async () => ({
    startTs: 998 * 3600,
    hours: 5,
    tokens: [{ address: "lighter:3", symbol: "SOL-PERP", closes: [100, 100, 100, 100, 110], funding: [0, 0, 0, 0, 0], venue: "lighter" }],
  }),
}));

const { runLighterAgents } = await import("./perps-runner");

const BUY_ABOVE_AVERAGE: Rules = {
  entry: { join: "all", conditions: [{ left: { kind: "price" }, op: "above", right: { kind: "sma", hours: 2 } }] },
  exit: { join: "any", conditions: [{ left: { kind: "price" }, op: "below", right: { kind: "sma", hours: 2 } }] },
  takeProfitPct: null,
  maxHoldHours: null,
};
const AGENT = {
  id: "agent-1",
  owner: "0xlab",
  strategy: "custom",
  params: { venue: "perps", rules: BUY_ABOVE_AVERAGE, max_position_pct: 50, stop_loss_pct: 15, start_prices: { "lighter:3": 100 } },
  token_addresses: ["lighter:3"],
  start_capital: 50,
  cash: 50,
  last_run_ts: new Date(1_001 * 3600 * 1000).toISOString(),
  lighter_account_index: 77,
};

type Call = { table?: string; op: string; payload?: unknown; filters: string[]; rpc?: string; args?: unknown };

/** A tiny stand-in for the Supabase client: answers by table and records every write. */
function fakeDb(options: { enabled?: boolean; positions?: unknown[] } = {}) {
  const calls: Call[] = [];
  const answer = (call: Call): { data: unknown; error: null } => {
    if (call.table === "live_settings") return { data: { enabled: options.enabled ?? true, daily_volume_usd: 300, max_slippage_bps: 50 }, error: null };
    if (call.table === "agents" && call.op === "select") return { data: [AGENT], error: null };
    if (call.table === "tokens") return { data: [{ address: "lighter:3", symbol: "SOL-PERP", lighter_market_id: 3 }], error: null };
    if (call.table === "positions") return { data: options.positions ?? [], error: null };
    if (call.table === "executions" && call.op === "upsert") return { data: [{ id: "exec-1" }], error: null };
    return { data: [], error: null };
  };
  const query = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => (call.filters.push(`${column}=${value}`), builder),
      not: (column: string) => (call.filters.push(`${column} not null`), builder),
      in: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => (calls.push(call), Promise.resolve(answer(call))),
      upsert: (payload: unknown) => ((call.op = "upsert"), (call.payload = payload), builder),
      update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), builder),
      then: (resolve: (value: unknown) => void) => (calls.push(call), resolve(answer(call))),
    };
    return builder;
  };
  const db = {
    from: query,
    rpc: (name: string, args: unknown) => {
      calls.push({ op: "rpc", rpc: name, args, filters: [] });
      return Promise.resolve({ data: true, error: null });
    },
  };
  return { db: db as never, calls };
}

/** zolva-lighter, faked: a flat account until an order fills, then the filled position. */
function fakeLighter(position: { size: number; avgEntryPrice: number } | null = null) {
  const requests: { path: string; body?: Record<string, unknown> }[] = [];
  let current = position;
  const binding = {
    async fetch(input: Request | string, init?: RequestInit) {
      const url = new URL(String(input));
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ path: url.pathname, body });
      if (url.pathname === "/account") {
        return Response.json({ index: 77, collateral: 50, available: 50, totalValue: 50, positions: current ? [{ marketId: 3, symbol: "SOL", size: current.size, avgEntryPrice: current.avgEntryPrice, unrealizedPnl: 0, marginMode: 1 }] : [] });
      }
      if (url.pathname === "/order") {
        current = { size: (body!.side === "buy" ? 1 : -1) * Number(body!.base), avgEntryPrice: 110 };
        return Response.json({ status: "filled", filledBase: body!.base, plannedBase: body!.base, txHash: "ABCDEF0123456789abcdef0123456789abcdef01" });
      }
      return Response.json({ error: "not found" }, { status: 404 });
    },
  };
  return { binding, requests };
}

describe("perps live runner (Lighter)", () => {
  beforeEach(() => vi.useRealTimers());

  it("does nothing while live trading is off or zolva-lighter is not bound", async () => {
    const { binding, requests } = fakeLighter();
    expect(await runLighterAgents(fakeDb({ enabled: false }).db, binding, "t")).toMatchObject({ enabled: false, note: "live trading is switched off" });
    expect(await runLighterAgents(fakeDb().db, null, "t")).toMatchObject({ enabled: false, note: expect.stringMatching(/not bound/) });
    expect(await runLighterAgents(fakeDb().db, binding, null)).toMatchObject({ enabled: false });
    expect(requests).toEqual([]);
  });

  it("syncs from Lighter, decides, orders through zolva-lighter, records the fill and syncs again", async () => {
    const { db, calls } = fakeDb();
    const { binding, requests } = fakeLighter();
    const result = await runLighterAgents(db, binding, "t");
    expect(result).toMatchObject({ enabled: true, agents: 1, failed: [], paused: [] });
    expect(result.orders).toEqual([{ agentId: "agent-1", token: "SOL-PERP", side: "buy", status: "filled", detail: expect.any(String) }]);

    // Lighter first, the order, then Lighter again.
    expect(requests.map((r) => r.path)).toEqual(["/account", "/order", "/account"]);
    const order = requests[1].body!;
    expect(order).toMatchObject({ accountIndex: 77, marketId: 3, side: "buy", reduceOnly: false, maxSlippageBps: 50 });
    // 50% of $50 at $110, less the 0.05% perps cost: about 0.227 SOL.
    expect(Number(order.base)).toBeCloseTo((25 * (1 - 0.0005)) / 110, 6);

    const rpcs = calls.filter((c) => c.op === "rpc").map((c) => c.rpc);
    expect(rpcs).toEqual(["sync_lighter_agent", "apply_agent_hour", "apply_lighter_fill", "sync_lighter_agent"]);
    const fill = calls.find((c) => c.rpc === "apply_lighter_fill")!.args as Record<string, unknown>;
    expect(fill).toMatchObject({ p_execution_id: "exec-1", p_side: "buy", p_price: 110, p_lighter_tx_hash: "abcdef0123456789abcdef0123456789abcdef01" });
    const execution = calls.find((c) => c.table === "executions" && c.op === "upsert")!.payload as Record<string, unknown>;
    expect(execution).toMatchObject({ venue: "lighter", side: "buy", reduce_only: false, decided_ts: new Date(1_002 * 3600 * 1000).toISOString() });
    // The hour's value is Lighter's own account value.
    expect((calls.find((c) => c.rpc === "apply_agent_hour")!.args as Record<string, unknown>).p_equity).toBe(50);
  });

  it("pauses the agent instead of trading when Lighter shows a position Zolva did not record", async () => {
    const { db, calls } = fakeDb({ positions: [] });
    const { binding, requests } = fakeLighter({ size: -0.5, avgEntryPrice: 105 });
    const result = await runLighterAgents(db, binding, "t");
    expect(result.paused).toEqual([{ agentId: "agent-1", reason: expect.stringMatching(/SOL-PERP Zolva 0 vs Lighter -0.5/) }]);
    expect(requests.map((r) => r.path)).toEqual(["/account"]);
    expect(calls.some((c) => c.table === "agents" && c.op === "update" && (c.payload as { status: string }).status === "paused")).toBe(true);
    // Zolva's record still follows Lighter, so the owner sees the real state.
    expect(calls.filter((c) => c.op === "rpc").map((c) => c.rpc)).toEqual(["sync_lighter_agent"]);
  });

  it("skips an hour it already ran", async () => {
    const { db } = fakeDb();
    const { binding, requests } = fakeLighter();
    AGENT.last_run_ts = new Date(1_002 * 3600 * 1000).toISOString();
    try {
      expect((await runLighterAgents(db, binding, "t")).orders).toEqual([]);
      expect(requests).toEqual([]);
    } finally {
      AGENT.last_run_ts = new Date(1_001 * 3600 * 1000).toISOString();
    }
  });
});
