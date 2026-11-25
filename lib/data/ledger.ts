import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildLedger, type FundingHour, type Ledger, type LedgerSide } from "@/lib/agents/ledger";
import type { AgentDetail } from "@/lib/data/agents";

import { allRows } from "./paged";

/**
 * The order ledger for one agent page (lib/agents/ledger.ts): every trade it recorded, the cash
 * after each hour it ran, and on perps each hour's close and funding since its first trade.
 * The page already holds the agent, its positions and the latest prices.
 */
export async function loadLedger(db: SupabaseClient, detail: AgentDetail, prices: Record<string, number>): Promise<Ledger> {
  const { agent } = detail;
  const symbolOf = new Map(detail.summary.tokens.map((token) => [token.address, token.symbol]));
  const [trades, runs] = await Promise.all([
    allRows<{ ts: string; token_address: string; side: LedgerSide; quantity: number; price: number; cost_usd: number; reason: string; executions: { tx_hash: string | null; gas_cost_usd: number | null } | null }>((from, to) =>
      db
        .from("trades")
        .select("ts, token_address, side, quantity, price, cost_usd, reason, executions(tx_hash, gas_cost_usd)")
        .eq("agent_id", agent.id)
        // Several orders in one hour keep the order they were recorded in.
        .order("ts")
        .order("id")
        .range(from, to),
    ),
    allRows<{ ts: string; cash: number }>((from, to) => db.from("agent_runs").select("ts, cash").eq("agent_id", agent.id).order("ts").range(from, to)),
  ]);

  const perps = agent.params.venue === "perps";
  let funding: Record<string, FundingHour[]> | undefined;
  if (perps) {
    funding = {};
    if (trades.length) {
      const rows = await allRows<{ token_address: string; ts: string; close: number; funding_rate: number | null }>((from, to) =>
        db
          .from("candles")
          .select("token_address, ts, close, funding_rate")
          .in("token_address", agent.token_addresses)
          .gte("ts", trades[0].ts)
          .order("ts")
          .range(from, to),
      );
      for (const row of rows) {
        (funding[row.token_address] ??= []).push({ ts: Date.parse(row.ts) / 1000, close: Number(row.close), rate: Number(row.funding_rate ?? 0) });
      }
    }
  }

  return buildLedger({
    startCapital: Number(agent.start_capital),
    trades: trades.map((trade) => ({
      ts: Date.parse(trade.ts) / 1000,
      token: trade.token_address,
      symbol: symbolOf.get(trade.token_address) ?? "?",
      side: trade.side,
      quantity: Number(trade.quantity),
      price: Number(trade.price),
      costUsd: Number(trade.cost_usd),
      reason: trade.reason,
      txHash: trade.executions?.tx_hash ?? null,
      // Live swaps move cash by the USDG swapped plus or minus gas (apply_live_fill).
      ...(agent.mode === "live" ? { gasUsd: Number(trade.executions?.gas_cost_usd ?? 0) } : {}),
    })),
    runs: runs.map((run) => ({ ts: Date.parse(run.ts) / 1000, cash: Number(run.cash) })),
    cash: Number(agent.cash),
    positions: detail.positions.map((position) => ({ token: position.token, quantity: position.quantity, entryPrice: position.entryPrice, side: position.side, margin: position.margin })),
    prices,
    ...(funding ? { funding } : {}),
    leverage: Number(agent.params.leverage ?? 1),
    portfolio: Boolean(agent.params.portfolio),
  });
}
