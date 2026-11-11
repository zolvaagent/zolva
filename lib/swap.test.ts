import { decodeFunctionData, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { ERC20_APPROVE_ABI, EXACT_INPUT_SINGLE_ABI } from "./live/contracts";
import { approveCall, EXACT_INPUT_ABI, feePair, isAddressQuery, isDirect, minimumOut, pickPool, referenceRate, SWAP_ROUTER_02, swapCall, swapPath, swapRate, USDG, type SwapToken } from "./swap";

describe("isAddressQuery", () => {
  it("accepts a full address, with spaces around it, in any case", () => {
    expect(isAddressQuery("0x8e04549484d0612be8373a0263b11928a5f7681f")).toBe(true);
    expect(isAddressQuery("  0x8E04549484D0612BE8373A0263B11928A5F7681F ")).toBe(true);
  });
  it("rejects names, short or long hex, and a pool id", () => {
    expect(isAddressQuery("ZOLVA")).toBe(false);
    expect(isAddressQuery("0x8e0454")).toBe(false);
    expect(isAddressQuery(`0x${"a".repeat(64)}`)).toBe(false);
  });
});

describe("pickPool", () => {
  const pool = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Hex;
  it("takes the pool with the most liquidity", () => {
    expect(pickPool([{ pool: pool(1), fee: 500, liquidity: 10n }, { pool: pool(2), fee: 3000, liquidity: 900n }, { pool: pool(3), fee: 10000, liquidity: 50n }])).toEqual({ pool: pool(2), fee: 3000 });
  });
  it("skips empty pools and returns null when none has liquidity", () => {
    expect(pickPool([{ pool: pool(1), fee: 100, liquidity: 0n }, { pool: pool(2), fee: 500, liquidity: 7n }])).toEqual({ pool: pool(2), fee: 500 });
    expect(pickPool([{ pool: pool(1), fee: 100, liquidity: 0n }])).toBeNull();
    expect(pickPool([])).toBeNull();
  });
});

const usdg: SwapToken = { address: USDG, symbol: "USDG", name: "Global Dollar", decimals: 6, pool: null, lastClose: 1 };
const eth: SwapToken = { address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", symbol: "ETH", name: "Ether", decimals: 18, pool: "0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca", lastClose: 2200 };
const nvda: SwapToken = { address: "0x00000000000000000000000000000000000000c1", symbol: "NVDA", name: "NVIDIA", decimals: 18, pool: "0x00000000000000000000000000000000000000c2", lastClose: 200 };
const me = "0x00000000000000000000000000000000000000aa" as Hex;

describe("minimumOut", () => {
  it("takes the slippage off the quote, rounding down", () => {
    expect(minimumOut(1_000_000n, 100)).toBe(990_000n);
    expect(minimumOut(999n, 50)).toBe(994n);
  });
});

describe("swapRate and referenceRate", () => {
  it("reads units out per unit in, either way and between two markets", () => {
    // 22 USDG in, 0.01 ETH out: 0.000454... ETH per USDG.
    expect(swapRate(usdg, eth, 22_000_000n, 10n ** 16n)).toBeCloseTo(0.01 / 22, 10);
    // 0.01 ETH in, 21.9 USDG out.
    expect(swapRate(eth, usdg, 10n ** 16n, 21_900_000n)).toBeCloseTo(2190, 6);
    // 1 ETH in, 11 NVDA out.
    expect(swapRate(eth, nvda, 10n ** 18n, 11n * 10n ** 18n)).toBeCloseTo(11, 6);
  });

  it("implies the rate from the hourly closes, USDG counted at 1", () => {
    expect(referenceRate(eth, nvda)).toBeCloseTo(11, 6);
    expect(referenceRate(usdg, eth)).toBeCloseTo(1 / 2200, 10);
    expect(referenceRate({ ...eth, lastClose: null }, nvda)).toBeNull();
  });
});

describe("routes", () => {
  it("goes direct when a side is USDG, through USDG otherwise", () => {
    expect(isDirect(usdg, eth)).toBe(true);
    expect(isDirect(eth, usdg)).toBe(true);
    expect(isDirect(eth, nvda)).toBe(false);
  });

  it("packs a two hop path: token, fee, USDG, fee, token", () => {
    const path = swapPath(eth.address, nvda.address, [100, 3000]);
    expect(path).toBe(`${eth.address}000064${USDG.slice(2)}000bb8${nvda.address.slice(2)}`);
  });
});

describe("approveCall and swapCall", () => {
  it("approves exactly the amount for SwapRouter02", () => {
    const decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: approveCall(5_000_000n) });
    expect([decoded.args[0].toLowerCase(), decoded.args[1]]).toEqual([SWAP_ROUTER_02, 5_000_000n]);
  });

  it("uses exactInputSingle for one hop, paid to the signer, with the minimum out", () => {
    const decoded = decodeFunctionData({ abi: EXACT_INPUT_SINGLE_ABI, data: swapCall({ tokenIn: USDG, tokenOut: eth.address, fees: [100], recipient: me, amountIn: 22_000_000n, minOut: 9n * 10n ** 15n }) });
    const params = decoded.args[0];
    expect([params.tokenIn, params.tokenOut, params.recipient].map((address) => address.toLowerCase())).toEqual([USDG, eth.address, me]);
    expect(params).toMatchObject({ fee: 100, amountIn: 22_000_000n, amountOutMinimum: 9n * 10n ** 15n, sqrtPriceLimitX96: 0n });
  });

  it("uses exactInput with the USDG path for two hops", () => {
    const decoded = decodeFunctionData({ abi: EXACT_INPUT_ABI, data: swapCall({ tokenIn: eth.address, tokenOut: nvda.address, fees: [100, 3000], recipient: me, amountIn: 10n ** 18n, minOut: 10n * 10n ** 18n }) });
    const params = decoded.args[0];
    expect(params.path).toBe(swapPath(eth.address, nvda.address, [100, 3000]));
    expect(params.recipient.toLowerCase()).toBe(me);
    expect(params).toMatchObject({ amountIn: 10n ** 18n, amountOutMinimum: 10n * 10n ** 18n });
  });
});

describe("feePair", () => {
  const btc: SwapToken = { ...eth, address: "0x00000000000000000000000000000000000000b1", symbol: "BTC", assetClass: "crypto" };
  const cryptoEth: SwapToken = { ...eth, assetClass: "crypto" };
  const stock: SwapToken = { ...nvda, assetClass: "stock" };
  const zolva: SwapToken = { address: "0x8e04549484d0612be8373a0263b11928a5f7681f", symbol: "ZOLVA", name: "Zolva Agent", decimals: 18, pool: null, lastClose: null, verified: true };
  const imported: SwapToken = { ...nvda, listed: false, assetClass: undefined };
  it("charges between USDG, crypto markets and ZOLVA", () => {
    expect(feePair(usdg, cryptoEth)).toBe(true);
    expect(feePair(cryptoEth, btc)).toBe(true);
    expect(feePair(usdg, zolva)).toBe(true);
    expect(feePair(zolva, cryptoEth)).toBe(true);
  });
  it("never charges stock or imported tokens", () => {
    expect(feePair(usdg, stock)).toBe(false);
    expect(feePair(stock, cryptoEth)).toBe(false);
    expect(feePair(usdg, imported)).toBe(false);
  });
});
