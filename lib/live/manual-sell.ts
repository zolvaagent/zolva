import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeEventLog, erc20Abi, type Hex, type PublicClient } from "viem";

import { SWAP_ROUTER_02, USDG } from "@/lib/live/contracts";

export class ManualSellError extends Error {}

const FEED_ABI = [
  { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }] },
] as const;
/** Chainlink ETH/USD on Robinhood Chain, for the gas cost in USD (same feed as the live runner). */
const ETH_USD_FEED = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9";

/** Net amount of `token` that moved out of (negative) or into (positive) `wallet` in a receipt's logs. */
export function netTransfer(logs: { address: string; data: Hex; topics: Hex[] }[], token: string, wallet: string): bigint {
  let net = 0n;
  for (const log of logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (event.eventName !== "Transfer") continue;
      if (event.args.to.toLowerCase() === wallet.toLowerCase()) net += event.args.value;
      if (event.args.from.toLowerCase() === wallet.toLowerCase()) net -= event.args.value;
    } catch {
      // Not a Transfer: ignore.
    }
  }
  return net;
}

/**
 * Records a sale the owner of a live agent signed themselves (Sell position): the swap must
 * be confirmed, sent by the agent's trading wallet to SwapRouter02, and swap one of the
 * agent's holdings for USDG paid back into the wallet. The amounts come from the token
 * Transfer logs, not from the request. Recording the same transaction twice fails.
 */
export async function recordManualSell(db: SupabaseClient, chain: PublicClient, options: { owner: string; agentId: string; txHash: Hex }) {
  const { data: agent, error } = await db.from("agents").select("id, owner, mode, trading_wallet").eq("id", options.agentId).maybeSingle();
  if (error) throw new Error(`Loading the agent failed: ${error.message}`);
  if (!agent || agent.owner !== options.owner || agent.mode !== "live" || !agent.trading_wallet) throw new ManualSellError("Only the owner of a live agent can record a sale for it.");
  const wallet = agent.trading_wallet.toLowerCase();

  let receipt;
  try {
    receipt = await chain.getTransactionReceipt({ hash: options.txHash });
  } catch {
    throw new ManualSellError("The swap is not confirmed yet. Try again in a moment.");
  }
  if (receipt.status !== "success") throw new ManualSellError("The swap failed on chain, so there is nothing to record.");
  if (receipt.from.toLowerCase() !== wallet) throw new ManualSellError("The swap was not sent from this agent's trading wallet.");
  if (receipt.to?.toLowerCase() !== SWAP_ROUTER_02) throw new ManualSellError("This transaction is not a Uniswap swap.");

  const { data: positions, error: positionsError } = await db.from("positions").select("token_address, quantity").eq("agent_id", agent.id).eq("side", "long");
  if (positionsError) throw new Error(`Loading positions failed: ${positionsError.message}`);
  const logs = receipt.logs.map((log) => ({ address: log.address, data: log.data, topics: log.topics as Hex[] }));
  const received = netTransfer(logs, USDG, wallet);
  const sold = positions.map((position) => ({ token: position.token_address as string, net: netTransfer(logs, position.token_address, wallet) })).find((row) => row.net < 0n);
  if (!sold || received <= 0n) throw new ManualSellError("This swap did not sell one of the agent's holdings for USDG.");

  const { data: token, error: tokenError } = await db.from("tokens").select("token_decimals").eq("address", sold.token).single();
  if (tokenError) throw new Error(`Loading the token failed: ${tokenError.message}`);
  const quantity = Number(-sold.net) / 10 ** Number(token.token_decimals);
  const usdg = Number(received) / 1e6;
  const [, ethAnswer] = await chain.readContract({ address: ETH_USD_FEED, abi: FEED_ABI, functionName: "latestRoundData" }).catch(() => [0n, 0n] as const);
  const gasCostUsd = (Number(receipt.gasUsed * receipt.effectiveGasPrice) / 1e18) * (Number(ethAnswer) / 1e8);

  const { data: tradeId, error: recordError } = await db.rpc("record_manual_sell", {
    p_agent: agent.id,
    p_token: sold.token,
    p_quantity: quantity,
    p_usdg: usdg,
    p_tx_hash: options.txHash.toLowerCase(),
    p_gas_cost_usd: gasCostUsd,
  });
  if (recordError) {
    if (recordError.code === "23505") throw new ManualSellError("This swap is already recorded.");
    if (recordError.message.includes("manual_sell:")) throw new ManualSellError(recordError.message.replace(/^.*manual_sell: /, "").replace(/^./, (c) => c.toUpperCase()) + ".");
    throw new Error(`Recording the sale failed: ${recordError.message}`);
  }
  return { tradeId: tradeId as number, quantity, usdg, price: usdg / quantity };
}
