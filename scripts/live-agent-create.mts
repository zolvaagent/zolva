/**
 * Creates a live (real money) agent for an allowlisted wallet (owner only,
 * until the "Trade with real money" UI exists).
 *
 *   npm run live:agent -- <wallet> <capital usd> <momentum|mean_reversion> <SYMBOL> [SYMBOL...] [--max=50] [--stop=10]
 *
 * --max is the largest share of the agent per token, --stop the stop loss, both in percent.
 *
 * Adds the wallet to live_wallets (with its Privy wallet and PRIVY_LIVE_POLICY_ID
 * from .dev.vars) if it is not there yet, then inserts the agent with mode
 * 'live'. The database refuses wallets off the allowlist and capital above
 * the cap (live_agent_guard). The agent starts private and only trades once
 * live_settings.enabled is switched on.
 */
import { readFileSync } from "node:fs";

import { PrivyClient } from "@privy-io/node";
import { createClient } from "@supabase/supabase-js";

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: number) => Number(args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
  const maxPositionPct = flag("max", 50);
  const stopLossPct = flag("stop", 10);
  const [walletArg, capitalArg, strategy, ...symbols] = args.filter((arg) => !arg.startsWith("--"));
  const wallet = (walletArg ?? "").toLowerCase();
  const capital = Number(capitalArg);
  if (!/^0x[0-9a-f]{40}$/.test(wallet) || !(capital >= 1) || !["momentum", "mean_reversion"].includes(strategy) || !symbols.length || symbols.length > 3 || !(maxPositionPct > 0 && maxPositionPct <= 100) || !(stopLossPct > 0 && stopLossPct <= 100)) {
    throw new Error("Usage: npm run live:agent -- <wallet> <capital usd> <momentum|mean_reversion> <SYMBOL> [SYMBOL...] [--max=50] [--stop=10]  (1 to 3 symbols)");
  }
  const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const privy = new PrivyClient({ appId: vars.PRIVY_APP_ID, appSecret: vars.PRIVY_APP_SECRET });

  const { data: tokens, error } = await db.from("tokens").select("address, symbol, pool_kind").in("symbol", symbols.map((symbol) => symbol.toUpperCase()));
  if (error) throw new Error(error.message);
  const missing = symbols.filter((symbol) => !tokens.some((token) => token.symbol === symbol.toUpperCase()));
  if (missing.length) throw new Error(`Unknown symbols: ${missing.join(", ")}`);
  const v4 = tokens.filter((token) => token.pool_kind !== "v3");
  if (v4.length) throw new Error(`Live trading supports v3 markets only; not: ${v4.map((token) => token.symbol).join(", ")}`);

  const { data: listed } = await db.from("live_wallets").select("address").eq("address", wallet).maybeSingle();
  if (!listed) {
    const found = (await privy.wallets().list({ address: wallet, chain_type: "ethereum" })).data?.[0];
    if (!found) throw new Error(`${wallet} is not a Privy embedded wallet of this app`);
    if (!vars.PRIVY_LIVE_POLICY_ID) throw new Error("Run npm run live:setup first");
    const { error: listError } = await db.from("live_wallets").insert({ address: wallet, privy_wallet_id: found.id, policy_id: vars.PRIVY_LIVE_POLICY_ID, note: "added by live:agent" });
    if (listError) throw new Error(listError.message);
    console.log(`allowlisted ${wallet} (Privy wallet ${found.id})`);
  }

  const { data: latest } = await db.from("candles").select("ts").order("ts", { ascending: false }).limit(1).single();
  const startPrices: Record<string, number> = {};
  for (const token of tokens) {
    const { data: candle } = await db.from("candles").select("close").eq("token_address", token.address).order("ts", { ascending: false }).limit(1).single();
    startPrices[token.address] = Number(candle!.close);
  }
  const { data: agent, error: insertError } = await db
    .from("agents")
    .insert({
      owner: wallet,
      name: `Live ${tokens.map((token) => token.symbol).join(" ")}`.slice(0, 40),
      strategy,
      params: { max_position_pct: maxPositionPct, stop_loss_pct: stopLossPct, start_prices: startPrices },
      token_addresses: tokens.map((token) => token.address),
      start_capital: capital,
      cash: capital,
      status: "active",
      mode: "live",
      trading_wallet: wallet,
      last_run_ts: latest!.ts,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);
  console.log(`live agent ${agent.id}: ${strategy}, $${capital}, ${tokens.map((token) => token.symbol).join(" ")}, max ${maxPositionPct}% per token, stop ${stopLossPct}%. Trades once live_settings.enabled is on.`);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
