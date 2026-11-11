import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { erc20Abi, type Hex, type PublicClient } from "viem";

import { getMarket } from "@/lib/data/market";
import { env } from "@/lib/env";
import { QUOTE_EXACT_INPUT_SINGLE_ABI, QUOTER_V2 } from "@/lib/live/contracts";
import { feePair, isDirect, minimumOut, pickPool, QUOTE_EXACT_INPUT_ABI, referenceRate, SWAP_ROUTER_02, swapPath, swapRate, USDG, USDG_DECIMALS, V3_FACTORY, V3_FEE_TIERS, type SwapQuote, type SwapToken } from "@/lib/swap";
import { afterFee, DEAD, ETH_NATIVE, PERMIT2, PERMIT2_ABI, ponsPoolKey, UNIVERSAL_ROUTER, V4_QUOTE_ABI, V4_QUOTER, WETH, ZOLVA, zolvaLeg } from "@/lib/swap-zolva";

const POOL_FEE_ABI = [{ type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] }] as const;

/**
 * USDG plus every enabled market with a v3 USDG pool (what SwapRouter02 can route), with the
 * latest hourly close, and $ZOLVA once launched (its Pons pool, priced from zolva_prices).
 */
export async function listSwapTokens(db: SupabaseClient): Promise<SwapToken[]> {
  const [{ data, error }, market, zolvaPrice] = await Promise.all([
    db.from("tokens").select("address, symbol, name, token_decimals, price_pool, asset_class").eq("enabled", true).eq("pool_kind", "v3").order("symbol"),
    getMarket(db),
    db.from("zolva_prices").select("price").order("ts", { ascending: false }).limit(1).maybeSingle<{ price: number }>(),
  ]);
  if (error) throw new Error(`Loading tokens failed: ${error.message}`);
  const closeOf = new Map(market.tokens.map((token) => [token.address.toLowerCase(), token.closes.at(-1) ?? null]));
  const wethRow = data.find((row) => row.address.toLowerCase() === WETH);
  return [
    { address: USDG, symbol: "USDG", name: "Global Dollar", decimals: USDG_DECIMALS, pool: null, lastClose: 1, listed: true },
    // Native ETH, priced and routed like the WETH market (wrapped or unwrapped inside the router).
    ...(wethRow
      ? [{ address: ETH_NATIVE as Hex, symbol: "ETH", name: "Ether", decimals: 18, pool: wethRow.price_pool.toLowerCase() as Hex, lastClose: closeOf.get(WETH) ?? null, listed: true, assetClass: "crypto" as const, native: true }]
      : []),
    ...data.map((row) => ({
      address: row.address.toLowerCase() as Hex,
      // The "ETH" market is the WETH token; in the swap list it is called what it is.
      symbol: row.address.toLowerCase() === WETH ? "WETH" : row.symbol,
      name: row.address.toLowerCase() === WETH ? "Wrapped Ether" : row.name,
      decimals: Number(row.token_decimals),
      pool: row.price_pool.toLowerCase() as Hex,
      lastClose: closeOf.get(row.address.toLowerCase()) ?? null,
      listed: true,
      assetClass: row.asset_class === "crypto" ? ("crypto" as const) : ("stock" as const),
    })),
    // Only when the configured token is the one the Pons pool key was pinned for.
    ...(env.zolvaToken?.address.toLowerCase() === ZOLVA
      ? [{ address: ZOLVA as Hex, symbol: "ZOLVA", name: "Zolva Agent", decimals: 18, pool: null, lastClose: zolvaPrice.data ? Number(zolvaPrice.data.price) : null, listed: true, verified: true }]
      : []),
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
  const official = zolva.address?.toLowerCase() === lower;

  // A Pons token trades on its Pons pool (Uniswap v4 + PonsV2MemeHook): if a small quote on that
  // pool works, swap it there, like ZOLVA.
  const ponsQuote = await chain
    .simulateContract({ address: V4_QUOTER, abi: V4_QUOTE_ABI, functionName: "quoteExactInputSingle", args: [{ poolKey: ponsPoolKey(lower), zeroForOne: true, exactAmount: 10n ** 14n, hookData: "0x" }] })
    .then((result) => result.result[0], () => 0n);
  if (ponsQuote > 0n) {
    const token: SwapToken = { address: lower, symbol: symbol.slice(0, 16), name: name.slice(0, 48), decimals, pool: null, lastClose: null, listed: false, pons: true };
    return { kind: "token", token, routable: true, tradeUrl: official ? zolva.tradeUrl : null, official };
  }

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
  return { kind: "token", token, routable: best !== null, tradeUrl: official ? zolva.tradeUrl : null, official };
}

/** What a wallet holds of every swap token (raw units, as strings), plus its ETH for gas (wei). */
export async function walletBalances(chain: PublicClient, owner: Hex, tokens: SwapToken[]): Promise<{ tokens: Record<string, string>; ethWei: string }> {
  const [eth, ...balances] = await Promise.all([
    chain.getBalance({ address: owner }),
    ...tokens.map((token) => (token.native ? Promise.resolve(0n) : chain.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }).catch(() => 0n))),
  ]);
  return { tokens: Object.fromEntries(tokens.map((token, i) => [token.address, (token.native ? eth : balances[i]).toString()])), ethWei: eth.toString() };
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
/**
 * Zolva's fee for a pair (env SWAP_FEE_BPS), or null. Buying ZOLVA, it is burnt (sent to the dead
 * address); on the other fee pairs it goes to the fee wallet, and without one there is no fee.
 */
