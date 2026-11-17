import "server-only";

/**
 * Creating and running a trench agent, step by step (Studio, /trenches/[id]):
 *
 * 1. create: name, preset, budget and the risk screen accepted -> a "setup" row.
 * 2. wallet: the browser makes an extra Privy embedded wallet for the user; we check it belongs to
 *    the same Privy user as their login wallet, create a policy for it (lib/trench/policy.ts), the
 *    browser adds Zolva's signer with that policy, and confirm checks the signer is really on it.
 * 3. Rushr: we fetch Rushr's sign-in message, the user signs it in the browser with the agent
 *    wallet (Zolva never signs it), we register the agent and store its API key encrypted.
 * 4. fund (from the browser), then start. Pause, resume, sell everything, withdraw and close.
 *
 * Every step checks that the agent belongs to the logged-in owner.
 */
import { PrivyClient } from "@privy-io/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatEther, parseAbi, type Address, type PublicClient } from "viem";

import { env } from "../env.ts";
import { encryptSecret } from "./crypto.ts";
import { mayCreateTrenchAgent } from "./data.ts";
import { withdrawEth } from "./executor.ts";
import { maxTxWeiFor, trenchPolicyRules } from "./policy.ts";
import { isPresetId, limitsFor, PRESETS, type PresetId } from "./rules.ts";
import type { TrenchAgentRow, TrenchSettings } from "./runner.ts";
import { handleAvailable, register, registerNonce, RushrError, SIWE_PREFIX } from "./rushr-api.ts";

export class TrenchError extends Error {}

/** Least budget an agent can have: Rushr fees, gas and taxes make tiny trades pointless. */
export const MIN_BUDGET_USD = 20;
/** ETH the wallet must hold beyond the first buy before it can start (gas and Rushr's fee). */
export const START_RESERVE_ETH = 0.0005;
const HANDLE = /^[a-z0-9_]{3,20}$/;

export async function loadSettings(db: SupabaseClient): Promise<TrenchSettings> {
  const { data, error } = await db.from("trench_settings").select("*").eq("id", 1).single();
  if (error) throw new Error(`Loading trench settings failed: ${error.message}`);
  return data as TrenchSettings;
}

export async function ownAgent(db: SupabaseClient, owner: string, agentId: unknown): Promise<TrenchAgentRow & { policy_id: string | null; rushr_member_id: string | null; halted_reason: string | null }> {
  if (typeof agentId !== "string" || !/^[0-9a-f-]{36}$/.test(agentId)) throw new TrenchError("Unknown agent.");
  const { data, error } = await db.from("trench_agents").select("*").eq("id", agentId).eq("owner", owner).maybeSingle();
  if (error) throw new Error(`Loading the agent failed: ${error.message}`);
  if (!data) throw new TrenchError("Unknown agent.");
  return data;
}

function privyClient(): { privy: PrivyClient; signerId: string } {
  const config = env.privy;
  const signerId = env.privySignerId;
  if (!config || !signerId || !env.privyAuthorizationKey) throw new TrenchError("Trench agents are not available right now.");
  return { privy: new PrivyClient({ appId: config.appId, appSecret: config.appSecret }), signerId };
}

/** Chainlink ETH/USD on Robinhood Chain, for sizing the policy cap and the start check. */
async function ethUsd(chain: PublicClient): Promise<number> {
  const [, answer] = await chain.readContract({
    address: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9",
    abi: parseAbi(["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"]),
    functionName: "latestRoundData",
  });
  return Number(answer) / 1e8;
}

// ---------------------------------------------------------------- 1. create

