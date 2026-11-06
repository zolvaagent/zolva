/**
 * Premium API (x402), owner only. Creates the relayer that settles payments:
 *
 *   npm run x402:setup -- <Zolva receiving address>
 *
 * 1. A Privy policy that only lets the relayer call USDG.transferWithAuthorization paying
 *    the receiving address, with no ETH attached, on Robinhood Chain (chain 4663).
 * 2. A Privy server wallet owned by Zolva's signer (PRIVY_SIGNER_ID, from live:setup) under
 *    that policy. It only pays gas; payments go straight from the payer to the receiving
 *    address, never through it.
 *
 * Saves X402_PAY_TO, X402_RELAYER_WALLET_ID and X402_RELAYER_ADDRESS in .dev.vars. Does not
 * set X402_ENABLED: send the relayer some ETH for gas first, then set X402_ENABLED=1.
 * Costs nothing; nothing is sent on chain.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { PrivyClient } from "@privy-io/node";

import { X402_ASSET, X402_CHAIN_ID } from "../lib/x402/protocol.ts";

const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const DEV_VARS = new URL("../.dev.vars", import.meta.url);
const vars = Object.fromEntries(
  readFileSync(DEV_VARS, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

/** Sets KEY=value in .dev.vars, replacing an existing line. */
function saveVar(key: string, value: string) {
  const current = readFileSync(DEV_VARS, "utf8");
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  writeFileSync(DEV_VARS, pattern.test(current) ? current.replace(pattern, line) : `${current.trimEnd()}\n${line}\n`);
}

async function main() {
  const payTo = (process.argv[2] ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(payTo)) throw new Error("Usage: npm run x402:setup -- <Zolva receiving address>");
  if (!vars.PRIVY_APP_ID || !vars.PRIVY_APP_SECRET) throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET must be set in .dev.vars");
  if (!vars.PRIVY_SIGNER_ID || !vars.PRIVY_AUTHORIZATION_KEY) throw new Error("Run npm run live:setup first: the relayer is owned by Zolva's signer");
  if (vars.X402_RELAYER_WALLET_ID) throw new Error(`A relayer exists already (${vars.X402_RELAYER_ADDRESS}). Remove X402_RELAYER_* from .dev.vars to make a new one.`);
  const privy = new PrivyClient({ appId: vars.PRIVY_APP_ID, appSecret: vars.PRIVY_APP_SECRET });

  const policy = await privy.policies().create({
    version: "1.0",
    chain_type: "ethereum",
    name: `Zolva x402 relayer to ${payTo.slice(0, 8)}`,
    // The SDK types each condition as a union; the rule objects follow it field for field.
    rules: [
      {
        name: "Settle USDG payments to Zolva",
        method: "eth_signTransaction",
        action: "ALLOW",
        conditions: [
          { field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: String(X402_CHAIN_ID) },
          { field_source: "ethereum_transaction", field: "to", operator: "eq", value: X402_ASSET },
          { field_source: "ethereum_transaction", field: "value", operator: "eq", value: "0" },
          { field_source: "ethereum_calldata", field: "transferWithAuthorization.to", abi: TRANSFER_WITH_AUTHORIZATION_ABI, operator: "eq", value: payTo },
        ],
      },
    ] as never,
  });
  console.log(`policy created: ${policy.id}`);

  const wallet = await privy.wallets().create({ chain_type: "ethereum", owner_id: vars.PRIVY_SIGNER_ID, policy_ids: [policy.id], display_name: "Zolva x402 relayer" });
  saveVar("X402_PAY_TO", payTo);
  saveVar("X402_RELAYER_WALLET_ID", wallet.id);
  saveVar("X402_RELAYER_ADDRESS", wallet.address.toLowerCase());
  console.log(`relayer created: ${wallet.address} (Privy wallet ${wallet.id}), saved to .dev.vars`);
  console.log("Next: send it about $5 of ETH on Robinhood Chain for gas, then set X402_ENABLED=1.");
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
