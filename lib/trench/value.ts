import "server-only";

/**
 * What a trench agent is worth right now: the ETH in its wallet plus every open token at its
 * on-chain curve sell quote (fees and tax included), in USD at Chainlink ETH/USD. Read only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatEther, parseAbi, type Address, type PublicClient } from "viem";

import { readCurve, sellOut } from "./curve.ts";

const ETH_USD_FEED: Address = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9";
const feedAbi = parseAbi(["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"]);

/** USD value per agent id; agents without a wallet, or whose reads fail, are left out. */
export async function agentValuesUsd(db: SupabaseClient, chain: PublicClient, agents: { id: string; walletAddress: string | null }[]): Promise<Map<string, number>> {
  const withWallet = agents.filter((agent) => agent.walletAddress);
  const values = new Map<string, number>();
  if (withWallet.length === 0) return values;
  const [, answer] = await chain.readContract({ address: ETH_USD_FEED, abi: feedAbi, functionName: "latestRoundData" });
  const ethUsd = Number(answer) / 1e8;
  const { data: open } = await db
    .from("trench_positions")
    .select("agent_id, curve, tokens")
    .in(
      "agent_id",
      withWallet.map((agent) => agent.id),
    )
    .is("closed_at", null);
  await Promise.all(
    withWallet.map(async (agent) => {
      try {
        const balance = await chain.getBalance({ address: agent.walletAddress as Address });
        let eth = Number(formatEther(balance));
        for (const position of (open ?? []).filter((row) => row.agent_id === agent.id)) {
          const curve = await readCurve(chain, position.curve as Address);
          eth += Number(formatEther(sellOut(BigInt(position.tokens), curve)));
        }
        values.set(agent.id, eth * ethUsd);
      } catch {
        // No value shown for this agent rather than a wrong one.
      }
    }),
  );
  return values;
}
