/**
 * Adds AI credits to an account by hand, until self-serve top-up opens.
 *
 *   npm run credits:grant -- <wallet address> <usd> [note]
 *   npm run credits:grant -- 0xabc... 5 "paid 5 USDG, tx 0x..."
 *
 * Paid credits work with every model. Every grant is written to ai_ledger.
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const [address, amount, ...noteParts] = process.argv.slice(2);
const usd = Number(amount);
if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? "") || !Number.isFinite(usd) || usd <= 0 || usd > 1000) {
  console.error('Usage: npm run credits:grant -- <wallet address> <usd between 0 and 1000> ["note"]');
  process.exit(1);
}

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const owner = address.toLowerCase();

const { data: wallet } = await db.from("wallets").select("address").eq("address", owner).maybeSingle();
if (!wallet) {
  console.error(`No Zolva account for ${owner}. The person has to sign in once first.`);
  process.exit(1);
}

const { error } = await db.rpc("ai_grant", { p_owner: owner, p_bucket: "paid", p_amount_micro: Math.round(usd * 1_000_000), p_kind: "manual", p_note: noteParts.join(" ") || null });
if (error) {
  console.error(`Grant failed: ${error.message}`);
  process.exit(1);
}
const { data: credits } = await db.from("ai_credits").select("free_micro, paid_micro").eq("owner", owner).single();
console.log(`Granted $${usd.toFixed(2)} paid credits to ${owner}. Balance: free $${(Number(credits?.free_micro ?? 0) / 1e6).toFixed(4)}, paid $${(Number(credits?.paid_micro ?? 0) / 1e6).toFixed(4)}`);