export async function createAgent(db: SupabaseClient, owner: string, input: { name: unknown; preset: unknown; budgetUsd: unknown; callouts: unknown; riskAccepted: unknown }): Promise<string> {
  const settings = await loadSettings(db);
  if (!mayCreateTrenchAgent(settings, owner)) throw new TrenchError("Trench agents are not open yet.");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 1 || name.length > 40) throw new TrenchError("Give the agent a name of up to 40 characters.");
  if (!isPresetId(input.preset)) throw new TrenchError("Pick a preset.");
  const budget = Number(input.budgetUsd);
  if (!Number.isFinite(budget) || budget < MIN_BUDGET_USD || budget > Number(settings.max_agent_budget_usd)) {
    throw new TrenchError(`Budget must be between $${MIN_BUDGET_USD} and $${settings.max_agent_budget_usd}.`);
  }
  if (input.riskAccepted !== true) throw new TrenchError("Please read and accept the risks first.");

  const [{ count: mine }, { data: budgets }] = await Promise.all([
    db.from("trench_agents").select("id", { count: "exact", head: true }).eq("owner", owner).neq("status", "closed"),
    db.from("trench_agents").select("budget_usd").neq("status", "closed"),
  ]);
  if ((mine ?? 0) >= Number(settings.max_agents_per_owner)) throw new TrenchError(`You can run up to ${settings.max_agents_per_owner} trench agents.`);
  const total = (budgets ?? []).reduce((sum, row) => sum + Number(row.budget_usd), 0);
  if (total + budget > Number(settings.max_total_budget_usd)) throw new TrenchError("Trench agents are full right now. Try a smaller budget or come back later.");

  const { data, error } = await db
    .from("trench_agents")
    .insert({ owner, name, preset: input.preset, rules: PRESETS[input.preset as PresetId], budget_usd: budget, callouts: input.callouts !== false, risk_accepted_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) throw new Error(`Creating the agent failed: ${error.message}`);
  return data.id as string;
}

// ---------------------------------------------------------------- 2. wallet

/** The new wallet must be another embedded wallet of the same Privy user as the login wallet. */
async function sameUserWallet(privy: PrivyClient, owner: string, walletAddress: string) {
  const [main, agentWallet] = await Promise.all([
    privy.wallets().list({ address: owner, chain_type: "ethereum" }),
    privy.wallets().list({ address: walletAddress, chain_type: "ethereum" }),
  ]);
  const home = main.data?.[0];
  const found = agentWallet.data?.[0];
  if (!home) throw new TrenchError("Trench agents need a wallet made by Zolva. Log in with email or Google.");
  if (!found || !home.owner_id || found.owner_id !== home.owner_id) throw new TrenchError("That wallet does not belong to your Zolva login.");
  if (found.address.toLowerCase() === owner.toLowerCase()) throw new TrenchError("The agent needs its own wallet, not your main one.");
  return found;
}

export async function prepareWallet(db: SupabaseClient, chain: PublicClient, owner: string, agentId: unknown, walletAddress: unknown): Promise<{ signerId: string; policyId: string }> {
  const agent = await ownAgent(db, owner, agentId);
  if (agent.status !== "setup" || agent.wallet_address) throw new TrenchError("This agent already has its wallet.");
  if (typeof walletAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) throw new TrenchError("Unknown wallet.");
  const address = walletAddress.toLowerCase();
  const { count } = await db.from("trench_agents").select("id", { count: "exact", head: true }).eq("wallet_address", address);
  if ((count ?? 0) > 0) throw new TrenchError("That wallet already belongs to another agent.");
  const { privy, signerId } = privyClient();
  await sameUserWallet(privy, owner, address);
  const limits = limitsFor(PRESETS[agent.preset], Number(agent.budget_usd));
  const maxTxWei = maxTxWeiFor(limits.maxPerTokenUsd, await ethUsd(chain));
  const policy = await privy.policies().create({
    version: "1.0",
    chain_type: "ethereum",
    name: `Zolva trench ${agent.id.slice(0, 8)}`,
    // The SDK types each condition as a union; the rule objects follow it field for field.
    rules: trenchPolicyRules(address, owner, maxTxWei) as never,
  });
  return { signerId, policyId: policy.id };
}

