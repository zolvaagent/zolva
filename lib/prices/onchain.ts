/**
 * Hourly closes read straight from the Uniswap pools on Robinhood Chain.
 *
 * Every token is priced from one stock/USDG pool (see the tokens table):
 * a v3 pool contract, or a v4 pool id inside the singleton PoolManager. The
 * close of an hour is the pool price at the last block before the hour ends,
 * so past hours can be read again later (the RPC keeps archive state).
 *
 * USDG is treated as exactly 1 USD, like GeckoTerminal's USD prices were.
 *
 * Kept free of Next.js and server-only imports so scripts can share it.
 */
import { createPublicClient, encodeAbiParameters, http, keccak256, parseAbi, type Hex, type PublicClient } from "viem";

/** Uniswap v4 PoolManager on Robinhood Chain (found 2026-10-15; holds every v4 pool's state). */
export const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
/** Standard Multicall3, deployed on Robinhood Chain. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const USDG_DECIMALS = 6;
/** Storage slot of `mapping(PoolId => Pool.State) pools` in the v4 PoolManager. */
const V4_POOLS_SLOT = 6n;
const SQRT_PRICE_MASK = (1n << 160n) - 1n;
const Q96 = 2 ** 96;

const V3_POOL_ABI = parseAbi(["function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)"]);
const POOL_MANAGER_ABI = parseAbi(["function extsload(bytes32 slot) view returns (bytes32)"]);

export type PricePool = {
  /** Stock token address (lowercase). */
  address: string;
  /** v3 pool address or v4 pool id. */
  pool: string;
  kind: "v3" | "v4";
  /** Whether the stock is token0 of the pool; USDG is the other side. */
  stockIsToken0: boolean;
  tokenDecimals: number;
};

export function createChainClient(rpcUrl: string): PublicClient {
  return createPublicClient({ transport: http(rpcUrl, { retryCount: 2, timeout: 20_000 }) });
}

/**
 * USD price of the stock from a pool's sqrtPriceX96, which encodes
 * sqrt(raw token1 / raw token0) as a Q64.96 number.
 */
export function priceFromSqrtPriceX96(sqrtPriceX96: bigint, stockIsToken0: boolean, stockDecimals: number, quoteDecimals: number = USDG_DECIMALS): number {
  const rawToken1PerToken0 = (Number(sqrtPriceX96) / Q96) ** 2;
  if (stockIsToken0) return rawToken1PerToken0 * 10 ** (stockDecimals - quoteDecimals);
  return 10 ** (stockDecimals - quoteDecimals) / rawToken1PerToken0;
}

/** Where a v4 pool's state starts: keccak256(abi.encode(poolId, 6)). Its first word is slot0. */
export function v4PoolStateSlot(poolId: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [poolId, V4_POOLS_SLOT]));
}

/** v4 slot0 packs sqrtPriceX96 into its lowest 160 bits (then tick and fees). */
export function sqrtPriceFromV4Slot0(word: Hex | bigint): bigint {
  return BigInt(word) & SQRT_PRICE_MASK;
}

type BlockReader = Pick<PublicClient, "getBlock">;

/**
 * The last block whose timestamp is before `timestamp` (unix seconds): its
 * end state is the market at that moment. Starts from a guess based on the
 * chain's recent block rate, then binary searches, about 15 RPC calls.
 */
export async function blockBefore(client: BlockReader, timestamp: number): Promise<bigint> {
  const latest = await client.getBlock();
  if (Number(latest.timestamp) < timestamp) return latest.number;

  const sampleSpan = latest.number > 100_000n ? 100_000n : latest.number;
  const sample = await client.getBlock({ blockNumber: latest.number - sampleSpan });
  const blocksPerSecond = Number(sampleSpan) / Math.max(1, Number(latest.timestamp - sample.timestamp));

  const timeOf = async (blockNumber: bigint) => Number((await client.getBlock({ blockNumber })).timestamp);
  const guess = latest.number - BigInt(Math.ceil((Number(latest.timestamp) - timestamp) * blocksPerSecond));

  // Bracket the answer: low is before the timestamp, high is at or after it.
  let step = BigInt(Math.max(64, Math.ceil(blocksPerSecond * 60)));
  let low = guess < 0n ? 0n : guess;
  let high = latest.number;
  if ((await timeOf(low)) >= timestamp) {
    high = low;
    for (;;) {
      low = high > step ? high - step : 0n;
      if (low === 0n || (await timeOf(low)) < timestamp) break;
      high = low;
      step *= 2n;
    }
  } else {
    for (;;) {
      const next = low + step < latest.number ? low + step : latest.number;
      if ((await timeOf(next)) >= timestamp) {
        high = next;
        break;
      }
      low = next;
      step *= 2n;
    }
  }

  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    if ((await timeOf(middle)) < timestamp) low = middle;
    else high = middle;
  }
  return low;
}

/**
 * USD price of every pool at one block, in a single multicall. Returns token
 * address to price; a pool that fails to read or gives a nonsense price is
 * left out rather than failing the rest.
 */
export async function readPrices(client: PublicClient, pools: PricePool[], blockNumber: bigint): Promise<Map<string, number>> {
  const results = await client.multicall({
    multicallAddress: MULTICALL3,
    blockNumber,
    allowFailure: true,
    contracts: pools.map((pool) =>
      pool.kind === "v3"
        ? { address: pool.pool as Hex, abi: V3_POOL_ABI, functionName: "slot0" as const }
        : { address: POOL_MANAGER as Hex, abi: POOL_MANAGER_ABI, functionName: "extsload" as const, args: [v4PoolStateSlot(pool.pool as Hex)] as const },
    ),
  });

  const prices = new Map<string, number>();
  results.forEach((result, index) => {
    if (result.status !== "success") return;
    const pool = pools[index];
    const sqrtPriceX96 = pool.kind === "v3" ? (result.result as readonly [bigint, ...unknown[]])[0] : sqrtPriceFromV4Slot0(result.result as Hex);
    // An empty or uninitialised pool reads as zero.
    if (sqrtPriceX96 === 0n) return;
    const price = priceFromSqrtPriceX96(sqrtPriceX96, pool.stockIsToken0, pool.tokenDecimals);
    if (Number.isFinite(price) && price > 0) prices.set(pool.address, price);
  });
  return prices;
}
