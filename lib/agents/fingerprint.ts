/**
 * Rules fingerprint: SHA-256 of the settings that decide how an agent trades, recorded once
 * (agents.rules_hash, written when the agent is made and never changed by the database).
 *
 * It covers what the engine reads (agentParams) plus the markets in the order the engine reads
 * them, because that order decides which buy gets the cash first. Left out: name, capital, paper
 * or live, launch prices, the DCA first-buy hour, the backtest figure shown next to a portfolio,
 * and the AI co-pilot (it can only veto a rule's trade). A preset is recorded by its name: its
 * rules live in the open source engine, not in the fingerprint.
 *
 * It is not proof against Zolva itself, which holds the database; anchoring on chain is later work.
 *
 * Server only (node:crypto). Scripts import it too, so imports stay relative.
 */
import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json.ts";
import { agentParams, type AgentRow } from "./plan.ts";

export const FINGERPRINT_VERSION = "zr1";

export type FingerprintAgent = Pick<AgentRow, "strategy" | "params" | "token_addresses">;

export type Fingerprint = {
  /** The hash recorded for this agent. */
  sha256: string;
  version: string;
  /** The exact text of the current settings: SHA-256 of it equals sha256 while nothing changed. */
  input: string;
  /** When the hash was recorded, ISO. Later than the agent's start for agents made before fingerprints. */
  recordedAt: string;
  /** The current settings still hash to the recorded value. */
  matches: boolean;
};

/** The canonical text that is hashed. Changing it needs a new FINGERPRINT_VERSION and new hashes. */
export function fingerprintInput(agent: FingerprintAgent): string {
  const params = agentParams(agent as AgentRow);
  return canonicalJson({
    version: FINGERPRINT_VERSION,
    strategy: params.strategy,
    rules: params.rules,
    maxPositionPct: params.maxPositionPct,
    stopLossPct: params.stopLossPct,
    venue: params.venue === "perps" ? "perps" : "spot",
    leverage: params.leverage,
    sizing: params.sizing,
    portfolio: params.portfolio ? { leverage: params.portfolio.leverage } : undefined,
    dca: params.dca ? { buys: params.dca.buys, everyHours: params.dca.everyHours } : undefined,
    markets: agent.token_addresses.map((address) => address.toLowerCase()),
  });
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export function rulesFingerprint(agent: FingerprintAgent): string {
  return sha256(fingerprintInput(agent));
}

/** What the agent page and the public API show; null until a hash is recorded. */
export function readFingerprint(agent: FingerprintAgent & { rules_hash?: string | null; rules_hash_at?: string | null }): Fingerprint | null {
  if (!agent.rules_hash || !agent.rules_hash_at) return null;
  const input = fingerprintInput(agent);
  return {
    sha256: agent.rules_hash,
    version: FINGERPRINT_VERSION,
    input,
    recordedAt: new Date(agent.rules_hash_at).toISOString(),
    matches: sha256(input) === agent.rules_hash,
  };
}
