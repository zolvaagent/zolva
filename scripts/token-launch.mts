/**
 * ZOLVA launch switch, owner only. Checks the token on chain and on GeckoTerminal, writes its
 * settings into .dev.vars, fills the contract address into the launch tweet drafts and, with
 * --deploy, deploys and checks the live docs page:
 *
 *   npm run token:launch -- <contract address> [--trade-url=https://...] [--deploy]
 *   npm run token:launch -- <contract address> --check      (read only: checks, writes nothing)
 *
 * Run it again any time something changes (a new trade page, the pool after the Pons curve
 * graduates): it only replaces the ZOLVA_* lines. Nothing is sent on chain; it only reads.
 *
 * Writes: ZOLVA_TOKEN_ADDRESS, ZOLVA_TOKEN_DECIMALS, ZOLVA_POOL_ADDRESS (top pool on
 * GeckoTerminal, if listed yet) and ZOLVA_TRADE_URL (if given). A copy of the old .dev.vars is
 * kept as .dev.vars.bak.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

import { createPublicClient, erc20Abi, getAddress, http, isAddress } from "viem";

const DEV_VARS = new URL("../.dev.vars", import.meta.url);
const TWEETS = new URL("../docs/x/tweets.md", import.meta.url);
const SITE = "https://zolvaagent.app";
const GECKO = "https://api.geckoterminal.com/api/v2/networks/robinhood";
const EXPECTED_SYMBOL = "ZOLVA";
// The placeholder contract address in the launch tweet drafts.
const CA_PLACEHOLDER = "0x0000000000000000000000000000000000000000";

const args = process.argv.slice(2);
const caArg = args.find((arg) => !arg.startsWith("--"));
const tradeUrl = args.find((arg) => arg.startsWith("--trade-url="))?.slice("--trade-url=".length) ?? null;
const deploy = args.includes("--deploy");
const checkOnly = args.includes("--check");

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

/** Sets (or adds) KEY=value lines in a .dev.vars text, keeping every other line as it was. */
function setVars(text: string, values: Record<string, string>): string {
  let out = text.trimEnd();
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    out = pattern.test(out) ? out.replace(pattern, line) : `${out}\n${line}`;
  }
  return `${out}\n`;
}

async function gecko<T>(path: string): Promise<T | null> {
  const response = await fetch(`${GECKO}${path}`, { headers: { accept: "application/json" } }).catch(() => null);
  return response?.ok ? ((await response.json()) as T) : null;
}

async function main() {
  if (!caArg || !isAddress(caArg)) fail("Give the ZOLVA contract address: npm run token:launch -- 0x... [--trade-url=https://...] [--deploy]");
  if (tradeUrl && !/^https:\/\//.test(tradeUrl)) fail("--trade-url must start with https://");
  const address = getAddress(caArg).toLowerCase() as `0x${string}`;

  const vars = readFileSync(DEV_VARS, "utf8");
  const rpc = vars.match(/^ROBINHOOD_RPC_URL=(.+)$/m)?.[1]?.trim();
  if (!rpc) fail("ROBINHOOD_RPC_URL is missing from .dev.vars");

  // 1. The contract on chain.
  console.log(`Checking ${address} on Robinhood Chain…`);
  const chain = createPublicClient({ transport: http(rpc) });
  const code = await chain.getCode({ address });
  if (!code || code === "0x") fail("No contract at that address on Robinhood Chain. Check the address and the chain.");
  const [name, symbol, decimals, supply] = await Promise.all([
    chain.readContract({ address, abi: erc20Abi, functionName: "name" }),
    chain.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
    chain.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    chain.readContract({ address, abi: erc20Abi, functionName: "totalSupply" }),
  ]).catch(() => fail("That contract does not answer like an ERC-20 token (name, symbol, decimals, totalSupply)."));
  console.log(`  ${name} (${symbol}), ${decimals} decimals, supply ${(Number(supply) / 10 ** decimals).toLocaleString("en-US")}`);
  if (symbol.toUpperCase() !== EXPECTED_SYMBOL) {
    console.warn(`  ! The symbol is ${symbol}, not ${EXPECTED_SYMBOL}. Make sure this is the right token before deploying.`);
  }

  // 2. Price and pool on GeckoTerminal (the hourly price for tiers and top-ups comes from here).
  console.log("Checking GeckoTerminal…");
  const tokenInfo = await gecko<{ data?: { attributes?: { price_usd?: string | null } } }>(`/tokens/${address}`);
  const price = Number(tokenInfo?.data?.attributes?.price_usd);
  const pools = await gecko<{ data?: { attributes: { address: string; reserve_in_usd: string | null }; relationships: { dex: { data: { id: string } } } }[] }>(`/tokens/${address}/pools`);
  const top = pools?.data?.[0];
  if (Number.isFinite(price) && price > 0) console.log(`  price $${price}`);
  else console.warn("  ! No price on GeckoTerminal yet. Holder tiers and ZOLVA top-ups wait for the first hourly price; run this again later to add the pool.");
  if (top) console.log(`  top pool ${top.attributes.address} on ${top.relationships.dex.data.id} ($${Number(top.attributes.reserve_in_usd ?? 0).toFixed(0)} liquidity)`);

  if (checkOnly) {
    console.log("\nCheck only: nothing written.");
    return;
  }

  // 3. .dev.vars (deploy:prod copies these into the Worker).
  const values: Record<string, string> = { ZOLVA_TOKEN_ADDRESS: address, ZOLVA_TOKEN_DECIMALS: String(decimals) };
  if (top) values.ZOLVA_POOL_ADDRESS = top.attributes.address.toLowerCase();
  if (tradeUrl) values.ZOLVA_TRADE_URL = tradeUrl;
  copyFileSync(DEV_VARS, new URL("../.dev.vars.bak", import.meta.url));
  writeFileSync(DEV_VARS, setVars(vars, values));
  console.log(`Wrote ${Object.keys(values).join(", ")} to .dev.vars (old copy in .dev.vars.bak)`);

  // 4. Launch tweet drafts.
  const tweets = readFileSync(TWEETS, "utf8");
  if (tweets.includes(CA_PLACEHOLDER)) {
    writeFileSync(TWEETS, tweets.replaceAll(CA_PLACEHOLDER, getAddress(address)));
    console.log("Filled the contract address into docs/x/tweets.md");
  }

  if (!deploy) {
    console.log("\nNot deployed. Run again with --deploy, or run npm run deploy:prod yourself.");
    return;
  }

  // 5. Deploy and check the live docs page shows the address.
  console.log("\nDeploying…");
  const result = spawnSync("npm", ["run", "deploy:prod"], { stdio: "inherit", shell: true });
  if (result.status !== 0) fail("deploy:prod failed; the token settings are in .dev.vars, so just run it again.");
  const page = await fetch(`${SITE}/docs/token`).then((response) => response.text()).catch(() => "");
  if (page.toLowerCase().includes(address)) console.log(`\n✓ Live: ${SITE}/docs/token shows ${address}`);
  else fail(`${SITE}/docs/token does not show the address yet. Open it in a minute; if it still does not, check the Worker secrets.`);
}

main().catch((cause) => fail(cause instanceof Error ? cause.message : String(cause)));
