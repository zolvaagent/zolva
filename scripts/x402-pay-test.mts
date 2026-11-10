/**
 * Premium API (x402) end to end check, owner only. Pays for scan calls with real USDG:
 *
 *   npm run x402:pay -- [base url] [--count=N]      (default https://zolvaagent.app, 1 call)
 *
 * Uses a test payer key from .dev.vars (X402_TEST_PAYER_KEY; created on the first run and
 * never printed). Fund that address with USDG first (price × count); it needs no ETH, since
 * the relayer pays the gas. Each call: 402, sign, pay, print the result. Calls run one after
 * another and the run stops at the first failure, so a problem never repeats N times.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { authorizationTypedData, type PaymentRequirements } from "../lib/x402/protocol.ts";

const MAX_COUNT = 100;
const PAUSE_MS = 1000;

const DEV_VARS = new URL("../.dev.vars", import.meta.url);
const text = readFileSync(DEV_VARS, "utf8");
let key = text.match(/^X402_TEST_PAYER_KEY=(0x[0-9a-f]{64})\s*$/m)?.[1] as `0x${string}` | undefined;
if (!key) {
  key = generatePrivateKey();
  writeFileSync(DEV_VARS, `${text.trimEnd()}\nX402_TEST_PAYER_KEY=${key}\n`);
}
const payer = privateKeyToAccount(key);

const args = process.argv.slice(2);
const countArg = args.find((arg) => arg.startsWith("--count="));
const count = countArg ? Number(countArg.slice("--count=".length)) : 1;
if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
  console.error(`--count must be a whole number from 1 to ${MAX_COUNT}`);
  process.exit(1);
}
const base = (args.find((arg) => !arg.startsWith("--")) ?? "https://zolvaagent.app").replace(/\/$/, "");
const url = `${base}/api/x402/v1/scan`;

/** One paid call. Returns the settlement transaction hash. */
async function payOnce(): Promise<string> {
  const first = await fetch(url);
  if (first.status !== 402) throw new Error(`Expected 402, got ${first.status}: ${(await first.text()).slice(0, 200)}`);
  const { accepts } = (await first.json()) as { accepts: PaymentRequirements[] };
  const requirements = accepts[0];

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
  console.log(`  scan at ${scan.asOf}: ${scan.markets.length} markets, deepest ${scan.markets[0]?.symbol} (z ${scan.markets[0]?.zscore48h})`);
  return settlement.transaction;
}

async function main() {
  console.log(`test payer: ${payer.address}`);
  const probe = await fetch(url);
  if (probe.status === 402) {
    const price = Number(((await probe.json()) as { accepts: PaymentRequirements[] }).accepts[0].maxAmountRequired) / 1e6;
    console.log(`price: ${price} USDG per call, ${count} call(s), ${(price * count).toFixed(2)} USDG in total`);
  }

  let settled = 0;
  for (let i = 1; i <= count; i++) {
    try {
      const tx = await payOnce();
      settled++;
      console.log(`[${i}/${count}] settled: ${tx}`);
    } catch (cause) {
      console.error(`[${i}/${count}] stopped: ${cause instanceof Error ? cause.message : cause}`);
      break;
    }
    if (i < count) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
  console.log(`done: ${settled} of ${count} settled`);
  if (settled < count) process.exit(1);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
