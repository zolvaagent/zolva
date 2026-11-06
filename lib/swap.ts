/**
 * Manual swaps from the user's own wallet (/swap and "Sell position"): the calls the
 * browser wallet signs. Every token is from Zolva's allowlist and every hop goes through a
 * token's v3 USDG pool on Uniswap's SwapRouter02, the route live agents use: one hop when
 * a side is USDG, two hops through USDG otherwise (ETH -> USDG -> NVDA). Zolva never signs
 * these; the user does.
 *
 * Pure, so the swap card, the server quote and tests share it.
 */
import { encodeFunctionData, encodePacked, type Hex } from "viem";

import { ERC20_APPROVE_ABI, EXACT_INPUT_SINGLE_ABI, SWAP_ROUTER_02, USDG } from "./live/contracts.ts";

export { SWAP_ROUTER_02, USDG };
export const USDG_DECIMALS = 6;
/** Default and largest slippage the card allows, in basis points. */
export const DEFAULT_SLIPPAGE_BPS = 100;
export const MAX_SLIPPAGE_BPS = 500;
/** A quote further than this from the latest hourly closes gets a warning before signing. */
export const PRICE_WARNING_BPS = 200;

/** SwapRouter02.exactInput (multi-hop; SwapRouter02 has no deadline field). */
export const EXACT_INPUT_ABI = [
  {
    type: "function",
    name: "exactInput",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "path", type: "bytes" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

/** QuoterV2.quoteExactInput, called with eth_call to price a multi-hop swap. */
export const QUOTE_EXACT_INPUT_ABI = [
  {
    type: "function",
    name: "quoteExactInput",
    stateMutability: "nonpayable",
    inputs: [
      { name: "path", type: "bytes" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96AfterList", type: "uint160[]" },
      { name: "initializedTicksCrossedList", type: "uint32[]" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

/** A token the card can swap: an allowlisted market with a v3 USDG pool, or USDG itself. */
export type SwapToken = { address: Hex; symbol: string; name: string; decimals: number; pool: Hex | null; lastClose: number | null };

/** What /api/swap returns for a quote. */
export type SwapQuote = {
  amountIn: string;
  amountOut: string;
  minOut: string;
  /** Pool fee of each hop in hundredths of a basis point (100 = 0.01%): one hop, or two through USDG. */
  fees: number[];
  /** Units of tokenOut per unit of tokenIn implied by the quote. */
  rate: number;
  /** Distance from the rate the latest hourly closes imply, in basis points; null without closes. */
  deviationBps: number | null;
  /** Set when an owner was given: what they hold and what the router may spend. */
  balance: string | null;
  allowance: string | null;
};

/** Quote minus the slippage allowance, rounded down. */
export function minimumOut(quoted: bigint, slippageBps: number): bigint {
  return (quoted * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** Units of tokenOut per unit of tokenIn from a swap's raw amounts. */
export function swapRate(tokenIn: SwapToken, tokenOut: SwapToken, amountIn: bigint, amountOut: bigint): number {
  return Number(amountOut) / 10 ** tokenOut.decimals / (Number(amountIn) / 10 ** tokenIn.decimals);
}

/** The rate the latest hourly closes imply (USDG closes at 1), or null without both. */
export function referenceRate(tokenIn: SwapToken, tokenOut: SwapToken): number | null {
  return tokenIn.lastClose && tokenOut.lastClose ? tokenIn.lastClose / tokenOut.lastClose : null;
}

/** Hops of a swap: one when a side is USDG, otherwise in through USDG and out again. */
export function isDirect(tokenIn: SwapToken, tokenOut: SwapToken): boolean {
  return tokenIn.address === USDG || tokenOut.address === USDG;
}

/** Uniswap v3 path for a two-hop swap through USDG: tokenIn, fee, USDG, fee, tokenOut. */
export function swapPath(tokenIn: Hex, tokenOut: Hex, fees: [number, number]): Hex {
  return encodePacked(["address", "uint24", "address", "uint24", "address"], [tokenIn, fees[0], USDG, fees[1], tokenOut]);
}

/** The exact approval of the router for this swap (never unlimited). */
export function approveCall(amountIn: bigint): Hex {
  return encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: "approve", args: [SWAP_ROUTER_02, amountIn] });
}

/** The router call, paid out to the signer's own wallet: exactInputSingle for one hop, exactInput for two. */
export function swapCall(options: { tokenIn: Hex; tokenOut: Hex; fees: number[]; recipient: Hex; amountIn: bigint; minOut: bigint }): Hex {
  if (options.fees.length === 1) {
    return encodeFunctionData({
      abi: EXACT_INPUT_SINGLE_ABI,
      functionName: "exactInputSingle",
      args: [{ tokenIn: options.tokenIn, tokenOut: options.tokenOut, fee: options.fees[0], recipient: options.recipient, amountIn: options.amountIn, amountOutMinimum: options.minOut, sqrtPriceLimitX96: 0n }],
    });
  }
  return encodeFunctionData({
    abi: EXACT_INPUT_ABI,
    functionName: "exactInput",
    args: [{ path: swapPath(options.tokenIn, options.tokenOut, options.fees as [number, number]), recipient: options.recipient, amountIn: options.amountIn, amountOutMinimum: options.minOut }],
  });
}
