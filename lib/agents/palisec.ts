import { getAddress, isAddress, keccak256, toHex } from "viem";

/**
 * Palisec link (docs/outreach-palisec.md). An agent's owner may name the Palisec smart account
 * the agent belongs to; Palisec names the agent back on chain with
 * AgentLinks.setLink(keccak256("zolva"), agentId). Both sides naming each other = linked.
 */

/** Robinhood Chain mainnet: the only chain a Palisec account is read on. */
export const PALISEC_CHAIN_ID = 4663;

/** Palisec's AgentLinks registry on Robinhood Chain. linkOf ABI checked on chain 2026-11-24. */
export const AGENT_LINKS_ADDRESS = "0x737f1AcF46acE6d403977eB4944845fD251fC8C6";
export const AGENT_LINKS_ABI = [
  {
    type: "function",
    name: "linkOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "key", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

/** The AgentLinks key Palisec writes Zolva agent ids under. */
export const ZOLVA_LINK_KEY = keccak256(toHex("zolva"));

/** Where the agent page sends people to check a Palisec account. */
export const PALISEC_DETECT_URL = "https://palisec.tech/docs/detect";

export type PalisecAccount = { chainId: typeof PALISEC_CHAIN_ID; address: string };

/**
 * Owner input to the stored value: a checksummed address, or null to clear.
 * Empty or whitespace clears; anything else must be a 0x EVM address.
 */
export function parsePalisecAccount(input: unknown): { ok: true; address: string | null } | { ok: false; error: string } {
  if (input === null) return { ok: true, address: null };
  if (typeof input !== "string") return { ok: false, error: "Enter an address or leave it empty." };
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, address: null };
  // strict: false accepts any casing; a wrong mixed-case checksum is still a valid address here,
  // and we store the correct checksum either way.
  if (!isAddress(trimmed, { strict: false })) return { ok: false, error: "That is not an EVM address (0x followed by 40 hex characters)." };
  if (/^0x0{40}$/i.test(trimmed)) return { ok: false, error: "The zero address cannot be a Palisec account." };
  return { ok: true, address: getAddress(trimmed) };
}

/** The public API shape: { chainId: 4663, address } or null when not set. */
export function publicPalisecAccount(stored: string | null | undefined): PalisecAccount | null {
  return stored ? { chainId: PALISEC_CHAIN_ID, address: stored } : null;
}
