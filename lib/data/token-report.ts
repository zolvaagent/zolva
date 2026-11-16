import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { erc20Abi, formatUnits, parseAbiItem, type Hex, type PublicClient } from "viem";

import { USDG } from "@/lib/live/contracts";
import { DEAD, UNIVERSAL_ROUTER, ZOLVA } from "@/lib/swap-zolva";
import { burnTotals, classifyBurn, creditTotals, type Burn, type BurnKind, type CreditTotals, type LedgerRow } from "@/lib/token-report";

import { allRows } from "./paged";

/**
 * The public ZOLVA report (/token/report), built from the chain and aggregate database totals only:
 * every ZOLVA transfer to the dead address (classified in lib/token-report.ts), the swap fee wallet's
 * balances waiting for the next buyback, and AI credits granted and spent. No per-user data.
 */
export type TokenReport = {
  supply: number;
  burnt: number;
  burnTotals: { kind: BurnKind; amount: number; count: number }[];
  /** Newest first, at most RECENT_BURNS. */
  burns: Burn[];
  /** The swap fee wallet, or null while no fee recipient is set. */
  feeWallet: { address: string; balances: { symbol: string; amount: number }[] } | null;
  credits: CreditTotals & { reviews: number; strategies: number };
  builtAt: number;
};

const RECENT_BURNS = 20;
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
// The chain's history is short and Robinhood Chain's RPC answers a whole-range log query for one
// token and one recipient; this stays cheap because burns are rare.
const CACHE_MS = 10 * 60 * 1000;
let cached: { at: number; report: TokenReport } | null = null;

export async function loadTokenReport(db: SupabaseClient, chain: PublicClient, feeRecipient: string | null): Promise<TokenReport> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.report;

  const [supplyRaw, burntRaw, logs, topups, ledger, usage, generations, cryptoTokens] = await Promise.all([
    chain.readContract({ address: ZOLVA as Hex, abi: erc20Abi, functionName: "totalSupply" }),
    chain.readContract({ address: ZOLVA as Hex, abi: erc20Abi, functionName: "balanceOf", args: [DEAD as Hex] }),
    chain.getLogs({ address: ZOLVA as Hex, event: TRANSFER, args: { to: DEAD as Hex }, fromBlock: 0n, toBlock: "latest" }),
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
    feeWallet,
    credits: { ...creditTotals(ledger), reviews: usage.count ?? 0, strategies: generations.count ?? 0 },
    builtAt: Math.floor(Date.now() / 1000),
  };
  cached = { at: Date.now(), report };
  return report;
}