export async function confirmWallet(db: SupabaseClient, owner: string, agentId: unknown, walletAddress: unknown, policyId: unknown): Promise<void> {
  const agent = await ownAgent(db, owner, agentId);
  if (agent.status !== "setup" || agent.wallet_address) throw new TrenchError("This agent already has its wallet.");
  if (typeof walletAddress !== "string" || typeof policyId !== "string" || !policyId) throw new TrenchError("Unknown request.");
  const { privy, signerId } = privyClient();
  const wallet = await sameUserWallet(privy, owner, walletAddress.toLowerCase());
  const signers = (wallet.additional_signers ?? []) as { signer_id: string; override_policy_ids?: string[] }[];
  const granted = signers.some((item) => item.signer_id === signerId && (item.override_policy_ids ?? []).includes(policyId));
  if (!granted) throw new TrenchError("Zolva's signer is not on the agent wallet yet. Approve it in the Privy window, then try again.");
  const { error } = await db.from("trench_agents").update({ wallet_address: wallet.address.toLowerCase(), privy_wallet_id: wallet.id, policy_id: policyId }).eq("id", agent.id);
  if (error) throw new Error(`Saving the wallet failed: ${error.message}`);
}

// ---------------------------------------------------------------- 3. Rushr

/** Handles starting with "zolva" are kept for Zolva's own agents. */
export function checkHandle(handle: unknown): string {
  const value = typeof handle === "string" ? handle.trim().toLowerCase() : "";
  if (!HANDLE.test(value)) throw new TrenchError("Handle: 3 to 20 characters, a-z, 0-9 and _.");
  if (value.startsWith("zolva")) throw new TrenchError("Handles starting with zolva are kept for Zolva's own agents.");
  return value;
}

export async function rushrNonce(db: SupabaseClient, owner: string, agentId: unknown, handle: unknown): Promise<{ message: string }> {
  const agent = await ownAgent(db, owner, agentId);
  if (!agent.wallet_address) throw new TrenchError("Set up the agent wallet first.");
  if (agent.rushr_key_enc) throw new TrenchError("This agent is already on Rushr.");
  const value = checkHandle(handle);
  const availability = await handleAvailable(value);
  if (!availability.available) throw new TrenchError(`@${value} is not available on Rushr${availability.reason ? ` (${availability.reason})` : ""}.`);
  return { message: await registerNonce(agent.wallet_address) };
}

export async function rushrRegister(db: SupabaseClient, owner: string, input: { agentId: unknown; message: unknown; signature: unknown; handle: unknown; displayName: unknown; bio: unknown }): Promise<{ handle: string }> {
  const agent = await ownAgent(db, owner, input.agentId);
  if (!agent.wallet_address) throw new TrenchError("Set up the agent wallet first.");
  if (agent.rushr_key_enc) throw new TrenchError("This agent is already on Rushr.");
  const keySecret = env.trenchKeySecret;
  if (!keySecret) throw new TrenchError("Rushr sign-up is not available right now.");
  const handle = checkHandle(input.handle);
  const message = typeof input.message === "string" ? input.message : "";
  // Only Rushr's own sign-in message for this very wallet.
  if (!message.startsWith(SIWE_PREFIX) || !message.toLowerCase().includes(agent.wallet_address) || !message.includes("Chain ID: 4663")) throw new TrenchError("Unexpected sign-in message.");
  if (typeof input.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(input.signature)) throw new TrenchError("Unexpected signature.");
  const displayName = (typeof input.displayName === "string" ? input.displayName.trim() : "").slice(0, 40) || agent.name;
  const bio = typeof input.bio === "string" ? input.bio.trim().replace(/\s+/g, " ") : "";
  if (bio.length > 160) throw new TrenchError("Bio: at most 160 characters.");
  try {
    const result = await register({ message, signature: input.signature, handle, displayName, bio });
    const sealed = await encryptSecret(result.key, keySecret);
    const { error } = await db.from("trench_agents").update({ rushr_handle: result.handle, rushr_member_id: result.memberId, rushr_key_enc: sealed }).eq("id", agent.id);
    if (error) throw new Error(`Saving the Rushr account failed: ${error.message}`);
    return { handle: result.handle };
  } catch (cause) {
    if (cause instanceof RushrError) {
      const known: Record<string, string> = {
        handle_taken: "That handle was just taken. Pick another.",
        handle_reserved: "Rushr keeps that handle. Pick another.",
        wallet_taken: "This wallet is already registered on Rushr.",
        nonce_expired: "The sign-in message expired. Try again.",
        rate_limited: "Rushr is busy. Try again in a minute.",
      };
      throw new TrenchError(known[cause.code ?? ""] ?? "Rushr refused the sign-up. Try again.");
    }
    throw cause;
  }
}

