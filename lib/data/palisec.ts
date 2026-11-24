import "server-only";

import { AGENT_LINKS_ABI, AGENT_LINKS_ADDRESS, ZOLVA_LINK_KEY } from "@/lib/agents/palisec";
import { env } from "@/lib/env";
import { createChainClient } from "@/lib/prices/onchain";

/** linked: the account names this agent on chain. pending: it names nothing or another agent. unknown: the read failed. */
export type PalisecLinkStatus = "linked" | "pending" | "unknown";

// Per isolate; a Worker isolate lives minutes, so this only spares repeat page views.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { status: PalisecLinkStatus; at: number }>();

/**
 * Whether the Palisec account names this agent back: AgentLinks.linkOf(account, keccak256("zolva"))
 * must equal the agent id. Never throws; a failed read is "unknown" and is not cached.
 */
export async function palisecLinkStatus(account: string, agentId: string): Promise<PalisecLinkStatus> {
  const key = `${account}:${agentId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.status;
  try {
    const chain = createChainClient(env.robinhoodRpcUrl);
    const named = await chain.readContract({ address: AGENT_LINKS_ADDRESS, abi: AGENT_LINKS_ABI, functionName: "linkOf", args: [account as `0x${string}`, ZOLVA_LINK_KEY] });
    const status: PalisecLinkStatus = named === agentId ? "linked" : "pending";
    cache.set(key, { status, at: Date.now() });
    return status;
  } catch (cause) {
    // Short on purpose: viem errors can carry the RPC URL, which holds a key.
    console.error("Palisec link read failed:", cause instanceof Error ? cause.name : "unknown");
    return "unknown";
  }
}
