import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { erc20Abi, type Hex, type PublicClient } from "viem";

import { getMarket } from "@/lib/data/market";
import { QUOTE_EXACT_INPUT_SINGLE_ABI, QUOTER_V2 } from "@/lib/live/contracts";
import { isDirect, minimumOut, pickPool, QUOTE_EXACT_INPUT_ABI, referenceRate, SWAP_ROUTER_02, swapPath, swapRate, USDG, USDG_DECIMALS, V3_FACTORY, V3_FEE_TIERS, type SwapQuote, type SwapToken } from "@/lib/swap";

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
    { address: USDG, symbol: "USDG", name: "Global Dollar", decimals: USDG_DECIMALS, pool: null, lastClose: 1, listed: true },
    ...data.map((row) => ({
      address: row.address.toLowerCase() as Hex,
      symbol: row.symbol,
      name: row.name,
      decimals: Number(row.token_decimals),
      pool: row.price_pool.toLowerCase() as Hex,
      lastClose: closeOf.get(row.address.toLowerCase()) ?? null,
      listed: true,
    })),
  ];
}

const FACTORY_GET_POOL_ABI = [
  { type: "function", name: "getPool", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }] },
] as const;
const POOL_LIQUIDITY_ABI = [{ type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] }] as const;
const ZERO = "0x0000000000000000000000000000000000000000";

/** What a pasted address turned out to be. */
export type TokenLookup =
  | { kind: "listed"; token: SwapToken }
  | { kind: "token"; token: SwapToken; routable: boolean; tradeUrl: string | null; official: boolean }
  | { kind: "not-token" };

/**
 * Resolves a pasted contract address. An allowlisted token comes back as it is. Anything else
 * is read straight from chain (name, symbol, decimals; a contract without them is not a token),
 * and its Uniswap v3 USDG pool is looked up on the factory across every fee tier, keeping the
 * one with the most liquidity. Pools are always found here, never taken from the browser.
 */
export async function lookupToken(chain: PublicClient, address: Hex, listed: SwapToken[], zolva: { address: Hex | null; tradeUrl: string | null } = { address: null, tradeUrl: null }): Promise<TokenLookup> {
  const lower = address.toLowerCase() as Hex;
  const known = listed.find((token) => token.address === lower);
  if (known) return { kind: "listed", token: known };

  const read = <T,>(functionName: "name" | "symbol" | "decimals") => chain.readContract({ address: lower, abi: erc20Abi, functionName }) as Promise<T>;
  let meta: [string, string, number];
  try {
    meta = await Promise.all([read<string>("name"), read<string>("symbol"), read<number>("decimals")]);
  } catch {
    return { kind: "not-token" };
  }
  const [name, symbol, decimals] = meta;
  if (!symbol || decimals > 36) return { kind: "not-token" };

  const candidates = await Promise.all(
    V3_FEE_TIERS.map(async (fee) => {
      const pool = (await chain.readContract({ address: V3_FACTORY, abi: FACTORY_GET_POOL_ABI, functionName: "getPool", args: [lower, USDG, fee] }).catch(() => ZERO)).toLowerCase() as Hex;
      if (pool === ZERO) return null;
      const liquidity = await chain.readContract({ address: pool, abi: POOL_LIQUIDITY_ABI, functionName: "liquidity" }).catch(() => 0n);
      return { pool, fee, liquidity };
    }),
  );
  const best = pickPool(candidates.filter((candidate) => candidate !== null));
  // Names and symbols are free text set by whoever deployed the token: trim them for display.
  const token: SwapToken = { address: lower, symbol: symbol.slice(0, 16), name: name.slice(0, 48), decimals, pool: best?.pool ?? null, lastClose: null, listed: false };
  // Zolva's own token is not an agent market, but it is not a stranger either.
  const official = zolva.address?.toLowerCase() === lower;
  return { kind: "token", token, routable: best !== null, tradeUrl: official ? zolva.tradeUrl : null, official };
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

const TRANSFER_EVENT = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
} as const;

/** About a week of Robinhood Chain blocks (~0.105 s each); one log query covers it. */
const HISTORY_BLOCKS = 6_000_000n;

export type WalletTransaction = {
  txHash: Hex;
  /** Unix seconds. */
  ts: number;
  /** What the wallet sent (negative) and received (positive), allowlisted tokens only, in token units. */
  changes: { symbol: string; amount: number }[];
};

/**
 * The wallet's latest transactions over the last week that moved Zolva's tokens: every
 * ERC-20 Transfer from or to it, kept to the allowlist (spam tokens never show), netted per
 * transaction. Newest first.
 */
export async function walletHistory(chain: PublicClient, owner: Hex, tokens: SwapToken[], limit = 8): Promise<WalletTransaction[]> {
  const latest = await chain.getBlockNumber();
  const fromBlock = latest > HISTORY_BLOCKS ? latest - HISTORY_BLOCKS : 0n;
  const [sent, received] = await Promise.all([
    chain.getLogs({ event: TRANSFER_EVENT, args: { from: owner }, fromBlock, toBlock: latest }),
    chain.getLogs({ event: TRANSFER_EVENT, args: { to: owner }, fromBlock, toBlock: latest }),
  ]);
  const tokenOf = new Map(tokens.map((token) => [token.address, token]));
  const byTx = new Map<Hex, { block: bigint; net: Map<string, bigint> }>();
  for (const [logs, sign] of [
    [sent, -1n],
    [received, 1n],
  ] as const) {
    for (const log of logs) {
      const token = tokenOf.get(log.address.toLowerCase() as Hex);
      if (!token || !log.transactionHash || log.blockNumber === null) continue;
      const entry = byTx.get(log.transactionHash) ?? { block: log.blockNumber, net: new Map<string, bigint>() };
      entry.net.set(token.address, (entry.net.get(token.address) ?? 0n) + sign * (log.args.value ?? 0n));
      byTx.set(log.transactionHash, entry);
    }
  }
  const newest = [...byTx].sort((a, b) => Number(b[1].block - a[1].block)).slice(0, limit);
  const times = await Promise.all(newest.map(([, entry]) => chain.getBlock({ blockNumber: entry.block }).then((block) => Number(block.timestamp))));
  return newest
    .map(([txHash, entry], i) => ({
      txHash,
      ts: times[i],
      changes: [...entry.net]
        .filter(([, value]) => value !== 0n)
        .map(([address, value]) => {
          const token = tokenOf.get(address as Hex)!;
          return { symbol: token.symbol, amount: Number(value) / 10 ** token.decimals };
        })
        // Sent first, then received: reads as "GME → ETH".
        .sort((a, b) => a.amount - b.amount),
    }))
    .filter((row) => row.changes.length > 0);
}

/** A token's hourly closes for the swap page chart: the last week, oldest first. */
export async function tokenChart(db: SupabaseClient, address: Hex): Promise<{ startTs: number; closes: number[] } | null> {
  const market = await getMarket(db);
  const token = market.tokens.find((item) => item.address.toLowerCase() === address);
  if (!token) return null;
  const hours = 168;
  const from = Math.max(0, market.hours - hours);
  const closes = token.closes.slice(from).map((close) => close ?? Number.NaN);
  const first = closes.findIndex((close) => !Number.isNaN(close));
  if (first === -1) return null;
  return { startTs: market.startTs + (from + first) * 3600, closes: closes.slice(first) };
}
