/**
 * Real money spike, step 1a (owner only). Creates what Zolva needs to sign
 * for one Privy embedded wallet, and saves the IDs in .dev.vars:
 *
 *   npm run live:setup -- <embedded wallet address>
 *
 * 1. A P-256 authorization key and a Privy key quorum holding its public key
 *    (the "signer"). The private key is written to .dev.vars as
 *    PRIVY_AUTHORIZATION_KEY and never printed. Skipped if it already exists.
 * 2. A policy for that wallet (lib/live/contracts.ts): only USDG and the 14
 *    v3 markets, only SwapRouter02, only into the wallet itself, chain 4663.
 *    Saved as PRIVY_LIVE_POLICY_ID; a new run replaces it.
 *
 * Read only on chain; costs nothing. The owner then grants the signer on
 * /dev/live-signer (local only).
 */
import { readFileSync, writeFileSync } from "node:fs";

import { generateP256KeyPair, PrivyClient } from "@privy-io/node";
import { createClient } from "@supabase/supabase-js";

import { livePolicyRules, USDG } from "../lib/live/contracts.ts";

const DEV_VARS = new URL("../.dev.vars", import.meta.url);
const text = readFileSync(DEV_VARS, "utf8");
const vars = Object.fromEntries(
  text
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

/** Sets KEY=value in .dev.vars, replacing an existing line. */
function saveVar(key: string, value: string) {
  const current = readFileSync(DEV_VARS, "utf8");
  const line = `${key}=${value}`;
  const next = new RegExp(`^${key}=.*$`, "m").test(current) ? current.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${current.trimEnd()}\n${line}\n`;
  writeFileSync(DEV_VARS, next);
}

async function main() {
  const wallet = (process.argv[2] ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) throw new Error("Usage: npm run live:setup -- <embedded wallet address>");
  if (!vars.PRIVY_APP_ID || !vars.PRIVY_APP_SECRET) throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET must be set in .dev.vars");
  const privy = new PrivyClient({ appId: vars.PRIVY_APP_ID, appSecret: vars.PRIVY_APP_SECRET });

  // The wallet must be a Privy embedded wallet of this app.
  const page = await privy.wallets().list({ address: wallet, chain_type: "ethereum" });
  const found = page.data?.[0];
  if (!found) throw new Error(`No Privy embedded wallet with address ${wallet} in this app`);
  console.log(`wallet ${wallet} is Privy wallet ${found.id}`);

  if (vars.PRIVY_AUTHORIZATION_KEY && vars.PRIVY_SIGNER_ID) {
    console.log(`signer exists: ${vars.PRIVY_SIGNER_ID} (key kept in .dev.vars)`);
  } else {
    const keys = await generateP256KeyPair();
    const quorum = await privy.keyQuorums().create({ public_keys: [keys.publicKey], authorization_threshold: 1, display_name: "Zolva live agents" });
    saveVar("PRIVY_AUTHORIZATION_KEY", keys.privateKey);
    saveVar("PRIVY_SIGNER_ID", quorum.id);
    console.log(`signer created: ${quorum.id} (private key saved to .dev.vars, not printed)`);
  }

  // Tradable markets for the beta: tokens priced from a v3 pool (SwapRouter02 can route them).
  const supabaseUrl = vars.SUPABASE_URL;
  const db = createClient(supabaseUrl, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: tokens, error } = await db.from("tokens").select("address, symbol").eq("enabled", true).eq("pool_kind", "v3").order("symbol");
  if (error) throw new Error(error.message);
  const allowlist = [USDG, ...tokens.map((token) => token.address.toLowerCase())];
  console.log(`allowlist: USDG + ${tokens.map((token) => token.symbol).join(" ")}`);

  const policy = await privy.policies().create({
    version: "1.0",
    chain_type: "ethereum",
    name: `Zolva live ${wallet.slice(0, 8)}`,
    // The SDK types each condition as a union; the rule objects follow it field for field.
    rules: livePolicyRules(wallet, allowlist) as never,
  });
  saveVar("PRIVY_LIVE_POLICY_ID", policy.id);
  console.log(`policy created: ${policy.id} (${policy.rules?.length ?? 0} rules), saved as PRIVY_LIVE_POLICY_ID`);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
