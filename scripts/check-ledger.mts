/**
 * Read-only check of the order ledger (lib/agents/ledger.ts) on every agent with trades: the
 * ledger's cash must equal the recorded cash, and on spot each market's quantity must equal the
 * recorded position. Prints one line per agent. Run: node scripts/check-ledger.mts
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { buildLedger, type FundingHour, type LedgerSide } from "../lib/agents/ledger.ts";

function readDevVars(): Record<string, string> {
  const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
}

const vars = readDevVars();
const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (((data ?? []) as T[]).length < 1000) return rows;
  }
}

const { data: agents, error } = await db.from("agents").select("id, name, mode, params, token_addresses, start_capital, cash");
if (error) throw new Error(error.message);

let failures = 0;
for (const agent of agents ?? []) {
  const trades = await all<{ ts: string; token_address: string; side: LedgerSide; quantity: number; price: number; cost_usd: number; reason: string; executions: { gas_cost_usd: number | null } | null }>((from, to) =>
    db.from("trades").select("ts, token_address, side, quantity, price, cost_usd, reason, executions(gas_cost_usd)").eq("agent_id", agent.id).order("ts").order("id").range(from, to),
  );
  if (!trades.length) continue;
  const runs = await all<{ ts: string; cash: number }>((from, to) => db.from("agent_runs").select("ts, cash").eq("agent_id", agent.id).order("ts").range(from, to));
  const { data: positions } = await db.from("positions").select("token_address, quantity, avg_entry_price, side, margin").eq("agent_id", agent.id);
  const prices: Record<string, number> = {};
  for (const address of agent.token_addresses as string[]) {
    const { data: candle } = await db.from("candles").select("close").eq("token_address", address).order("ts", { ascending: false }).limit(1).maybeSingle();
    if (candle) prices[address] = Number(candle.close);
  }
  const perps = agent.params?.venue === "perps";
  let funding: Record<string, FundingHour[]> | undefined;
  if (perps) {
    funding = {};
    const rows = await all<{ token_address: string; ts: string; close: number; funding_rate: number | null }>((from, to) =>
      db.from("candles").select("token_address, ts, close, funding_rate").in("token_address", agent.token_addresses).gte("ts", trades[0].ts).order("ts").range(from, to),
    );
    for (const row of rows) (funding[row.token_address] ??= []).push({ ts: Date.parse(row.ts) / 1000, close: Number(row.close), rate: Number(row.funding_rate ?? 0) });
  }
  const ledger = buildLedger({
    startCapital: Number(agent.start_capital),
    trades: trades.map((trade) => ({ ts: Date.parse(trade.ts) / 1000, token: trade.token_address, symbol: trade.token_address.slice(0, 8), side: trade.side, quantity: Number(trade.quantity), price: Number(trade.price), costUsd: Number(trade.cost_usd), reason: trade.reason, txHash: null, ...(agent.mode === "live" ? { gasUsd: Number(trade.executions?.gas_cost_usd ?? 0) } : {}) })),
    runs: runs.map((run) => ({ ts: Date.parse(run.ts) / 1000, cash: Number(run.cash) })),
    cash: Number(agent.cash),
    positions: (positions ?? []).map((position) => ({ token: position.token_address, quantity: Number(position.quantity), entryPrice: Number(position.avg_entry_price), side: position.side === "short" ? "short" : "long", margin: position.margin == null ? null : Number(position.margin) })),
    prices,
    ...(funding ? { funding } : {}),
    leverage: Number(agent.params?.leverage ?? 1),
  });
  const t = ledger.totals;
  const ok = t.balances && !t.quantityMismatches.length;
  if (!ok) failures++;
  console.log(
    `${ok ? "OK  " : "DIFF"} ${agent.mode.padEnd(5)} ${(perps ? "perps" : "spot").padEnd(5)} ${String(trades.length).padStart(3)} trades  cash ${t.ledgerCash.toFixed(4)} vs ${t.recordedCash.toFixed(4)}  realised ${t.realisedPnl.toFixed(2)} unrealised ${t.unrealisedPnl.toFixed(2)}${t.funding !== null ? ` funding ${t.funding.toFixed(2)}` : ""}${t.quantityMismatches.length ? ` qty diff ${t.quantityMismatches.length}` : ""}  ${agent.name}`,
  );
}
console.log(failures ? `${failures} agent(s) differ` : "every ledger balances");
