import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { erc20Abi, type Hex, type PublicClient } from "viem";

import { getMarket } from "@/lib/data/market";
import { QUOTE_EXACT_INPUT_SINGLE_ABI, QUOTER_V2 } from "@/lib/live/contracts";
import { isDirect, minimumOut, QUOTE_EXACT_INPUT_ABI, referenceRate, SWAP_ROUTER_02, swapPath, swapRate, USDG, USDG_DECIMALS, type SwapQuote, type SwapToken } from "@/lib/swap";

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

/** What a wallet holds of every swap token (raw units, as strings), plus its ETH for gas (wei). */
export async function walletBalances(chain: PublicClient, owner: Hex, tokens: SwapToken[]): Promise<{ tokens: Record<string, string>; ethWei: string }> {
  const [eth, ...balances] = await Promise.all([
    chain.getBalance({ address: owner }),
    ...tokens.map((token) => chain.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }).catch(() => 0n)),
  ]);
  return { tokens: Object.fromEntries(tokens.map((token, i) => [token.address, balances[i].toString()])), ethWei: eth.toString() };
}

const poolFee = (chain: PublicClient, token: SwapToken) => {
  if (!token.pool) throw new Error(`${token.symbol} has no pool`);
  return chain.readContract({ address: token.pool, abi: POOL_FEE_ABI, functionName: "fee" });
};

/**
 * Quotes a swap through QuoterV2 (an eth_call, nothing sent): one hop on the market's USDG
 * pool when a side is USDG, otherwise two hops through USDG. With an owner it also reads
 * their balance and the router's allowance, so the card knows whether to approve first.
 */
export async function quoteSwap(chain: PublicClient, options: { tokenIn: SwapToken; tokenOut: SwapToken; amountIn: bigint; slippageBps: number; owner: Hex | null }): Promise<SwapQuote> {
  const { tokenIn, tokenOut, amountIn, owner } = options;
  let fees: number[];
  let amountOut: bigint;
  if (isDirect(tokenIn, tokenOut)) {
    const market = tokenIn.address === USDG ? tokenOut : tokenIn;
    const fee = await poolFee(chain, market);
    const quote = await chain.simulateContract({
      address: QUOTER_V2,
      abi: QUOTE_EXACT_INPUT_SINGLE_ABI,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn, fee, sqrtPriceLimitX96: 0n }],
    });
    fees = [fee];
    amountOut = quote.result[0];
  } else {
    const hopFees = (await Promise.all([poolFee(chain, tokenIn), poolFee(chain, tokenOut)])) as [number, number];
    const quote = await chain.simulateContract({ address: QUOTER_V2, abi: QUOTE_EXACT_INPUT_ABI, functionName: "quoteExactInput", args: [swapPath(tokenIn.address, tokenOut.address, hopFees), amountIn] });
    fees = hopFees;
    amountOut = quote.result[0];
  }
  const [balance, allowance] = await Promise.all([
    owner ? chain.readContract({ address: tokenIn.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }) : null,
    owner ? chain.readContract({ address: tokenIn.address, abi: erc20Abi, functionName: "allowance", args: [owner, SWAP_ROUTER_02] }) : null,
  ]);
  const rate = swapRate(tokenIn, tokenOut, amountIn, amountOut);
  const reference = referenceRate(tokenIn, tokenOut);
  return {
    amountIn: amountIn.toString(),
    amountOut: amountOut.toString(),
    minOut: minimumOut(amountOut, options.slippageBps).toString(),
    fees,
    rate,
    deviationBps: reference ? Math.round(Math.abs(rate / reference - 1) * 10_000) : null,
    balance: balance === null ? null : balance.toString(),
    allowance: allowance === null ? null : allowance.toString(),
  };
}
