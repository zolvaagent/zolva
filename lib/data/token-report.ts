import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { erc20Abi, formatUnits, parseAbi, parseAbiItem, type Hex, type PublicClient } from "viem";

import { USDG } from "@/lib/live/contracts";
import { POOL_MANAGER, sqrtPriceFromV4Slot0, v4PoolStateSlot } from "@/lib/prices/onchain";
import { DEAD, UNIVERSAL_ROUTER, ZOLVA, ZOLVA_POOL_ID } from "@/lib/swap-zolva";
import {
  burnTotals,
  classifyBurn,
  creditTotals,
  positionAmounts,
  positionTicks,
  type Burn,
  type BurnKind,
  type CreditTotals,
  type LedgerRow,
  type LockedPosition,
} from "@/lib/token-report";

import { allRows } from "./paged";

/**
 * The public ZOLVA report (/token/report), built from the chain and aggregate database totals only:
 * every ZOLVA transfer to the dead address (classified in lib/token-report.ts), the liquidity locked by
 * sending a Uniswap v4 position NFT of ZOLVA's main pool to the dead address, the swap fee wallet's
 * balances waiting for the next buyback, and AI credits granted and spent. No per-user data.
 */
export type TokenReport = {
  supply: number;
  burnt: number;
  burnTotals: { kind: BurnKind; amount: number; count: number }[];
  /** Newest first, at most RECENT_BURNS. */
  burns: Burn[];
  /** Positions in ZOLVA's main pool owned by the dead address, newest first. */
  lockedLiquidity: LockedPosition[];
  /** The swap fee wallet, or null while no fee recipient is set. */
  feeWallet: { address: string; balances: { symbol: string; amount: number }[] } | null;
  credits: CreditTotals & { reviews: number; strategies: number };
  builtAt: number;
};

