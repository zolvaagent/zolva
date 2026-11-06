import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { erc20Abi, type Hex, type PublicClient } from "viem";

import { getMarket } from "@/lib/data/market";
import { QUOTE_EXACT_INPUT_SINGLE_ABI, QUOTER_V2 } from "@/lib/live/contracts";
import { minimumOut, SWAP_ROUTER_02, swapPrice, USDG, USDG_DECIMALS, type SwapQuote, type SwapToken } from "@/lib/swap";

const POOL_FEE_ABI = [{ type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] }] as const;

/** USDG plus every enabled market with a v3 USDG pool (what SwapRouter02 can route), with the latest hourly close. */
export async function listSwapTokens(db: SupabaseClient): Promise<SwapToken[]> {
  const [{ data, error }, market] = await Promise.all([
    db.from("tokens").select("address, symbol, name, token_decimals, price_pool").eq("enabled", true).eq("pool_kind", "v3").order("symbol"),
    getMarket(db),
  ]);
  if (error) throw new Error(`Loading tokens failed: ${error.message}`);
  const closeOf = new Map(market.tokens.map((token) => [token.address.toLowerCase(), token.closes.at(-1) ?? null]));
  return [
    { address: USDG, symbol: "USDG", name: "Global Dollar", decimals: USDG_DECIMALS, pool: null, lastClose: 1 },
    ...data.map((row) => ({
      address: row.address.toLowerCase() as Hex,
      symbol: row.symbol,
      name: row.name,
      decimals: Number(row.token_decimals),
      pool: row.price_pool.toLowerCase() as Hex,
      lastClose: closeOf.get(row.address.toLowerCase()) ?? null,
    })),
  ];
}

/**
 * Quotes a swap on the token's v3 USDG pool through QuoterV2 (an eth_call, nothing sent).
 * With an owner it also reads their balance and the router's allowance, so the card
 * knows whether an approval is needed first.
 */
export async function quoteSwap(chain: PublicClient, options: { tokenIn: SwapToken; tokenOut: SwapToken; amountIn: bigint; slippageBps: number; owner: Hex | null }): Promise<SwapQuote> {
  const { tokenIn, tokenOut, amountIn, owner } = options;
  const market = tokenIn.address === USDG ? tokenOut : tokenIn;
  if (!market.pool) throw new Error("One side of a swap must be USDG and the other a market");
  const fee = await chain.readContract({ address: market.pool, abi: POOL_FEE_ABI, functionName: "fee" });
  const [quote, balance, allowance] = await Promise.all([
    chain.simulateContract({
      address: QUOTER_V2,
      abi: QUOTE_EXACT_INPUT_SINGLE_ABI,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn, fee, sqrtPriceLimitX96: 0n }],
    }),
    owner ? chain.readContract({ address: tokenIn.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }) : null,
    owner ? chain.readContract({ address: tokenIn.address, abi: erc20Abi, functionName: "allowance", args: [owner, SWAP_ROUTER_02] }) : null,
  ]);
  const amountOut = quote.result[0];
  const price = swapPrice(tokenIn, tokenOut, amountIn, amountOut);
  return {
    amountIn: amountIn.toString(),
    amountOut: amountOut.toString(),
    minOut: minimumOut(amountOut, options.slippageBps).toString(),
    fee,
    price,
    deviationBps: market.lastClose ? Math.round(Math.abs(price / market.lastClose - 1) * 10_000) : null,
    balance: balance === null ? null : balance.toString(),
    allowance: allowance === null ? null : allowance.toString(),
  };
}
