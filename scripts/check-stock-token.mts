/**
 * Checks a new Robinhood Stock Token before it goes on the allowlist, and finds its price pool.
 *
 *   npm run check:token -- 0x...address
 *
 * 1. On chain (ROBINHOOD_RPC_URL from .dev.vars): the same bytecode as the verified NVDA token,
 *    Robinhood's beacon, a "• Robinhood Token" name and 18 decimals (lib/tokens/official.ts).
 * 2. GeckoTerminal: its Uniswap v3 or v4 pools against USDG, deepest first.
 * 3. Prints the tokens row for a migration. It writes nothing.
 *
 * Passing is necessary, not enough: confirm the address from Robinhood's own announcement or asset
 * list too, since anyone can deploy a proxy to the same beacon. Never pick a token by its symbol.
 * Runs with plain Node 24 (built-in TypeScript type stripping, no build step).
 */
import { readFileSync } from "node:fs";

import { createChainClient } from "../lib/prices/onchain.ts";
import { officialTokenProblems, PRICEABLE_DEXES, REFERENCE_STOCK_TOKEN, stockIsToken0 } from "../lib/tokens/official.ts";

const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const ERC20 = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

function readDevVars(): Record<string, string> {
  const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
}

type GeckoPool = { attributes: { name: string; address: string; reserve_in_usd: string; pool_created_at: string }; relationships: { dex: { data: { id: string } }; quote_token: { data: { id: string } }; base_token: { data: { id: string } } } };

async function main() {
  const address = process.argv[2]?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) throw new Error("Usage: npm run check:token -- 0x<40 hex address>");
  const rpc = readDevVars().ROBINHOOD_RPC_URL;
  if (!rpc) throw new Error("ROBINHOOD_RPC_URL must be set in .dev.vars");
  const client = createChainClient(rpc);

  const [code, referenceCode] = await Promise.all([client.getCode({ address: address as `0x${string}` }), client.getCode({ address: REFERENCE_STOCK_TOKEN })]);
  const read = <T,>(functionName: "name" | "symbol" | "decimals", fallback: T) =>
    client.readContract({ address: address as `0x${string}`, abi: ERC20, functionName }).catch(() => fallback) as Promise<T>;
  const [name, symbol, decimals] = await Promise.all([read("name", ""), read("symbol", ""), read("decimals", 0)]);
  console.log(`${address}\n  name ${JSON.stringify(name)}, symbol ${JSON.stringify(symbol)}, decimals ${decimals}`);

  const problems = officialTokenProblems({ code: code ?? "0x", referenceCode: referenceCode ?? "", name, decimals: Number(decimals) });
  if (problems.length) {
    console.log("\nNOT an official Robinhood Stock Token:");
    for (const problem of problems) console.log(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log("  On chain: matches the official Stock Token proxy (bytecode, beacon, name, decimals).");

  const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${address}/pools`, { headers: { accept: "application/json" } });
  const pools = response.ok ? (((await response.json()) as { data: GeckoPool[] }).data ?? []) : [];
  const usable = pools
    .filter((pool) => PRICEABLE_DEXES[pool.relationships.dex.data.id] && [pool.relationships.quote_token.data.id, pool.relationships.base_token.data.id].includes(`robinhood_${USDG}`))
    .sort((a, b) => Number(b.attributes.reserve_in_usd) - Number(a.attributes.reserve_in_usd));
  if (!usable.length) {
    console.log(`\nNo Uniswap v3/v4 pool against USDG on GeckoTerminal yet (status ${response.status}, ${pools.length} pools of any kind). Run again once one exists.`);
    process.exitCode = 1;
    return;
  }
  console.log("\nUniswap pools against USDG, deepest first:");
  for (const pool of usable) {
    console.log(`  ${pool.attributes.name}  ${pool.attributes.address}  $${Math.round(Number(pool.attributes.reserve_in_usd)).toLocaleString("en-US")}  created ${pool.attributes.pool_created_at}`);
  }
  const best = usable[0];
  const kind = PRICEABLE_DEXES[best.relationships.dex.data.id];
  const short = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  console.log(`
Tokens row for a migration (confirm the address from Robinhood's announcement first):

insert into tokens (address, symbol, name, price_pool, pool_kind, stock_is_token0, token_decimals, verified_official, enabled, asset_class)
values ('${address}', '${short}', '${name.replace(/'/g, "''")}', '${best.attributes.address.toLowerCase()}', '${kind}', ${stockIsToken0(address, USDG)}, 18, true, true, 'stock');`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