const RECENT_BURNS = 20;
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
// The chain's history is short and Robinhood Chain's RPC answers a whole-range log query for one
// token and one recipient; this stays cheap because burns are rare.
/** Uniswap v4 PositionManager on Robinhood Chain ("Uniswap v4 Positions NFT"); every v4 position is one of its NFTs. */
const POSITION_MANAGER = "0x58daec3116aae6d93017baaea7749052e8a04fa7";
const POSITION_TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed id)");
/** The PoolManager's event for every liquidity change; for PositionManager positions the salt is the token id. */
const MODIFY_LIQUIDITY = parseAbiItem("event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)");
const POSITION_ABI = parseAbi([
  "function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 info)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);
const POOL_MANAGER_ABI = parseAbi(["function extsload(bytes32 slot) view returns (bytes32)"]);
// Ticks Uniswap allows at tickSpacing 200: a position from MIN to MAX is full range.
const FULL_RANGE_TICK = 887200;
const CACHE_MS = 10 * 60 * 1000;
let cached: { at: number; report: TokenReport } | null = null;

export async function loadTokenReport(db: SupabaseClient, chain: PublicClient, feeRecipient: string | null): Promise<TokenReport> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.report;

  const [supplyRaw, burntRaw, logs, liquidityLogs, topups, ledger, usage, generations, cryptoTokens] = await Promise.all([
    chain.readContract({ address: ZOLVA as Hex, abi: erc20Abi, functionName: "totalSupply" }),
    chain.readContract({ address: ZOLVA as Hex, abi: erc20Abi, functionName: "balanceOf", args: [DEAD as Hex] }),
    chain.getLogs({ address: ZOLVA as Hex, event: TRANSFER, args: { to: DEAD as Hex }, fromBlock: 0n, toBlock: "latest" }),
    // Liquidity added or removed in ZOLVA's main pool through the PositionManager. Far too many
    // positions of other pools were sent to the dead address to list those, so start from this pool.
    chain.getLogs({ address: POOL_MANAGER as Hex, event: MODIFY_LIQUIDITY, args: { id: ZOLVA_POOL_ID, sender: POSITION_MANAGER }, fromBlock: 0n, toBlock: "latest" }),
    db.from("zolva_topups").select("tx_hash"),
    allRows<LedgerRow>((from, to) => db.from("ai_ledger").select("bucket, kind, delta_micro").range(from, to)),
    db.from("ai_usage").select("id", { count: "exact", head: true }).eq("status", "done"),
    db.from("ai_generations").select("id", { count: "exact", head: true }).eq("status", "done"),
    db.from("tokens").select("address, symbol").eq("enabled", true).eq("venue", "uniswap").eq("asset_class", "crypto"),
  ]);
  if (topups.error || cryptoTokens.error) throw new Error((topups.error ?? cryptoTokens.error)!.message);

  const creditTxs = new Set(((topups.data ?? []) as { tx_hash: string }[]).map((row) => row.tx_hash.toLowerCase()));
  const blocks = new Map<bigint, number>();
  await Promise.all(
    [...new Set(logs.map((log) => log.blockNumber!))].map(async (number) => {
      const block = await chain.getBlock({ blockNumber: number });
      blocks.set(number, Number(block.timestamp));
    }),
  );
  const burns: Burn[] = logs
    .map((log) => ({
      txHash: log.transactionHash!,
      from: log.args.from!,
      amount: Number(formatUnits(log.args.value!, 18)),
      blockNumber: Number(log.blockNumber),
      ts: blocks.get(log.blockNumber!) ?? null,
      kind: classifyBurn(log.transactionHash!, log.args.from!, { router: UNIVERSAL_ROUTER, creditTxs }),
    }))
    .sort((a, b) => b.blockNumber - a.blockNumber);

  const lockedLiquidity = await loadLockedLiquidity(chain, liquidityLogs);

  let feeWallet: TokenReport["feeWallet"] = null;
  if (feeRecipient) {
    const wallet = feeRecipient as Hex;
    // What the fee is paid in on the fee pairs: USDG and the listed crypto tokens, plus native ETH.
    // The listed "ETH" token is wrapped ETH; the wallet's own ETH is shown separately.
    const assets = [{ address: USDG, symbol: "USDG" }, ...((cryptoTokens.data ?? []) as { address: string; symbol: string }[]).map((token) => ({ ...token, symbol: token.symbol === "ETH" ? "WETH" : token.symbol }))];
    const [eth, ...tokenBalances] = await Promise.all([
      chain.getBalance({ address: wallet }),
      ...assets.map((asset) => chain.readContract({ address: asset.address as Hex, abi: erc20Abi, functionName: "balanceOf", args: [wallet] })),
    ]);
    const decimals = await Promise.all(assets.map((asset) => (asset.symbol === "USDG" ? 6 : chain.readContract({ address: asset.address as Hex, abi: erc20Abi, functionName: "decimals" }))));
    feeWallet = {
      address: feeRecipient,
      balances: [
        { symbol: "ETH (native)", amount: Number(formatUnits(eth, 18)) },
        ...assets.map((asset, i) => ({ symbol: asset.symbol, amount: Number(formatUnits(tokenBalances[i], Number(decimals[i]))) })),
      ],
    };
  }

  const report: TokenReport = {
    supply: Number(formatUnits(supplyRaw, 18)),
    burnt: Number(formatUnits(burntRaw, 18)),
    burnTotals: burnTotals(burns),
    burns: burns.slice(0, RECENT_BURNS),
    lockedLiquidity,
    feeWallet,
    credits: { ...creditTotals(ledger), reviews: usage.count ?? 0, strategies: generations.count ?? 0 },
    builtAt: Math.floor(Date.now() / 1000),
  };
  cached = { at: Date.now(), report };
  return report;
}

type LiquidityLog = { args: { liquidityDelta?: bigint; salt?: Hex } };

/**
 * The burnt positions in ZOLVA's main pool and what they hold at today's price: every position that
 * ever added liquidity to the pool and is now owned by the dead address, with the transfer that sent
 * it there. Native ETH is currency0, so amount0 is ETH and amount1 ZOLVA, both 18 decimals.
 */
async function loadLockedLiquidity(chain: PublicClient, logs: LiquidityLog[]): Promise<LockedPosition[]> {
  const tokenIds = [...new Set(logs.filter((log) => (log.args.liquidityDelta ?? 0n) > 0n && log.args.salt).map((log) => BigInt(log.args.salt!)))];
  if (!tokenIds.length) return [];

  const owners = await Promise.all(tokenIds.map((tokenId) => chain.readContract({ address: POSITION_MANAGER, abi: POSITION_ABI, functionName: "ownerOf", args: [tokenId] }).catch(() => null)));
  const burnt = tokenIds.filter((_, i) => owners[i]?.toLowerCase() === DEAD.toLowerCase());
  if (!burnt.length) return [];

  const slot0 = await chain.readContract({ address: POOL_MANAGER as Hex, abi: POOL_MANAGER_ABI, functionName: "extsload", args: [v4PoolStateSlot(ZOLVA_POOL_ID)] });
  const sqrtPriceX96 = sqrtPriceFromV4Slot0(slot0);
  const positions = await Promise.all(
    burnt.map(async (tokenId): Promise<LockedPosition | null> => {
      const [[poolKey, info], liquidity, transfers] = await Promise.all([
        chain.readContract({ address: POSITION_MANAGER, abi: POSITION_ABI, functionName: "getPoolAndPositionInfo", args: [tokenId] }),
        chain.readContract({ address: POSITION_MANAGER, abi: POSITION_ABI, functionName: "getPositionLiquidity", args: [tokenId] }),
        chain.getLogs({ address: POSITION_MANAGER, event: POSITION_TRANSFER, args: { to: DEAD as Hex, id: tokenId }, fromBlock: 0n, toBlock: "latest" }),
      ]);
      const sent = transfers.at(-1);
      if (!sent || poolKey.currency1.toLowerCase() !== ZOLVA.toLowerCase()) return null;
      const block = await chain.getBlock({ blockNumber: sent.blockNumber! });
      const { tickLower, tickUpper } = positionTicks(info);
      const { amount0, amount1 } = positionAmounts(liquidity, sqrtPriceX96, tickLower, tickUpper);
      return {
        tokenId: tokenId.toString(),
        txHash: sent.transactionHash!,
        blockNumber: Number(sent.blockNumber),
        ts: Number(block.timestamp),
        eth: amount0 / 1e18,
        zolva: amount1 / 1e18,
        fullRange: tickLower <= -FULL_RANGE_TICK && tickUpper >= FULL_RANGE_TICK,
      };
    }),
  );
  return positions.filter((position): position is LockedPosition => position !== null).sort((a, b) => b.blockNumber - a.blockNumber);
}