function swapFeeFor(tokenIn: SwapToken, tokenOut: SwapToken): { bps: number; to: Hex; burn: boolean } | null {
  const config = env.swapFee;
  if (!config || !feePair(tokenIn, tokenOut)) return null;
  if (tokenOut.address === ZOLVA) return { bps: config.bps, to: DEAD, burn: true };
  return config.recipient ? { bps: config.bps, to: config.recipient, burn: false } : null;
}

/** Reads what a Permit2-based swap needs approved: the token's allowance of Permit2, and Permit2's unexpired allowance of the router. */
async function permit2Approvals(chain: PublicClient, token: Hex, owner: Hex | null) {
  // Native ETH is sent along with the call: nothing to approve.
  if (token === ETH_NATIVE) {
    const unlimited = ((1n << 160n) - 1n).toString();
    return { allowance: owner ? unlimited : null, permit2Allowance: owner ? unlimited : null };
  }
  const [allowance, permit] = await Promise.all([
    owner ? chain.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, PERMIT2] }) : null,
    owner ? chain.readContract({ address: PERMIT2, abi: PERMIT2_ABI, functionName: "allowance", args: [owner, token, UNIVERSAL_ROUTER] }) : null,
  ]);
  // An approval that lapses within a minute is treated as gone: the swap may land after it.
  const permitLeft = permit && Number(permit[1]) > Date.now() / 1000 + 60 ? permit[0] : 0n;
  return { allowance: allowance === null ? null : allowance.toString(), permit2Allowance: owner ? permitLeft.toString() : null };
}

/** A wallet's balance of a swap token: its ETH for native ETH, otherwise the ERC-20 balance. */
const balanceOfToken = (chain: PublicClient, token: SwapToken, owner: Hex) =>
  token.native ? chain.getBalance({ address: owner }) : chain.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] });

