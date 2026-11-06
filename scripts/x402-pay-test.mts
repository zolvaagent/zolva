/**
 * Premium API (x402) end to end check, owner only. Pays for one call with real USDG:
 *
 *   npm run x402:pay -- [base url]        (default https://zolvaagent.app)
 *
 * Uses a test payer key from .dev.vars (X402_TEST_PAYER_KEY; created on the first run and
 * never printed). Fund that address with a little USDG first, e.g. $0.10; it needs no ETH,
 * since the relayer pays the gas. Calls /api/x402/v1/scan: 402, sign, pay, print the result.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { authorizationTypedData, type PaymentRequirements } from "../lib/x402/protocol.ts";

const DEV_VARS = new URL("../.dev.vars", import.meta.url);
const text = readFileSync(DEV_VARS, "utf8");
let key = text.match(/^X402_TEST_PAYER_KEY=(0x[0-9a-f]{64})\s*$/m)?.[1] as `0x${string}` | undefined;
if (!key) {
  key = generatePrivateKey();
  writeFileSync(DEV_VARS, `${text.trimEnd()}\nX402_TEST_PAYER_KEY=${key}\n`);
}
const payer = privateKeyToAccount(key);
const base = (process.argv[2] ?? "https://zolvaagent.app").replace(/\/$/, "");
const url = `${base}/api/x402/v1/scan`;

async function main() {
  console.log(`test payer: ${payer.address}`);
  const first = await fetch(url);
  if (first.status !== 402) throw new Error(`Expected 402, got ${first.status}: ${(await first.text()).slice(0, 200)}`);
  const { accepts } = (await first.json()) as { accepts: PaymentRequirements[] };
  const requirements = accepts[0];
  console.log(`price: ${Number(requirements.maxAmountRequired) / 1e6} USDG to ${requirements.payTo}`);

  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: payer.address,
    to: requirements.payTo,
    value: requirements.maxAmountRequired,
    validAfter: String(now - 60),
    validBefore: String(now + requirements.maxTimeoutSeconds),
    nonce: `0x${randomBytes(32).toString("hex")}` as `0x${string}`,
  };
  const signature = await payer.signTypedData(authorizationTypedData(authorization));
  const header = Buffer.from(JSON.stringify({ x402Version: 1, scheme: "exact", network: requirements.network, payload: { signature, authorization } })).toString("base64");

  const paid = await fetch(url, { headers: { "X-PAYMENT": header } });
  const body = await paid.text();
  if (!paid.ok) throw new Error(`Paid call failed with ${paid.status}: ${body.slice(0, 300)}`);
  const settlement = JSON.parse(Buffer.from(paid.headers.get("x-payment-response") ?? "", "base64").toString());
  const scan = JSON.parse(body) as { asOf: string; markets: { symbol: string; zscore48h: number }[] };
  console.log(`settled: ${settlement.transaction}`);
  console.log(`scan at ${scan.asOf}: ${scan.markets.length} markets, deepest ${scan.markets[0]?.symbol} (z ${scan.markets[0]?.zscore48h})`);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
