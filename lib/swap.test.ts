import { decodeFunctionData, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { ERC20_APPROVE_ABI, EXACT_INPUT_SINGLE_ABI } from "./live/contracts";
import { approveCall, EXACT_INPUT_ABI, isDirect, minimumOut, referenceRate, SWAP_ROUTER_02, swapCall, swapPath, swapRate, USDG, type SwapToken } from "./swap";

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
