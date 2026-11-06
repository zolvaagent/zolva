/**
 * Manual swaps from the user's own wallet (the Swap card and "Sell position"): the two
 * calls the browser wallet signs. One side is always USDG, every token is from Zolva's
 * allowlist, and the swap goes through Uniswap's SwapRouter02 on the token's v3 USDG pool,
 * the same route live agents use. Zolva never signs these; the user does.
 *
 * Pure, so the Swap card, the server quote and tests share it.
 */
import { encodeFunctionData, type Hex } from "viem";

import { ERC20_APPROVE_ABI, EXACT_INPUT_SINGLE_ABI, SWAP_ROUTER_02, USDG } from "./live/contracts.ts";

export { SWAP_ROUTER_02, USDG };
export const USDG_DECIMALS = 6;
/** Default and largest slippage the card allows, in basis points. */
export const DEFAULT_SLIPPAGE_BPS = 100;
export const MAX_SLIPPAGE_BPS = 500;
/** A quote further than this from the latest hourly close gets a warning before signing. */
export const PRICE_WARNING_BPS = 200;

/** A token the card can swap: an allowlisted market with a v3 USDG pool, or USDG itself. */
export type SwapToken = { address: Hex; symbol: string; name: string; decimals: number; pool: Hex | null; lastClose: number | null };

/** What /api/swap returns for a quote. */
export type SwapQuote = {
  amountIn: string;
  amountOut: string;
  minOut: string;
  /** Pool fee in hundredths of a basis point (100 = 0.01%), for SwapRouter02. */
  fee: number;
  /** USDG per token implied by the quote. */
  price: number;
  /** Distance from the latest hourly close in basis points; null without one. */
  deviationBps: number | null;
  /** Set when an owner was given: what they hold and what the router may spend. */
  balance: string | null;
  allowance: string | null;
};

/** Quote minus the slippage allowance, rounded down. */
export function minimumOut(quoted: bigint, slippageBps: number): bigint {
  return (quoted * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** USDG per token from a swap's amounts, whichever side USDG is on. */
export function swapPrice(tokenIn: SwapToken, tokenOut: SwapToken, amountIn: bigint, amountOut: bigint): number {
  const usdgIn = tokenIn.address === USDG;
  const usdg = Number(usdgIn ? amountIn : amountOut) / 10 ** USDG_DECIMALS;
  const other = usdgIn ? tokenOut : tokenIn;
  const tokens = Number(usdgIn ? amountOut : amountIn) / 10 ** other.decimals;
  return usdg / tokens;
}

/** The exact approval of the router for this swap (never unlimited). */
export function approveCall(amountIn: bigint): Hex {
  return encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: "approve", args: [SWAP_ROUTER_02, amountIn] });
}

/** SwapRouter02.exactInputSingle, paid out to the signer's own wallet. */
export function swapCall(options: { tokenIn: Hex; tokenOut: Hex; fee: number; recipient: Hex; amountIn: bigint; minOut: bigint }): Hex {
  return encodeFunctionData({
    abi: EXACT_INPUT_SINGLE_ABI,
    functionName: "exactInputSingle",
    args: [{ tokenIn: options.tokenIn, tokenOut: options.tokenOut, fee: options.fee, recipient: options.recipient, amountIn: options.amountIn, amountOutMinimum: options.minOut, sqrtPriceLimitX96: 0n }],
  });
}
