/**
 * Premium API (x402), owner only. Opens or closes the relayer's private key export:
 *
 *   npm run x402:export-rule -- allow     adds an ALLOW rule for exportPrivateKey
 *   npm run x402:export-rule -- lock      removes every export rule again
 *
 * The relayer's Privy policy only allows settling USDG payments, so Privy refuses an
 * export until this rule exists. Use: allow, npm run x402:export-relayer, lock. Leave it
 * locked otherwise: while the rule exists, anyone with Zolva's signer key could take the key.
 * Changes only the policy; nothing is sent on chain.
 */
import { readFileSync } from "node:fs";

import { PrivyClient } from "@privy-io/node";

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

const RULE_NAME = "Temporary: export the private key";

async function main() {
  const mode = process.argv[2];
  if (mode !== "allow" && mode !== "lock") throw new Error("Usage: npm run x402:export-rule -- allow | lock");
  if (!vars.PRIVY_APP_ID || !vars.PRIVY_APP_SECRET || !vars.X402_RELAYER_WALLET_ID) throw new Error("PRIVY_APP_ID, PRIVY_APP_SECRET and X402_RELAYER_WALLET_ID must be set in .dev.vars");
  const privy = new PrivyClient({ appId: vars.PRIVY_APP_ID, appSecret: vars.PRIVY_APP_SECRET });

  const wallet = await privy.wallets().get(vars.X402_RELAYER_WALLET_ID);
  const policyId = wallet.policy_ids?.[0];
  if (!policyId) throw new Error("The relayer has no policy");
  const policy = await privy.policies().get(policyId);
  const exportRules = (policy.rules ?? []).filter((rule) => rule.method === "exportPrivateKey");

  if (mode === "allow") {
    if (exportRules.length) {
      console.log(`export is already allowed on policy ${policyId}`);
      return;
    }
    await privy.policies().createRule(policyId, { name: RULE_NAME, method: "exportPrivateKey", action: "ALLOW", conditions: [] } as never);
    console.log(`export allowed on policy ${policyId}. Run npm run x402:export-relayer, then npm run x402:export-rule -- lock`);
  } else {
    for (const rule of exportRules) await privy.policies().deleteRule(rule.id, { policy_id: policyId });
    const after = await privy.policies().get(policyId);
    const left = (after.rules ?? []).filter((rule) => rule.method === "exportPrivateKey").length;
    if (left) throw new Error(`${left} export rule(s) still on policy ${policyId}`);
    console.log(`export locked on policy ${policyId} (${exportRules.length} rule(s) removed, ${after.rules?.length ?? 0} rule(s) left)`);
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
