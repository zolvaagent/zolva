import { describe, expect, it } from "vitest";

import { blockBefore, checkAgainstFeeds, MAX_FEED_AGE_SECONDS, priceFromSqrtPriceX96, sqrtPriceFromV4Slot0, v4PoolStateSlot } from "./onchain";

/** sqrtPriceX96 for a raw token1/token0 ratio, the way a pool stores it. */
const sqrtPriceFor = (rawToken1PerToken0: number) => BigInt(Math.round(Math.sqrt(rawToken1PerToken0) * 2 ** 96));

describe("priceFromSqrtPriceX96", () => {
  it("prices a stock that is token0 (18 decimals) against USDG (6 decimals)", () => {
    // $727.31 a share: 1e18 raw stock buys 727.31e6 raw USDG.
    const sqrt = sqrtPriceFor((727.31 * 1e6) / 1e18);
    expect(priceFromSqrtPriceX96(sqrt, true, 18)).toBeCloseTo(727.31, 6);
  });

  it("prices a stock that is token1", () => {
    // Pool ratio is stock per USDG: 1e18 raw stock per 217.14e6 raw USDG.
    const sqrt = sqrtPriceFor(1e18 / (217.14 * 1e6));
    expect(priceFromSqrtPriceX96(sqrt, false, 18)).toBeCloseTo(217.14, 6);
  });

  it("keeps cheap tokens precise", () => {
    const sqrt = sqrtPriceFor((2.8709 * 1e6) / 1e18);
    expect(priceFromSqrtPriceX96(sqrt, true, 18)).toBeCloseTo(2.8709, 9);
  });
});

describe("priceFromSqrtPriceX96 for crypto", () => {
  it("prices cbBTC (8 decimals) that is token1 against USDG", () => {
    // $80,586.55 a coin: 1e8 raw cbBTC per 80,586.55e6 raw USDG.
    const sqrt = sqrtPriceFor(1e8 / (80586.55 * 1e6));
    expect(priceFromSqrtPriceX96(sqrt, false, 8)).toBeCloseTo(80586.55, 4);
  });
});

describe("checkAgainstFeeds", () => {
  const now = 1_800_000_000;
  const eth = "0xeth";
  const nvda = "0xnvda";

  it("keeps a pool close within 2% of its feed", () => {
    const check = checkAgainstFeeds(new Map([[eth, 2367.08]]), new Set([eth]), new Map([[eth, { price: 2370.08, updatedAt: now - 3600 }]]), now);
    expect(check.accepted.get(eth)).toBe(2367.08);
    expect(check.rejected).toEqual([]);
  });

  it("drops a pool close more than 2% away from its feed", () => {
    const check = checkAgainstFeeds(new Map([[eth, 2500]]), new Set([eth]), new Map([[eth, { price: 2370, updatedAt: now - 3600 }]]), now);
    expect(check.accepted.has(eth)).toBe(false);
    expect(check.rejected).toEqual([{ address: eth, pool: 2500, feed: 2370 }]);
  });

  it("keeps the pool close when the feed is stale or unreadable", () => {
    const stale = checkAgainstFeeds(new Map([[eth, 2500]]), new Set([eth]), new Map([[eth, { price: 2370, updatedAt: now - MAX_FEED_AGE_SECONDS - 1 }]]), now);
    expect(stale.accepted.get(eth)).toBe(2500);
    expect(stale.unchecked).toEqual([eth]);
    const missing = checkAgainstFeeds(new Map([[eth, 2500]]), new Set([eth]), new Map(), now);
    expect(missing.accepted.get(eth)).toBe(2500);
  });

  it("passes tokens without a feed straight through", () => {
    const check = checkAgainstFeeds(new Map([[nvda, 181.2]]), new Set(), new Map(), now);
    expect(check.accepted.get(nvda)).toBe(181.2);
    expect(check.unchecked).toEqual([]);
  });
});

describe("v4 pool state", () => {
  it("finds the META pool state at keccak256(poolId, 6)", () => {
    expect(v4PoolStateSlot("0x5875d407a42965b0e768c8925cea290e06fa50603ef34fc99eb92a1050e6ae36")).toBe("0xa7f52dd8bbda5a0229d20744d5c8fc3c33f42ef007735fb942ceebe04168e345");
  });

  it("reads sqrtPriceX96 from the low 160 bits of slot0, ignoring tick and fees", () => {
    const sqrt = 79228162514264337593543950336n; // price 1.0
    const tickAndFees = (123n << 160n) | (3000n << 208n);
    expect(sqrtPriceFromV4Slot0(sqrt | tickAndFees)).toBe(sqrt);
    expect(sqrtPriceFromV4Slot0(`0x${(sqrt | tickAndFees).toString(16).padStart(64, "0")}`)).toBe(sqrt);
  });
});

describe("blockBefore", () => {
  // A fake chain: several blocks share each second, like Arbitrum chains.
  const fakeChain = (latest: number, timeOf: (block: number) => number) => {
    let calls = 0;
    return {
      calls: () => calls,
      client: {
        getBlock: async (args?: { blockNumber?: bigint }) => {
          calls++;
          const number = args?.blockNumber ?? BigInt(latest);
          return { number, timestamp: BigInt(timeOf(Number(number))) };
        },
      } as unknown as Parameters<typeof blockBefore>[0],
    };
  };

  it("returns the last block before the timestamp", async () => {
    // 4 blocks a second, starting at t = 1,000,000.
    const timeOf = (block: number) => 1_000_000 + Math.floor(block / 4);
    const chain = fakeChain(20_000_000, timeOf);
    for (const target of [3_000_000, 5_000_123, 5_999_999]) {
      const block = Number(await blockBefore(chain.client, target));
      expect(timeOf(block)).toBeLessThan(target);
      expect(timeOf(block + 1)).toBeGreaterThanOrEqual(target);
    }
  });

  it("copes with an uneven block rate", async () => {
    // Fast blocks early on, slow later: the first guess is off and must be corrected.
    const timeOf = (block: number) => (block < 1_000_000 ? Math.floor(block / 10) : 100_000 + (block - 1_000_000) * 2);
    const chain = fakeChain(1_500_000, timeOf);
    const target = 50_000;
    const block = Number(await blockBefore(chain.client, target));
    expect(timeOf(block)).toBeLessThan(target);
    expect(timeOf(block + 1)).toBeGreaterThanOrEqual(target);
    expect(chain.calls()).toBeLessThan(80);
  });

  it("returns the latest block when the timestamp is in the future", async () => {
    const chain = fakeChain(500, (block) => block);
    expect(await blockBefore(chain.client, 10_000)).toBe(500n);
  });
});
