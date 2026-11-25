/**
 * Creates the real-money twin of "Lab · Vol Trend Portfolio 2x" on a Lighter sub-account (owner 2026-11-25:
 * "Ya, bangun pakai Lighter"). Run only at go-live, with the owner's yes (docs/perps-live-runbook.md):
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/create-live-portfolio.mts \
 *     --owner 0xOWNER_LOGIN_WALLET --account <lighter sub-account index> --capital <usd> [--write]
 *
 * Without --write it only prints what it would create. The live agent copies the paper twin's frozen params
 * (rules, sizing, stop, portfolio leverage 2x, the same 6 markets by address), so Research can compare live,
 * paper twin and replay. It is created PAUSED: the owner resumes it from its page after the dry run.
 * The owner is the owner's own login wallet, so they can pause it, close everything and see it in the app.
 * The database checks: perps live needs a Lighter account, a live portfolio is at most 2x, and the capital
 * must be within live_settings.max_agent_capital_usd.
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const PAPER_TWIN = "Lab · Vol Trend Portfolio 2x";
const LIVE_NAME = "Vol Trend Portfolio 2x (live)";

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  const owner = (arg("owner") ?? "").toLowerCase();
  const account = Number(arg("account"));
  const capital = Number(arg("capital"));
  const write = process.argv.includes("--write");
  if (!/^0x[0-9a-f]{40}$/.test(owner)) throw new Error("--owner must be the owner's login wallet address");
  if (!Number.isSafeInteger(account) || account < 0) throw new Error("--account must be the Lighter sub-account index");
  if (!(capital >= 100)) throw new Error("--capital must be at least 100 (Lighter refuses orders under $10)");
  if (owner === "0x235c3ccea156dfbbc31ee37c07a7292c4506f628") throw new Error("0x235c is the agent-only wallet, not an owner");

  const { data: twin, error } = await db.from("agents").select("id, strategy, params, token_addresses").eq("name", PAPER_TWIN).eq("mode", "paper").single();
  if (error || !twin) throw new Error(`paper twin "${PAPER_TWIN}" not found`);
  if (!twin.params?.portfolio || Number(twin.params.portfolio.leverage) !== 2) throw new Error("the paper twin is not a 2x portfolio");
  const { data: latest } = await db.from("candles").select("ts").order("ts", { ascending: false }).limit(1).single();
  if (!latest) throw new Error("no candles");

  const row = {
    owner,
    name: LIVE_NAME,
    strategy: twin.strategy,
    params: { ...twin.params, twin_of: twin.id },
    token_addresses: twin.token_addresses,
    start_capital: capital,
    cash: capital,
    status: "paused",
    mode: "live",
    lighter_account_index: account,
    last_run_ts: latest.ts,
  };
  console.log(`${write ? "creating" : "would create"}: ${LIVE_NAME}, owner ${owner.slice(0, 6)}…${owner.slice(-4)}, Lighter account ${account}, $${capital}, ${twin.token_addresses.length} markets, paused`);
  if (!write) return;
  const { data: created, error: insertError } = await db.from("agents").insert(row).select("id").single();
  if (insertError) throw new Error(insertError.message);
  console.log(`created ${created.id}`);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
