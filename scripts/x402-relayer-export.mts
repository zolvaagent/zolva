/**
 * Premium API (x402), owner only. Exports the relayer wallet's private key so the owner
 * can import it into a wallet app (Rabby: Import private key), for example to move
 * leftover ETH out:
 *
 *   npm run x402:export-relayer
 *
 * Signs the export with Zolva's signer key (PRIVY_AUTHORIZATION_KEY); Privy encrypts the
 * key to this script and the SDK decrypts it. The key is written to .dev.vars as
 * X402_RELAYER_PRIVATE_KEY and never printed. .dev.vars is gitignored and never deployed:
 * the Worker keeps signing through Privy and does not use this key.
 *
 * Note: outside Privy the relayer's policy no longer applies. Anyone with this key can
 * move everything in the wallet, so delete the line from .dev.vars when you are done.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { PrivyClient } from "@privy-io/node";

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
  if (!vars.PRIVY_APP_ID || !vars.PRIVY_APP_SECRET || !vars.PRIVY_AUTHORIZATION_KEY) throw new Error("PRIVY_APP_ID, PRIVY_APP_SECRET and PRIVY_AUTHORIZATION_KEY must be set in .dev.vars");
  if (!vars.X402_RELAYER_WALLET_ID) throw new Error("No relayer yet: run npm run x402:setup first");
  const privy = new PrivyClient({ appId: vars.PRIVY_APP_ID, appSecret: vars.PRIVY_APP_SECRET });

  const { private_key: privateKey } = await privy.wallets().exportPrivateKey(vars.X402_RELAYER_WALLET_ID, {
    authorization_context: { authorization_private_keys: [vars.PRIVY_AUTHORIZATION_KEY] },
  });
  const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Privy returned something that is not a private key; nothing was saved");

  saveVar("X402_RELAYER_PRIVATE_KEY", key);
  console.log(`relayer ${vars.X402_RELAYER_ADDRESS}: private key saved to .dev.vars as X402_RELAYER_PRIVATE_KEY (not printed).`);
  console.log("Import it in Rabby with Import private key, then delete that line from .dev.vars.");
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
