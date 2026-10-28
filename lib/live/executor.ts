/**
 * Live executor core: turns one order (swap X of tokenIn for tokenOut) into a
 * confirmed on-chain swap, or a clear reason why not. No database here, so
 * the live runner and the smoke test script run exactly the same code.
 *
 * Steps: balances, fresh quote (QuoterV2), price check against a reference,
 * exact approval if needed, swap through SwapRouter02 with a minimum output,
 * sign with Privy under the wallet's policy, broadcast via our RPC, wait for
 * the receipt, read the real amount received from the token's Transfer log.
 *
 * Kept free of Next.js and server-only imports so scripts can share it.
 */
import type { PrivyClient } from "@privy-io/node";
import { decodeEventLog, encodeFunctionData, erc20Abi, type Hex, type Log, type PublicClient } from "viem";

import { ERC20_APPROVE_ABI, EXACT_INPUT_SINGLE_ABI, QUOTE_EXACT_INPUT_SINGLE_ABI, QUOTER_V2, ROBINHOOD_CHAIN_ID, SWAP_ROUTER_02 } from "./contracts.ts";

/** Below this the wallet cannot pay for an approve and a swap (about 30 swaps at today's gas). */
export const MIN_ETH_WEI = 10n ** 13n;

const POOL_FEE_ABI = [{ type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] }] as const;

export type LiveContext = {
  chain: PublicClient;
  privy: PrivyClient;
  /** P-256 key of Zolva's signer (PRIVY_AUTHORIZATION_KEY). */
  authorizationKey: string;
  /** Privy wallet id and address of the trading wallet. */
  walletId: string;
  wallet: Hex;
  /** ETH price in USD, for reporting gas. */
  ethUsd: number;
};

export type SwapOrder = {
  tokenIn: Hex;
  tokenOut: Hex;
  /** Raw units of tokenIn. */
  amountIn: bigint;
  /** The token's v3 USDG pool, which sets the fee tier. */
  pool: Hex;
  /** buy = USDG in, token out; sell = token in, USDG out. */
  side: "buy" | "sell";
  /** Decimals of the non-USDG side. */
  tokenDecimals: number;
  /** USDG per token the decision was based on (or the oracle price). */
  referencePrice: number;
  maxSlippageBps: number;
  maxDeviationBps: number;
};

export type SwapResult =
  | { ok: true; txHash: Hex; amountIn: bigint; amountOut: bigint; price: number; gasUsed: bigint; gasCostUsd: number }
  | { ok: false; stage: "balance" | "quote" | "price" | "approve" | "swap"; error: string; txHash?: Hex };

const USDG_DECIMALS = 6;

/** Quote minus the slippage allowance, rounded down. */
export function minimumOut(quoted: bigint, maxSlippageBps: number): bigint {
  return (quoted * BigInt(10_000 - maxSlippageBps)) / 10_000n;
}

/** USDG per token implied by a swap's amounts. */
export function impliedPrice(side: SwapOrder["side"], amountIn: bigint, amountOut: bigint, tokenDecimals: number): number {
  const usdg = Number(side === "buy" ? amountIn : amountOut) / 10 ** USDG_DECIMALS;
  const tokens = Number(side === "buy" ? amountOut : amountIn) / 10 ** tokenDecimals;
  return usdg / tokens;
}

/** Distance between two prices in basis points. */
export function deviationBps(price: number, reference: number): number {
  return Math.abs(price / reference - 1) * 10_000;
}

/** Sum of `token` Transfer logs paid to `wallet` in a receipt: what the swap really delivered. */
export function amountReceived(logs: Pick<Log, "address" | "data" | "topics">[], token: Hex, wallet: Hex): bigint {
  let total = 0n;
  for (const log of logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (event.eventName === "Transfer" && event.args.to.toLowerCase() === wallet.toLowerCase()) total += event.args.value;
    } catch {
      // Not a Transfer (an Approval, say): ignore.
    }
  }
  return total;
}

async function signAndSend(ctx: LiveContext, to: Hex, data: Hex, gas: bigint): Promise<Hex> {
  const [nonce, fees] = await Promise.all([ctx.chain.getTransactionCount({ address: ctx.wallet, blockTag: "pending" }), ctx.chain.estimateFeesPerGas()]);
  const signed = await ctx.privy
    .wallets()
    .ethereum()
    .signTransaction(ctx.walletId, {
      params: {
        transaction: {
          type: 2,
          chain_id: ROBINHOOD_CHAIN_ID,
          to,
          data,
          value: 0,
          nonce,
          gas_limit: Number(gas),
          max_fee_per_gas: Number(fees.maxFeePerGas * 2n),
          max_priority_fee_per_gas: Number(fees.maxPriorityFeePerGas ?? 0n),
        },
      },
      authorization_context: { authorization_private_keys: [ctx.authorizationKey] },
    });
  return ctx.chain.sendRawTransaction({ serializedTransaction: signed.signed_transaction as Hex });
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)).slice(0, 300);

