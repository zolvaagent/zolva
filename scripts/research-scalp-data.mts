/**
 * Research only (read-only on chain, never writes to the database): one price per minute
 * for ETH and BTC from their USDG pools on Robinhood Chain, for the scalping study
 * (docs/scalping-research.md). Reads the pool's slot0 at a historical block every ~60 s,
 * so it needs an archive RPC (our Alchemy URL).
 *
 *   DAYS=14 OUT=<file.json> node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/research-scalp-data.mts
 *
 * Capped at 30 days and 8 requests at a time. Output: { symbol: [[unixSeconds, price], ...] }.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { createPublicClient, erc20Abi, http, parseAbi, type Hex } from "viem";

const DAYS = Math.min(Number(process.env.DAYS ?? 14), 30);
const OUT = process.env.OUT ?? "scalp-minutes.json";
const CONCURRENCY = 8;
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const POOLS: [string, Hex][] = [
  ["ETH", "0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca"],
  ["BTC", "0x9664d869540e9d0a76f12c6623946c6d5d201e09"],
];
const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

const rpc = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").match(/^ROBINHOOD_RPC_URL=(.+)$/m)?.[1].trim().replace(/^"|"$/g, "");
if (!rpc) throw new Error("ROBINHOOD_RPC_URL is not set in .dev.vars");
const chain = createPublicClient({ transport: http(rpc, { retryCount: 3, timeout: 20_000 }) });

/** Runs `tasks` with at most CONCURRENCY in flight, keeping order. */
async function pooled<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < tasks.length) {
        const index = next++;
        results[index] = await tasks[index]();
      }
    }),
  );
  return results;
}

async function main() {
  const latest = await chain.getBlock();
  // Block time drifts, so map minutes to blocks with one checkpoint per day.
  const checkpoints = await pooled(
    Array.from({ length: DAYS + 1 }, (_, day) => async () => {
      const guess = latest.number - BigInt(Math.round((day * 86_400) / 0.105));
      const block = await chain.getBlock({ blockNumber: guess > 0n ? guess : 1n });
      return { number: Number(block.number), time: Number(block.timestamp) };
    }),
  );
  checkpoints.sort((a, b) => a.time - b.time);
  const blockAt = (time: number) => {
    const after = checkpoints.findIndex((point) => point.time >= time);
    const b = checkpoints[Math.max(1, after === -1 ? checkpoints.length - 1 : after)];
    const a = checkpoints[Math.max(0, (after === -1 ? checkpoints.length - 1 : after) - 1)];
    const rate = (b.number - a.number) / (b.time - a.time || 1);
    return BigInt(Math.round(a.number + (time - a.time) * rate));
  };

  const end = Number(latest.timestamp) - (Number(latest.timestamp) % 60);
  const minutes = Array.from({ length: DAYS * 1440 }, (_, i) => end - (DAYS * 1440 - 1 - i) * 60);
  const out: Record<string, [number, number][]> = {};

  for (const [symbol, pool] of POOLS) {
    const [token0, token1] = await Promise.all([chain.readContract({ address: pool, abi: POOL_ABI, functionName: "token0" }), chain.readContract({ address: pool, abi: POOL_ABI, functionName: "token1" })]);
    const usdgIs0 = token0.toLowerCase() === USDG;
    const other = usdgIs0 ? token1 : token0;
    const decimals = await chain.readContract({ address: other, abi: erc20Abi, functionName: "decimals" });
    const started = Date.now();
    const rows = await pooled(
      minutes.map((time) => async (): Promise<[number, number] | null> => {
        try {
          const [sqrtPriceX96] = await chain.readContract({ address: pool, abi: POOL_ABI, functionName: "slot0", blockNumber: blockAt(time) });
          // price of token1 in token0, raw units; turn into USDG per token.
          const raw = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
          const price = usdgIs0 ? (1 / raw) * 10 ** (decimals - 6) : raw * 10 ** (decimals - 6);
          return [time, price];
        } catch {
          return null;
        }
      }),
    );
    out[symbol] = rows.filter((row): row is [number, number] => row !== null);
    console.log(`${symbol}: ${out[symbol].length} of ${minutes.length} minutes in ${Math.round((Date.now() - started) / 1000)} s, last price ${out[symbol].at(-1)?.[1].toFixed(2)}`);
  }
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`saved ${OUT}`);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message.replace(/https?:\/\/\S+/g, "[url]") : cause);
  process.exit(1);
});