export async function quoteSwap(chain: PublicClient, options: { tokenIn: SwapToken; tokenOut: SwapToken; amountIn: bigint; slippageBps: number; owner: Hex | null }): Promise<SwapQuote> {
  const { amountIn, owner } = options;
  // ETH <-> WETH is wrapping: 1:1, no pool, no fee, no approval.
  const pair = new Set([options.tokenIn.address, options.tokenOut.address]);
  if (pair.has(ETH_NATIVE) && pair.has(WETH)) {
    const balance = owner ? await balanceOfToken(chain, options.tokenIn, owner) : null;
    const unlimited = ((1n << 160n) - 1n).toString();
    return { amountIn: amountIn.toString(), amountOut: amountIn.toString(), minOut: amountIn.toString(), fees: [], rate: 1, deviationBps: null, balance: balance === null ? null : balance.toString(), allowance: owner ? unlimited : null, route: "wrap" };
  }
  if (options.tokenIn.address === ZOLVA || options.tokenOut.address === ZOLVA || options.tokenIn.pons || options.tokenOut.pons) return quoteZolvaSwap(chain, options);
  const native = options.tokenIn.native || options.tokenOut.native;
  // Pools only know WETH: price native ETH as WETH; the router call wraps or unwraps it.
  const asWeth = (token: SwapToken) => (token.native ? { ...token, address: WETH as Hex } : token);
  const tokenIn = asWeth(options.tokenIn);
  const tokenOut = asWeth(options.tokenOut);
  const zolvaFee = swapFeeFor(options.tokenIn, options.tokenOut);
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
  const balance = owner ? await balanceOfToken(chain, options.tokenIn, owner) : null;
  // The rate check compares the pool price, before Zolva's fee.
  const rate = swapRate(tokenIn, tokenOut, amountIn, amountOut);
  const reference = referenceRate(tokenIn, tokenOut);
  const base = {
    amountIn: amountIn.toString(),
    fees,
    rate,
    deviationBps: reference ? Math.round(Math.abs(rate / reference - 1) * 10_000) : null,
    balance: balance === null ? null : balance.toString(),
  };
  if (zolvaFee || native) {
    // Fee pairs and native ETH go through the Universal Router (SwapRouter02 can neither take a
    // fee nor pay out ETH here): Permit2 approvals, none for native ETH.
    const net = afterFee(amountOut, zolvaFee);
    return {
      ...base,
      amountOut: net.toString(),
      minOut: minimumOut(net, options.slippageBps).toString(),
      ...(await permit2Approvals(chain, options.tokenIn.address, owner)),
      route: "v3-fee",
      zolvaFee: zolvaFee ? { ...zolvaFee, amount: (amountOut - net).toString() } : null,
    };
  }
  const allowance = owner ? await chain.readContract({ address: tokenIn.address, abi: erc20Abi, functionName: "allowance", args: [owner, SWAP_ROUTER_02] }) : null;
  return {
    ...base,
    amountOut: amountOut.toString(),
    minOut: minimumOut(amountOut, options.slippageBps).toString(),
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
  if (address === ZOLVA) return ponsChart(db, ZOLVA);
  if (address === ETH_NATIVE) address = WETH;
  const market = await getMarket(db);
  const token = market.tokens.find((item) => item.address.toLowerCase() === address);
  // Not a Zolva market: an imported token may still be a Pons token with Pons candles.
  if (!token) return ponsChart(db, address);
  const hours = 168;
  const from = Math.max(0, market.hours - hours);
  const closes = token.closes.slice(from).map((close) => close ?? Number.NaN);
  const first = closes.findIndex((close) => !Number.isNaN(close));
  if (first === -1) return null;
  return { startTs: market.startTs + (from + first) * 3600, closes: closes.slice(first) };
}

/** The v3 WETH/USDG pool the "ETH" market prices from (0.01%), the bridge for ZOLVA <-> USDG. */
const WETH_USDG_POOL = "0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca";

/** Thrown when ZOLVA is paired with something other than USDG or ETH. */
export class ZolvaPairError extends Error {}

/**
 * Quotes a ZOLVA swap on its Pons pool (Uniswap v4) with Uniswap's V4Quoter, adding the v3
 * WETH/USDG leg when the other side is USDG. With an owner it reads what the swap needs
 * approved: the token's allowance of Permit2, and Permit2's (unexpired) allowance of the router.
 */
async function quoteZolvaSwap(chain: PublicClient, options: { tokenIn: SwapToken; tokenOut: SwapToken; amountIn: bigint; slippageBps: number; owner: Hex | null }): Promise<SwapQuote> {
  const { tokenIn, tokenOut, amountIn, owner } = options;
  const ponsTokens = [ZOLVA as Hex, ...[tokenIn, tokenOut].filter((token) => token.pons).map((token) => token.address)];
  const leg = zolvaLeg(tokenIn.address, tokenOut.address, ponsTokens);
  const ponsSymbol = [tokenIn, tokenOut].find((token) => token.address === ZOLVA || token.pons)?.symbol ?? "This token";
  if (!leg) throw new ZolvaPairError(`${ponsSymbol} swaps against USDG or ETH. Pick one of those for the other side.`);
  const poolKey = ponsPoolKey(leg.token ?? ZOLVA);
  const wethUsdgFee = await chain.readContract({ address: WETH_USDG_POOL, abi: POOL_FEE_ABI, functionName: "fee" });
  const v3 = async (from: Hex, to: Hex, amount: bigint) =>
    (await chain.simulateContract({ address: QUOTER_V2, abi: QUOTE_EXACT_INPUT_SINGLE_ABI, functionName: "quoteExactInputSingle", args: [{ tokenIn: from, tokenOut: to, amountIn: amount, fee: wethUsdgFee, sqrtPriceLimitX96: 0n }] })).result[0];
  const v4 = async (buy: boolean, amount: bigint) =>
    (await chain.simulateContract({ address: V4_QUOTER, abi: V4_QUOTE_ABI, functionName: "quoteExactInputSingle", args: [{ poolKey, zeroForOne: buy, exactAmount: amount, hookData: "0x" }] })).result[0];

  const zolvaFee = swapFeeFor(tokenIn, tokenOut);
  // Buying a Pons token other than ZOLVA, the fee is taken in ETH before the swap (lib/swap-zolva.ts);
  // everywhere else it comes off what the swap pays out.
  const feeOnEthIn = leg.buy && (leg.token ?? ZOLVA) !== ZOLVA && zolvaFee !== null;
  let amountOut: bigint;
  let net: bigint;
  let feeAmount = 0n;
  if (leg.buy) {
    const ethIn = leg.other === "usdg" ? await v3(USDG, WETH, amountIn) : amountIn;
    if (feeOnEthIn) {
      const ethSwapped = afterFee(ethIn, zolvaFee);
      feeAmount = ethIn - ethSwapped;
      amountOut = await v4(true, ethSwapped);
      net = amountOut;
    } else {
      amountOut = await v4(true, ethIn);
      net = afterFee(amountOut, zolvaFee);
      feeAmount = amountOut - net;
    }
  } else {
    const ethOut = await v4(false, amountIn);
    amountOut = leg.other === "usdg" ? await v3(WETH, USDG, ethOut) : ethOut;
    net = afterFee(amountOut, zolvaFee);
    feeAmount = amountOut - net;
  }

  const balance = owner ? await balanceOfToken(chain, tokenIn, owner) : null;
  const approvals = await permit2Approvals(chain, tokenIn.address, owner);
  return {
    amountIn: amountIn.toString(),
    amountOut: net.toString(),
    minOut: minimumOut(net, options.slippageBps).toString(),
    fees: leg.other === "usdg" ? [wethUsdgFee] : [],
    rate: swapRate(tokenIn, tokenOut, amountIn, amountOut),
    // No "far from the hourly close" check: ZOLVA moves more than that within an hour and every
    // quote includes Pons' fee, so it would warn on every swap. The minimum out still protects it.
    deviationBps: null,
    balance: balance === null ? null : balance.toString(),
    ...approvals,
    route: "zolva",
    wethUsdgFee,
    // amount: in tokenOut, or in ETH (wei) when it was taken from the ETH going in.
    zolvaFee: zolvaFee ? { ...zolvaFee, amount: feeAmount.toString() } : null,
  };
}

/**
 * Pons' hourly candles for a launch, priced in ETH. Not a documented API (found on Pons' own token
 * page, also used by the Hoodlens project), so every caller must cope with it failing or changing.
 */
const PONS_CANDLES_URL = (address: Hex) => `https://ponsfamily.com/api/launches/${address}?view=candles&interval=1h&limit=200`;
type PonsCandle = { time: number; close: number };

/**
 * ZOLVA's last week of hourly closes in USD for the swap page chart: Pons' hourly candles (in ETH)
 * times the ETH market's close for the same hour, hours without trades carried forward. Falls back
 * to Zolva's own hourly ZOLVA prices (zolva_prices) when Pons does not answer.
 */
async function ponsChart(db: SupabaseClient, tokenAddress: Hex): Promise<{ startTs: number; closes: number[] } | null> {
  const HOUR = 3600;
  const market = await getMarket(db);
  const eth = market.tokens.find((token) => token.address.toLowerCase() === WETH);
  const nowHour = Math.floor(Date.now() / 1000 / HOUR) * HOUR;
  const firstHour = nowHour - 167 * HOUR;

  let candles: PonsCandle[] = [];
  try {
    const response = await fetch(PONS_CANDLES_URL(tokenAddress), { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
    const body = response.ok ? ((await response.json()) as unknown) : null;
    if (Array.isArray(body)) {
      candles = body
        .filter((item): item is PonsCandle => typeof item?.time === "number" && typeof item?.close === "number" && item.close > 0)
        .sort((a, b) => a.time - b.time);
    }
  } catch {
    candles = [];
  }

  if (candles.length && eth && market.hours) {
    // The ETH close for an hour, or the nearest earlier one (the hourly job may not have run yet).
    const ethAt = (ts: number) => {
      let index = Math.min(market.hours - 1, Math.floor((ts - market.startTs) / HOUR));
      while (index >= 0 && eth.closes[index] == null) index--;
      return index >= 0 ? (eth.closes[index] as number) : null;
    };
    const start = Math.max(firstHour, Math.floor(candles[0].time / HOUR) * HOUR);
    const closes: number[] = [];
    let next = 0;
    let lastEth: number | null = null;
    for (let hour = start; hour <= nowHour; hour += HOUR) {
      while (next < candles.length && candles[next].time < hour + HOUR) lastEth = candles[next++].close;
      const usdPerEth = ethAt(hour);
      closes.push(lastEth !== null && usdPerEth !== null ? lastEth * usdPerEth : Number.NaN);
    }
    const first = closes.findIndex((close) => !Number.isNaN(close));
    if (first !== -1) return { startTs: start + first * HOUR, closes: closes.slice(first) };
  }

  // Fallback (ZOLVA only): Zolva's own hourly snapshots.
  if (tokenAddress !== ZOLVA) return null;
  const { data } = await db.from("zolva_prices").select("ts, price").gte("ts", new Date(firstHour * 1000).toISOString()).order("ts");
  if (!data?.length) return null;
  const rows = data.map((row) => ({ ts: Math.floor(new Date(row.ts as string).getTime() / 1000 / HOUR) * HOUR, price: Number(row.price) }));
  return { startTs: rows[0].ts, closes: rows.map((row) => row.price) };
}