/**
 * Runs one swap. `onSubmitted` is called with the swap's hash as soon as it is
 * broadcast, so the caller can record it before waiting (crash recovery).
 */
export async function executeSwap(ctx: LiveContext, order: SwapOrder, onSubmitted?: (txHash: Hex) => Promise<void>): Promise<SwapResult> {
  // 1. Balances.
  const [balanceIn, eth] = await Promise.all([
    ctx.chain.readContract({ address: order.tokenIn, abi: erc20Abi, functionName: "balanceOf", args: [ctx.wallet] }),
    ctx.chain.getBalance({ address: ctx.wallet }),
  ]);
  if (balanceIn < order.amountIn) return { ok: false, stage: "balance", error: `wallet holds ${balanceIn} of ${order.tokenIn}, order needs ${order.amountIn}` };
  if (eth < MIN_ETH_WEI) return { ok: false, stage: "balance", error: `wallet has ${eth} wei of ETH, below the gas reserve` };

  // 2. Fresh quote and price check.
  let fee: number;
  let quoted: bigint;
  try {
    fee = await ctx.chain.readContract({ address: order.pool, abi: POOL_FEE_ABI, functionName: "fee" });
    const quote = await ctx.chain.simulateContract({
      address: QUOTER_V2,
      abi: QUOTE_EXACT_INPUT_SINGLE_ABI,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn: order.tokenIn, tokenOut: order.tokenOut, amountIn: order.amountIn, fee, sqrtPriceLimitX96: 0n }],
    });
    quoted = quote.result[0];
  } catch (cause) {
    return { ok: false, stage: "quote", error: message(cause) };
  }
  const quotedPrice = impliedPrice(order.side, order.amountIn, quoted, order.tokenDecimals);
  const deviation = deviationBps(quotedPrice, order.referencePrice);
  if (deviation > order.maxDeviationBps) {
    return { ok: false, stage: "price", error: `quote ${quotedPrice.toFixed(4)} is ${(deviation / 100).toFixed(2)}% from the reference ${order.referencePrice.toFixed(4)}` };
  }

  // 3. Exact approval, only when the allowance is short.
  try {
    const allowance = await ctx.chain.readContract({ address: order.tokenIn, abi: erc20Abi, functionName: "allowance", args: [ctx.wallet, SWAP_ROUTER_02] });
    if (allowance < order.amountIn) {
      const approve = encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: "approve", args: [SWAP_ROUTER_02, order.amountIn] });
      const hash = await signAndSend(ctx, order.tokenIn, approve, 100_000n);
      const receipt = await ctx.chain.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== "success") return { ok: false, stage: "approve", error: "approve reverted", txHash: hash };
    }
  } catch (cause) {
    return { ok: false, stage: "approve", error: message(cause) };
  }

  // 4. Swap with a minimum output, into the wallet itself.
  const swap = encodeFunctionData({
    abi: EXACT_INPUT_SINGLE_ABI,
    functionName: "exactInputSingle",
    args: [{ tokenIn: order.tokenIn, tokenOut: order.tokenOut, fee, recipient: ctx.wallet, amountIn: order.amountIn, amountOutMinimum: minimumOut(quoted, order.maxSlippageBps), sqrtPriceLimitX96: 0n }],
  });
  let hash: Hex;
  try {
    const gas = await ctx.chain.estimateGas({ account: ctx.wallet, to: SWAP_ROUTER_02, data: swap });
    hash = await signAndSend(ctx, SWAP_ROUTER_02, swap, (gas * 13n) / 10n);
  } catch (cause) {
    return { ok: false, stage: "swap", error: message(cause) };
  }
  await onSubmitted?.(hash);
  return confirmSwap(ctx, order, hash);
}

/** Waits for a broadcast swap and reads what it delivered. Also used to finish swaps after a crash. */
export async function confirmSwap(ctx: LiveContext, order: Pick<SwapOrder, "tokenOut" | "amountIn" | "side" | "tokenDecimals">, hash: Hex): Promise<SwapResult> {
  try {
    const receipt = await ctx.chain.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== "success") return { ok: false, stage: "swap", error: "swap reverted", txHash: hash };
    const amountOut = amountReceived(receipt.logs, order.tokenOut, ctx.wallet);
    if (amountOut === 0n) return { ok: false, stage: "swap", error: "swap confirmed but no tokens reached the wallet", txHash: hash };
    const gasCostUsd = (Number(receipt.gasUsed * receipt.effectiveGasPrice) / 1e18) * ctx.ethUsd;
    return { ok: true, txHash: hash, amountIn: order.amountIn, amountOut, price: impliedPrice(order.side, order.amountIn, amountOut, order.tokenDecimals), gasUsed: receipt.gasUsed, gasCostUsd };
  } catch (cause) {
    return { ok: false, stage: "swap", error: message(cause), txHash: hash };
  }
}
