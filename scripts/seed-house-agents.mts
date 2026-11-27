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

import { rulesFingerprint } from "../lib/agents/fingerprint.ts";
import { HOUSE_AGENTS, HOUSE_WALLET, LAB_AGENTS } from "../lib/agents/house.ts";

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  const { data: tokens, error } = await db.from("tokens").select("address, symbol, verified_official, enabled");
  if (error) throw new Error(error.message);
  const addressOf = new Map(tokens.map((token) => [token.symbol, token.address]));

  const { data: latestRow } = await db.from("candles").select("ts").order("ts", { ascending: false }).limit(1).single();
  if (!latestRow) throw new Error("No candles yet: run the backfill first.");
  const latestTs = latestRow.ts;

  const configs: ((typeof LAB_AGENTS)[number] | ((typeof HOUSE_AGENTS)[number] & { owner: string }))[] = [...HOUSE_AGENTS.map((config) => ({ ...config, owner: HOUSE_WALLET })), ...LAB_AGENTS];
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
    // A new listing (an IPO): wait until it is on the allowlist with enough hourly closes.
    const missing = config.symbols.filter((symbol) => !addressOf.has(symbol));
    if (missing.length) {
      console.log(`waiting  ${config.name}: ${missing.join(", ")} not on the allowlist yet`);
      continue;
    }
    const addresses = config.symbols.map((symbol) => addressOf.get(symbol)!);
    if (config.waitForHours) {
      // New listings only ever by the verified official address (same-name clones exist at launch).
      const unverified = tokens.filter((token) => addresses.includes(token.address) && (!token.verified_official || !token.enabled));
      if (unverified.length) {
        console.log(`waiting  ${config.name}: ${unverified.map((token) => token.symbol).join(", ")} is not verified and enabled`);
        continue;
      }
      const { count } = await db.from("candles").select("ts", { count: "exact", head: true }).in("token_address", addresses).lte("ts", latestTs);
      if ((count ?? 0) < config.waitForHours * addresses.length) {
        console.log(`waiting  ${config.name}: ${count ?? 0} of ${config.waitForHours} hourly closes`);
        continue;
      }
    }
    const startPrices: Record<string, number> = {};
    for (const address of addresses) {
      const { data: candle } = await db.from("candles").select("close").eq("token_address", address).lte("ts", latestTs).order("ts", { ascending: false }).limit(1).single();
      startPrices[address] = Number(candle!.close);
    }
    const row = {
      published_at: new Date().toISOString(),
      owner: config.owner,
      name: config.name,
      strategy: config.strategy,
      params: {
        max_position_pct: config.maxPositionPct,
        stop_loss_pct: config.stopLossPct,
        start_prices: startPrices,
        ...(config.rules ? { rules: config.rules } : {}),
        ...(config.venue ? { venue: config.venue } : {}),
        ...("leverage" in config && config.leverage ? { leverage: config.leverage } : {}),
        ...("sizing" in config && config.sizing ? { sizing: config.sizing } : {}),
        ...("portfolio" in config && config.portfolio ? { portfolio: config.portfolio } : {}),
        // DCA: the first buy is the agent's first run, the hour after the newest close.
        ...("dca" in config && config.dca ? { dca: { ...config.dca, startTs: Date.parse(latestTs) / 1000 + 3600 } } : {}),
      },
      token_addresses: addresses,
      start_capital: 10_000,
      cash: 10_000,
      ...(config.aiModel
        ? { ai_model: config.aiModel, ai_limit_micro: Math.round((config.aiLimitUsd ?? 1) * 1_000_000), ai_limit_expires_at: config.aiUntil ?? null }
        : {}),
      status: "active",
      mode: "paper",
      last_run_ts: latestTs,
    };
    const { error: insertError } = await db.from("agents").insert({ ...row, rules_hash: rulesFingerprint(row as unknown as Parameters<typeof rulesFingerprint>[0]) });
    if (insertError) throw new Error(`${config.name}: ${insertError.message}`);
    console.log(`created  ${config.name}`);
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
