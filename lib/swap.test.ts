import { decodeFunctionData, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { ERC20_APPROVE_ABI, EXACT_INPUT_SINGLE_ABI } from "./live/contracts";
import { approveCall, minimumOut, SWAP_ROUTER_02, swapCall, swapPrice, USDG, type SwapToken } from "./swap";

const usdg: SwapToken = { address: USDG, symbol: "USDG", name: "Global Dollar", decimals: 6, pool: null, lastClose: 1 };
const eth: SwapToken = { address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", symbol: "ETH", name: "Ether", decimals: 18, pool: "0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca", lastClose: 2200 };
const me = "0x00000000000000000000000000000000000000aa" as Hex;

describe("minimumOut", () => {
  it("takes the slippage off the quote, rounding down", () => {
    expect(minimumOut(1_000_000n, 100)).toBe(990_000n);
    expect(minimumOut(999n, 50)).toBe(994n);
  });
});

describe("swapPrice", () => {
  it("reads USDG per token on a buy and on a sell", () => {
    // Buy: 22 USDG in, 0.01 ETH out.
    expect(swapPrice(usdg, eth, 22_000_000n, 10n ** 16n)).toBeCloseTo(2200, 6);
    // Sell: 0.01 ETH in, 21.9 USDG out.
    expect(swapPrice(eth, usdg, 10n ** 16n, 21_900_000n)).toBeCloseTo(2190, 6);
  });
});

describe("approveCall and swapCall", () => {
  it("approves exactly the amount for SwapRouter02", () => {
    const decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: approveCall(5_000_000n) });
    expect([decoded.args[0].toLowerCase(), decoded.args[1]]).toEqual([SWAP_ROUTER_02, 5_000_000n]);
  });

  it("swaps on the pool's fee tier, paid to the signer, with the minimum out", () => {
    const decoded = decodeFunctionData({ abi: EXACT_INPUT_SINGLE_ABI, data: swapCall({ tokenIn: USDG, tokenOut: eth.address, fee: 100, recipient: me, amountIn: 22_000_000n, minOut: 9n * 10n ** 15n }) });
    const params = decoded.args[0];
    expect([params.tokenIn, params.tokenOut, params.recipient].map((address) => address.toLowerCase())).toEqual([USDG, eth.address, me]);
    expect(params).toMatchObject({ fee: 100, amountIn: 22_000_000n, amountOutMinimum: 9n * 10n ** 15n, sqrtPriceLimitX96: 0n });
  });
});
