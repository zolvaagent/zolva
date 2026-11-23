/**
 * Sets up Zolva's call-only trench agent (owner 2026-11-23): a Rushr agent that posts calls picked by
 * Curve Rider's checks and never buys. Its Privy wallet is owned by Zolva's key quorum, holds no
 * funds, signs Rushr's sign-in once, and then gets a policy that allows no transaction. The runner
 * never trades for it either (lib/trench/runner.ts paperAct), and the database refuses its trades.
 *
 * Without --confirm it only prints the plan and checks the handle on Rushr (read-only).
 * Needs migration 20261123000100_trench_call_only.sql. Safe to re-run: each step resumes.
 * The agent is left paused; activate it with the owner's OK:
 *   update trench_agents set status = 'active' where rushr_handle = '<handle>';
 *
 * Usage: npm run trench:call-only -- <handle> "<display name>" <owner wallet> [--confirm]
 */
import { readFileSync } from "node:fs";

import { PrivyClient } from "@privy-io/node";
import { createClient } from "@supabase/supabase-js";

import { encryptSecret } from "../lib/trench/crypto.ts";
import { callOnlyPolicyRules } from "../lib/trench/policy.ts";
import { PRESETS } from "../lib/trench/rules.ts";
import { handleAvailable, register, registerNonce, SIWE_PREFIX } from "../lib/trench/rushr-api.ts";

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

const BIO = "Zolva Lab: rule-based picks from the trenches, posted as calls. Run by @zolva_agent. Not advice.";

async function main() {
  const [handleArg, nameArg, ownerArg] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const confirm = process.argv.includes("--confirm");
  const handle = (handleArg ?? "").toLowerCase();
  const name = (nameArg ?? "").trim();
  const owner = (ownerArg ?? "").toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(handle) || !name || name.length > 40 || !/^0x[0-9a-f]{40}$/.test(owner)) {
    throw new Error('Usage: npm run trench:call-only -- <handle> "<display name>" <owner wallet> [--confirm]');
  }
  for (const key of ["PRIVY_APP_ID", "PRIVY_APP_SECRET", "PRIVY_SIGNER_ID", "PRIVY_AUTHORIZATION_KEY", "TRENCH_KEY_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!vars[key]) throw new Error(`${key} must be set in .dev.vars`);
  }
  const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const privy = new PrivyClient({ appId: vars.PRIVY_APP_ID, appSecret: vars.PRIVY_APP_SECRET });
  const signerId = vars.PRIVY_SIGNER_ID;
  const auth = { authorization_private_keys: [vars.PRIVY_AUTHORIZATION_KEY] };

  const probe = await db.from("trench_agents").select("call_only").limit(1);
  if (probe.error) throw new Error(`Apply migration 20261123000100_trench_call_only.sql first (${probe.error.message})`);

  let { data: agent } = await db.from("trench_agents").select("*").eq("call_only", true).eq("name", name).maybeSingle();
  if (!agent?.rushr_key_enc) {
    const availability = await handleAvailable(handle);
    console.log(`@${handle} on Rushr: ${availability.available ? "available" : `NOT available${availability.reason ? ` (${availability.reason})` : ""}`}`);
    if (!availability.available) return;
  }
  console.log(`Plan: agent "${name}" (@${handle}), owner ${owner}, Curve Rider checks, call-only.`);
  console.log("  1. agent row (paused until the owner activates it), 2. Privy wallet owned by Zolva's key quorum,");
  console.log("  3. Rushr sign-up signed by that wallet, 4. policy that allows no transaction.");
  if (!confirm) {
    console.log("Dry run. Add --confirm to do it.");
    return;
  }

  const save = async (values: Record<string, unknown>) => {
    const { data, error } = await db.from("trench_agents").update(values).eq("id", agent!.id).select("*").single();
    if (error) throw new Error(`saving the agent failed: ${error.message}`);
    agent = data;
  };

  // 1. The agent row. budget_usd only satisfies the column: the paper size is fixed in the runner.
  if (!agent) {
    const { data, error } = await db
      .from("trench_agents")
      .insert({ owner, name, preset: "almost_bonded", rules: PRESETS.almost_bonded, custom: false, budget_usd: 1, status: "setup", callouts: false, call_only: true, risk_accepted_at: new Date().toISOString() })
      .select("*")
      .single();
    if (error) throw new Error(`creating the agent failed: ${error.message}`);
    agent = data;
  }
  console.log(`agent ${agent!.id}`);

  // 2. The wallet, owned by Zolva's key quorum and never funded.
  if (!agent!.privy_wallet_id) {
    const wallet = await privy.wallets().create({ chain_type: "ethereum", owner_id: signerId, idempotency_key: `trench-call-only-${agent!.id}` });
    await save({ privy_wallet_id: wallet.id, wallet_address: wallet.address.toLowerCase() });
  }
  const walletId: string = agent!.privy_wallet_id;
  const address: string = agent!.wallet_address;
  console.log(`wallet ${address}`);

  // 3. Rushr sign-up: the wallet's one and only signature.
  if (!agent!.rushr_key_enc) {
    const message = await registerNonce(address);
    if (!message.startsWith(SIWE_PREFIX) || !message.toLowerCase().includes(address) || !message.includes("Chain ID: 4663")) throw new Error("Rushr sent an unexpected sign-in message");
    const signed = await privy.wallets().ethereum().signMessage(walletId, { message, authorization_context: auth });
    const result = await register({ message, signature: signed.signature, handle, displayName: name, bio: BIO });
    await save({ rushr_handle: result.handle, rushr_member_id: result.memberId, rushr_key_enc: await encryptSecret(result.key, vars.TRENCH_KEY_SECRET) });
  }
  console.log(`Rushr @${agent!.rushr_handle}`);

  // 4. The policy that allows nothing, checked on the wallet Privy returns.
  if (!agent!.policy_id) {
    const policy = await privy.policies().create({ version: "1.0", chain_type: "ethereum", name: `Zolva call-only ${agent!.id.slice(0, 8)}`, rules: callOnlyPolicyRules() as never });
    const updated = await privy.wallets().update(walletId, { policy_ids: [policy.id], authorization_context: auth });
    if (!(updated.policy_ids ?? []).includes(policy.id)) throw new Error("Privy did not attach the policy; the agent stays in setup");
    await save({ policy_id: policy.id, status: "paused", halted_reason: "Call-only agent: activate with the owner's OK." });
  }
  console.log(`policy ${agent!.policy_id}; status ${agent!.status}. Activate with the owner's OK (see the top of this file).`);
}

main().catch((cause: unknown) => {
  console.error((cause as Error).message);
  process.exit(1);
});
