/**
 * Creates Zolva's house agents and Zolva Lab research agents (lib/agents/house.ts)
 * if they do not exist yet. Re-runnable: agents are matched by owner and name
 * and never duplicated.
 *
 *   npm run seed:house
 *
 * Each starts at the newest stored hour, like a user's agent, so its record
 * is live paper trading from launch onward (never a backtest).
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { HOUSE_AGENTS, HOUSE_WALLET, LAB_AGENTS } from "../lib/agents/house.ts";

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  const { data: tokens, error } = await db.from("tokens").select("address, symbol");
  if (error) throw new Error(error.message);
  const addressOf = new Map(tokens.map((token) => [token.symbol, token.address]));

  const { data: latestRow } = await db.from("candles").select("ts").order("ts", { ascending: false }).limit(1).single();
  if (!latestRow) throw new Error("No candles yet: run the backfill first.");
  const latestTs = latestRow.ts;

  const configs = [...HOUSE_AGENTS.map((config) => ({ ...config, owner: HOUSE_WALLET })), ...LAB_AGENTS];
  const owners = [...new Set(configs.map((config) => config.owner))];
  const { error: walletError } = await db
    .from("wallets")
    .upsert(owners.map((address) => ({ address, terms_accepted_at: new Date().toISOString() })), { onConflict: "address" });
  if (walletError) throw new Error(walletError.message);
  const { data: existing } = await db.from("agents").select("owner, name").in("owner", owners);
  const have = new Set((existing ?? []).map((agent) => `${agent.owner}/${agent.name}`));

  for (const config of configs) {
    if (have.has(`${config.owner}/${config.name}`)) {
      console.log(`exists   ${config.name}`);
      continue;
    }
    const addresses = config.symbols.map((symbol) => addressOf.get(symbol)!);
    const startPrices: Record<string, number> = {};
    for (const address of addresses) {
      const { data: candle } = await db.from("candles").select("close").eq("token_address", address).lte("ts", latestTs).order("ts", { ascending: false }).limit(1).single();
      startPrices[address] = Number(candle!.close);
    }
    const { error: insertError } = await db.from("agents").insert({
      published_at: new Date().toISOString(),
      owner: config.owner,
      name: config.name,
      strategy: config.strategy,
      params: { max_position_pct: config.maxPositionPct, stop_loss_pct: config.stopLossPct, start_prices: startPrices, ...(config.rules ? { rules: config.rules } : {}) },
      token_addresses: addresses,
      start_capital: 10_000,
      cash: 10_000,
      status: "active",
      mode: "paper",
      last_run_ts: latestTs,
    });
    if (insertError) throw new Error(`${config.name}: ${insertError.message}`);
    console.log(`created  ${config.name}`);
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
