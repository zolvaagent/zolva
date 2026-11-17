import "server-only";

/**
 * Creating and running a trench agent (Studio, /trenches/[id]). No Privy popups: the user fills one
 * form and the server does the rest.
 *
 * 1. create: name, preset, budget and the risk screen accepted -> a "setup" row.
 * 2. setup (server, resumable step by step if anything fails):
 *    a. a new Privy wallet, owned for the moment by Zolva's key quorum (it is empty);
 *    b. Rushr sign-up: Rushr's own sign-in message for that wallet, signed by Zolva as its owner
 *       (the user picked the handle and accepted it on the form), API key stored encrypted;
 *    c. the agent policy (lib/trench/policy.ts), then ownership moves to the user's Privy account
 *       with Zolva kept only as a signer under that policy. From here the wallet is the user's.
 * 3. fund (any wallet), then start. Pause, resume, sell everything, withdraw and close.
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

// ---------------------------------------------------------------- 2. setup

/** Handles starting with "zolva" are kept for Zolva's own agents. */
export function checkHandle(handle: unknown): string {
  const value = typeof handle === "string" ? handle.trim().toLowerCase() : "";
  if (!HANDLE.test(value)) throw new TrenchError("Handle: 3 to 20 characters, a-z, 0-9 and _.");
  if (value.startsWith("zolva")) throw new TrenchError("Handles starting with zolva are kept for Zolva's own agents.");
  return value;
}

export function checkBio(bio: unknown): string {
  const value = typeof bio === "string" ? bio.trim().replace(/\s+/g, " ") : "";
  if (value.length > 160) throw new TrenchError("Bio: at most 160 characters.");
  return value;
}

const RUSHR_ERRORS: Record<string, string> = {
  handle_taken: "That handle was just taken. Pick another.",
  handle_reserved: "Rushr keeps that handle. Pick another.",
  handle_invalid: "Rushr refused that handle. Pick another.",
  wallet_taken: "This wallet is already registered on Rushr.",
  nonce_expired: "Rushr's sign-in timed out. Try again.",
  rate_limited: "Rushr is busy. Try again in a minute.",
};

/**
 * Wallet, Rushr sign-up and hand-over to the user, in that order. Each part is saved as it finishes,
 * so a retry continues where it stopped (a wallet is never made twice for one agent).
 */
export async function setupAgent(db: SupabaseClient, chain: PublicClient, owner: string, agentId: unknown, input: { handle: unknown; bio: unknown }): Promise<void> {
  let agent = await ownAgent(db, owner, agentId);
  if (agent.status !== "setup") throw new TrenchError("This agent is already set up.");
  if (agent.policy_id) return;
  const keySecret = env.trenchKeySecret;
  const authorizationKey = env.privyAuthorizationKey;
  if (!keySecret || !authorizationKey) throw new TrenchError("Trench agents are not available right now.");
  const { privy, signerId } = privyClient();
  const auth = { authorization_private_keys: [authorizationKey] };
  const save = async (values: Record<string, unknown>) => {
    const { error } = await db.from("trench_agents").update(values).eq("id", agent.id);
    if (error) throw new Error(`Saving the agent failed: ${error.message}`);
    agent = { ...agent, ...values };
  };

  // The user's Privy account, which will own the wallet. Wallet logins (no Privy account) can't.
  const user = await privy
    .users()
    .getByWalletAddress({ address: owner })
    .catch(() => null);
  if (!user?.id) throw new TrenchError("Trench agents need the wallet Zolva makes for you. Log in with email or Google.");

  // a. The wallet, owned by Zolva's key quorum until the hand-over.
  if (!agent.privy_wallet_id) {
    const wallet = await privy.wallets().create({ chain_type: "ethereum", owner_id: signerId, idempotency_key: `trench-wallet-${agent.id}` });
    await save({ privy_wallet_id: wallet.id, wallet_address: wallet.address.toLowerCase() });
  }
  const walletId = agent.privy_wallet_id!;
  const address = agent.wallet_address!;

  // b. Rushr sign-up.
  if (!agent.rushr_key_enc) {
    const handle = checkHandle(input.handle);
    const bio = checkBio(input.bio);
    try {
      const availability = await handleAvailable(handle);
      if (!availability.available) throw new TrenchError(`@${handle} is not available on Rushr${availability.reason ? ` (${availability.reason})` : ""}.`);
      const message = await registerNonce(address);
      // Only Rushr's own sign-in message for this very wallet on Robinhood Chain.
      if (!message.startsWith(SIWE_PREFIX) || !message.toLowerCase().includes(address) || !message.includes("Chain ID: 4663")) throw new TrenchError("Rushr sent an unexpected sign-in message.");
      const signed = await privy.wallets().ethereum().signMessage(walletId, { message, authorization_context: auth });
      const result = await register({ message, signature: signed.signature, handle, displayName: agent.name, bio });
      await save({ rushr_handle: result.handle, rushr_member_id: result.memberId, rushr_key_enc: await encryptSecret(result.key, keySecret) });
    } catch (cause) {
      if (cause instanceof RushrError) throw new TrenchError(RUSHR_ERRORS[cause.code ?? ""] ?? "Rushr refused the sign-up. Try again.");
      throw cause;
    }
  }

  // c. Policy, then the wallet moves to the user with Zolva as a signer under that policy only.
  const limits = limitsFor(PRESETS[agent.preset], Number(agent.budget_usd));
  const maxTxWei = maxTxWeiFor(limits.maxPerTokenUsd, await ethUsd(chain));
  const policy = await privy.policies().create({
    version: "1.0",
    chain_type: "ethereum",
    name: `Zolva trench ${agent.id.slice(0, 8)}`,
    // The SDK types each condition as a union; the rule objects follow it field for field.
    rules: trenchPolicyRules(address, owner, maxTxWei) as never,
  });
  const moved = await privy.wallets().update(walletId, {
    owner: { user_id: user.id },
    additional_signers: [{ signer_id: signerId, override_policy_ids: [policy.id] }],
    authorization_context: auth,
  });
  const signers = (moved.additional_signers ?? []) as { signer_id: string; override_policy_ids?: string[] }[];
  if (moved.owner_id === signerId || !signers.some((item) => item.signer_id === signerId && (item.override_policy_ids ?? []).includes(policy.id))) {
    throw new Error("Privy did not hand the wallet over as asked");
  }
  await save({ policy_id: policy.id });
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
    if (!agent.wallet_address || !agent.rushr_key_enc || !agent.policy_id) throw new TrenchError("Finish the setup first.");
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