// ---------------------------------------------------------------- 4. run

export type AgentWalletStatus = { eth: number; ethUsd: number; startNeedsEth: number };

export async function walletStatus(chain: PublicClient, agent: Pick<TrenchAgentRow, "wallet_address" | "preset" | "budget_usd">): Promise<AgentWalletStatus | null> {
  if (!agent.wallet_address) return null;
  const [balance, price] = await Promise.all([chain.getBalance({ address: agent.wallet_address as Address }), ethUsd(chain)]);
  const limits = limitsFor(PRESETS[agent.preset], Number(agent.budget_usd));
  return { eth: Number(formatEther(balance)), ethUsd: price, startNeedsEth: limits.firstBuyUsd / price + START_RESERVE_ETH };
}

export async function setRunState(db: SupabaseClient, chain: PublicClient, owner: string, agentId: unknown, action: unknown): Promise<void> {
  const agent = await ownAgent(db, owner, agentId);
  const update = (values: Record<string, unknown>) => db.from("trench_agents").update(values).eq("id", agent.id).then(({ error }) => {
    if (error) throw new Error(`Updating the agent failed: ${error.message}`);
  });
  if (action === "start" || action === "resume") {
    if (agent.status !== "setup" && agent.status !== "paused") throw new TrenchError("This agent can't start from here.");
    if (!agent.wallet_address || !agent.rushr_key_enc) throw new TrenchError("Finish the wallet and Rushr steps first.");
    const status = await walletStatus(chain, agent);
    if (!status || status.eth < status.startNeedsEth) throw new TrenchError(`Fund the agent wallet with at least ${status?.startNeedsEth.toFixed(4) ?? "?"} ETH first.`);
    return update({ status: "active", halted_reason: null });
  }
  if (action === "pause") {
    if (agent.status !== "active") throw new TrenchError("Only a running agent can be paused.");
    return update({ status: "paused" });
  }
  if (action === "sell_all") {
    // Halted agents sell everything on the next minute and never buy again.
    if (agent.status === "closed" || agent.status === "setup") throw new TrenchError("Nothing to sell.");
    return update({ status: "halted", halted_reason: "You asked to sell everything." });
  }
  throw new TrenchError("Unknown request.");
}

/** Sends the agent wallet's ETH back to the owner's main wallet and closes the agent for good. */
export async function withdrawAndClose(db: SupabaseClient, chain: PublicClient, owner: string, agentId: unknown): Promise<{ txHash: string | null }> {
  const agent = await ownAgent(db, owner, agentId);
  if (agent.status === "active") throw new TrenchError("Pause the agent (or sell everything) first.");
  if (!agent.wallet_address || !agent.privy_wallet_id) {
    await db.from("trench_agents").update({ status: "closed" }).eq("id", agent.id);
    return { txHash: null };
  }
  const { count } = await db.from("trench_positions").select("token", { count: "exact", head: true }).eq("agent_id", agent.id).is("closed_at", null);
  if ((count ?? 0) > 0) throw new TrenchError("The agent still holds tokens. Use Sell everything and wait a minute.");
  const authorizationKey = env.privyAuthorizationKey;
  const { privy } = privyClient();
  const txHash = await withdrawEth(chain, { privy, authorizationKey: authorizationKey! }, { walletId: agent.privy_wallet_id, address: agent.wallet_address as Address }, owner as Address);
  const { error } = await db.from("trench_agents").update({ status: "closed" }).eq("id", agent.id);
  if (error) throw new Error(`Closing the agent failed: ${error.message}`);
  return { txHash };
}
