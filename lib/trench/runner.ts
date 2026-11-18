import "server-only";

/**
 * The trench minute (called every minute by the Worker cron through /api/cron/trench). Gathers what
 * the engine needs once for all agents (Rushr's almost-bonded list, stats, safety, DEX paid, the
 * shared X and narrative checks, ETH price), then runs each active agent's `runMinute` in random
 * order (crowding limits apply in that order) and carries out the actions with real transactions.
 *
 * Safety: one run per minute (trench_minutes), one order per agent/minute/token/side
 * (trench_executions), an agent with an unresolved order is paused for the owner to check, and the
 * global switch (trench_settings.enabled) stops every new buy while exits keep running.
 */
import { PrivyClient } from "@privy-io/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatEther, parseAbi, parseEther, type Address, type PublicClient } from "viem";

import { env } from "../env.ts";
import { createChainClient, MAX_FEED_AGE_SECONDS } from "../prices/onchain.ts";
import { buyCallout, CALLOUT_DELAY_MS, sellComment } from "./callouts.ts";
import { decryptSecret } from "./crypto.ts";
import { curveOf, readCurve, sellOut } from "./curve.ts";
import { buySellRatio, caPosted, listStage, runMinute, socialStage, statsStage, type CandidateInput, type HeldInput, type MinuteAction, type Position, type RushrToken, type Verdict } from "./engine.ts";
import { trade, type AgentWallet, type Signer } from "./executor.ts";
import { limitsFor, parseTrenchRules, PRESET_INFO, type Market, type PresetId } from "./rules.ts";
import { commentOn, postCallout, safetyBlocked, safetyRefusesBuy, sellQuoteWei, tokenColumn, tokenRow, tokenStats } from "./rushr-api.ts";
import { dexPaidMinutes, narrative, xProfile, xTweets } from "./social.ts";

const ETH_USD_FEED: Address = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9";
const BALANCE_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const feedAbi = parseAbi(["function latestRoundData() view returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80)"]);
/** New candidates whose stats are fetched per minute, and new paid X/model checks per minute. */
const MAX_CHECKS_PER_MINUTE = 12;
const MAX_SOCIAL_PER_MINUTE = 4;
/** ETH kept in the wallet for gas and Rushr's fee on top of a buy. */
const GAS_RESERVE_ETH = 0.0003;
/** A run that started this long ago without finishing no longer blocks the next one. */
const STALE_RUN_MS = 4 * 60_000;
/** A pending order this old means a run died mid-trade: the agent is paused for the owner. */
const STALE_ORDER_MS = 5 * 60_000;

export type TrenchSettings = {
  enabled: boolean;
  new_agents_open: boolean;
  /** Wallets that may create agents while new_agents_open is false (release test). */
  test_owners: string[];
  max_agent_budget_usd: number;
  max_total_budget_usd: number;
  max_token_exposure_usd: number;
  max_buys_per_token_minute: number;
  max_agents_per_owner: number;
};

export type TrenchAgentRow = {
  id: string;
  owner: string;
  name: string;
  preset: PresetId;
  rules: unknown;
  budget_usd: number;
  status: "setup" | "active" | "paused" | "halted" | "closed";
  wallet_address: string | null;
  privy_wallet_id: string | null;
  rushr_handle: string | null;
  rushr_key_enc: string | null;
  callouts: boolean;
};

type PositionRow = {
  agent_id: string;
  token: string;
  symbol: string;
  curve: string;
  /** Raw token amounts (numeric). PostgREST returns numeric as a JSON number, which loses precision past
   *  about 16 digits, so they are always read as text (tokens_exact, tokens_bought_exact) instead. */
  tokens: string;
  tokens_bought: string;
  tokens_exact: string;
  tokens_bought_exact: string;
  cost_eth: number;
  cost_usd: number;
  opened_at: string;
  entry_bonding: number;
  high_per_token: number;
  max_gain_pct: number;
  ladders_done: number;
  added: boolean;
  last_bonding: number;
  last_bonding_at: string;
  entry_dev_pct: number;
  entry_top10_pct: number;
  narrative: string | null;
  callout_id: string | null;
  closed_at: string | null;
};

/** Every position column, plus the token amounts as exact text (see PositionRow). */
const POSITION_SELECT = "*, tokens_exact:tokens::text, tokens_bought_exact:tokens_bought::text";

export type MinuteSummary = { minute: string; ran: boolean; note?: string; agents: number; candidates: number; trades: number; errors: string[] };

const toPosition = (row: PositionRow): Position => ({
  token: row.token,
  tokens: BigInt(row.tokens_exact),
  tokensBought: BigInt(row.tokens_bought_exact),
  costEth: row.cost_eth,
  openedAtMs: Date.parse(row.opened_at),
  entryBonding: row.entry_bonding,
  highPerToken: row.high_per_token,
  maxGainPct: row.max_gain_pct,
  laddersDone: row.ladders_done,
  added: row.added,
  lastBondingMove: { bonding: row.last_bonding, atMs: Date.parse(row.last_bonding_at) },
  entryDevPct: row.entry_dev_pct,
  entryTop10Pct: row.entry_top10_pct,
});

const positionColumns = (position: Position) => ({
  tokens: position.tokens.toString(),
  tokens_bought: position.tokensBought.toString(),
  cost_eth: position.costEth,
  high_per_token: position.highPerToken,
  max_gain_pct: position.maxGainPct,
  ladders_done: position.laddersDone,
  added: position.added,
  last_bonding: position.lastBondingMove.bonding,
  last_bonding_at: new Date(position.lastBondingMove.atMs).toISOString(),
});

async function ethUsd(chain: PublicClient, nowMs: number): Promise<number> {
  const [, answer, , updatedAt] = await chain.readContract({ address: ETH_USD_FEED, abi: feedAbi, functionName: "latestRoundData" });
  if (nowMs / 1000 - Number(updatedAt) > MAX_FEED_AGE_SECONDS) throw new Error("Chainlink ETH/USD is stale");
  const price = Number(answer) / 1e8;
  if (!(price > 100)) throw new Error(`Chainlink ETH/USD looks wrong: ${price}`);
  return price;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Claims this minute. False when it already ran, or an earlier run is still going. */
async function claimMinute(db: SupabaseClient, minute: string, nowMs: number): Promise<boolean> {
  const { data: running } = await db.from("trench_minutes").select("minute, started_at").is("finished_at", null).gte("started_at", new Date(nowMs - STALE_RUN_MS).toISOString()).limit(1);
  if (running && running.length > 0) return false;
  const { error } = await db.from("trench_minutes").insert({ minute });
  return !error;
}

/** Per-token X and narrative verdict, shared by every agent; checked once and stored for good. */
async function socialVerdict(db: SupabaseClient, token: RushrToken, budget: { left: number }): Promise<{ verdict: Verdict; narrative: string | null } | null> {
  const { data } = await db.from("trench_token_checks").select("passed, reason, narrative").eq("token", token.address).maybeSingle();
  if (data) return { verdict: data.passed ? { pass: true } : { pass: false, reason: data.reason }, narrative: data.narrative };
  const xKey = env.xApiKey;
  const modelKey = env.openRouterKey;
  if (!xKey || !modelKey || !token.twitter_handle || budget.left <= 0) return null;
  budget.left -= 1;
  const [profile, tweets] = await Promise.all([xProfile(xKey, token.twitter_handle), xTweets(xKey, token.twitter_handle)]);
  const caInOwnTweets = caPosted(token.address, tweets);
  const story =
    profile.blueVerified && caInOwnTweets
      ? await narrative(modelKey, env.trenchNarrativeModel, { name: token.name, symbol: token.symbol, bio: profile.description, tweets: tweets.filter((tweet) => !tweet.isRetweet).map((tweet) => tweet.text) })
      : { ok: false, reason: "not asked (earlier X check failed)" };
  // A garbled model answer is a technical failure: ask again next minute instead of rejecting for good.
  if (story.reason === "unreadable answer") return null;
  const verdict = socialStage({ blueVerified: profile.blueVerified, hasWebsite: Boolean(profile.website || token.website), caInOwnTweets, narrative: story });
  const reason = verdict.pass ? `narrative: ${story.reason}` : verdict.reason;
  await db.from("trench_token_checks").upsert({ token: token.address, symbol: token.symbol, passed: verdict.pass, reason, narrative: story.ok ? story.reason : null });
  return { verdict, narrative: story.ok ? story.reason : null };
}

async function logDecision(db: SupabaseClient, agentId: string, action: string, reason: string, token: string | null = null, symbol: string | null = null): Promise<void> {
  const { error } = await db.from("trench_decisions").insert({ agent_id: agentId, action, reason: reason.slice(0, 500), token, symbol });
  if (error) console.error(`trench decision log failed: ${error.message}`);
}

type Shared = {
  db: SupabaseClient;
  chain: PublicClient;
  signer: Signer;
  keySecret: string;
  settings: TrenchSettings;
  ethPrice: number;
  nowMs: number;
  minute: string;
  /** Both markets' lists together, and each token's market. */
  list: RushrToken[];
  marketOf: Map<string, Market>;
  candidates: CandidateInput[];
  narratives: Map<string, string | null>;
  exposure: Map<string, number>;
  buysThisMinute: Map<string, number>;
  summary: MinuteSummary;
};

/** Market facts for one open position: curve quote, Rushr's row, stats and safety. */
async function marketFor(shared: Shared, row: PositionRow, position: Position, wallet: AgentWallet) {
  const listed = shared.list.find((token) => token.address === row.token) ?? (await tokenRow(row.token));
  const [curve, stats, blocked] = await Promise.all([row.curve ? readCurve(shared.chain, row.curve as Address) : Promise.resolve(null), tokenStats(row.token), safetyBlocked(row.token)]);
  // On the curve: its own sell quote. Graduated (or never a PONS curve): Rushr's Uniswap sell quote.
  const onCurve = curve !== null && !curve.graduated;
  const valueWei = onCurve ? sellOut(position.tokens, curve) : await sellQuoteWei(wallet.rushrKey, row.token, position.tokens, wallet.address);
  return {
    curve,
    market: {
      nowMs: shared.nowMs,
      valueEth: Number(formatEther(valueWei)),
      bonding: listed?.bonding_progress ?? 1,
      graduated: !onCurve || Boolean(listed?.migrated_at),
      devPct: listed?.dev_pct ?? position.entryDevPct,
      top10Pct: listed?.top10_pct ?? position.entryTop10Pct,
      buySell1h: buySellRatio(stats["1h"]),
      volume1hUsd: stats["1h"].volumeUsd,
      buySell6h: buySellRatio(stats["6h"]),
      safetyBlocked: blocked,
    },
  };
}

async function realisedUsd(db: SupabaseClient, agentId: string, sinceIso: string | null): Promise<number> {
  let query = db.from("trench_trades").select("pnl_usd").eq("agent_id", agentId).eq("side", "sell");
  if (sinceIso) query = query.gte("ts", sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(`loading P&L failed: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + Number(row.pnl_usd ?? 0), 0);
}

async function runAgent(shared: Shared, agent: TrenchAgentRow): Promise<void> {
  const { db, nowMs } = shared;
  if (!agent.wallet_address || !agent.privy_wallet_id || !agent.rushr_key_enc) return;
  const wallet: AgentWallet = { walletId: agent.privy_wallet_id, address: agent.wallet_address as Address, rushrKey: await decryptSecret(agent.rushr_key_enc, shared.keySecret) };

  // A run that died mid-trade leaves a pending order: stop this agent until the owner checks it.
  const { data: stuck } = await db.from("trench_executions").select("id").eq("agent_id", agent.id).eq("status", "pending").lt("created_at", new Date(nowMs - STALE_ORDER_MS).toISOString()).limit(1);
  if (stuck && stuck.length > 0) {
    if (agent.status === "active") {
      await db.from("trench_agents").update({ status: "paused", halted_reason: "An order did not finish. Check the wallet, then resume." }).eq("id", agent.id);
      await logDecision(db, agent.id, "error", "paused: an earlier order did not finish");
    }
    return;
  }

  const rules = parseTrenchRules(agent.rules, agent.preset);
  const limits = limitsFor(rules, Number(agent.budget_usd));
  const { data: rows, error } = await db.from("trench_positions").select(POSITION_SELECT).eq("agent_id", agent.id);
  if (error) throw new Error(`loading positions failed: ${error.message}`);
  const positions = (rows ?? []) as PositionRow[];
  const open = positions.filter((row) => row.closed_at === null && BigInt(row.tokens_exact) > 0n);
  const everHeld = new Set(positions.map((row) => row.token));

  const held: (HeldInput & { row: PositionRow })[] = [];
  for (const row of open) {
    try {
      const position = toPosition(row);
      const { market } = await marketFor(shared, row, position, wallet);
      held.push({ row, position, symbol: row.symbol, costUsd: row.cost_usd, market });
    } catch (cause) {
      // Without a price the position can't be judged this minute; it is tried again next minute.
      await logDecision(db, agent.id, "error", `no market data: ${(cause as Error).message}`, row.token, row.symbol);
    }
  }

  const dayStart = new Date(Math.floor(nowMs / 86_400_000) * 86_400_000).toISOString();
  const [today, total] = await Promise.all([realisedUsd(db, agent.id, dayStart), realisedUsd(db, agent.id, null)]);
  const result = runMinute({
    nowMs,
    rules,
    limits,
    book: { realisedTodayUsd: today, realisedTotalUsd: total, halted: agent.status === "halted", buysOff: !shared.settings.enabled || agent.status !== "active" },
    held,
    everHeld,
    candidates: shared.candidates,
    crowding: {
      maxTokenExposureUsd: Number(shared.settings.max_token_exposure_usd),
      maxBuysPerTokenMinute: Number(shared.settings.max_buys_per_token_minute),
      exposureUsd: shared.exposure,
      buysThisMinute: shared.buysThisMinute,
    },
  });

  if (result.halt && agent.status !== "halted") {
    await db.from("trench_agents").update({ status: "halted", halted_reason: `Total stop: losses passed $${limits.totalLossUsd}. Everything is sold; withdraw what is left.` }).eq("id", agent.id);
    await logDecision(db, agent.id, "halt", `total stop at -$${limits.totalLossUsd}`);
  }

  // One line per minute saying what it looked at, so the owner can follow every check.
  const passedList = shared.candidates.filter(({ token }) => !everHeld.has(token.address) && listStage(token, rules, nowMs).pass).length;
  const count = (kind: MinuteAction["kind"]) => result.actions.filter((action) => action.kind === kind).length;
  const scan = [
    `${shared.list.filter((token) => shared.marketOf.get(token.address) === rules.market).length} ${rules.market === "curve" ? "almost-bonded" : "graduated"} tokens`,
    `${passedList} passed the list filters`,
    `${count("skip")} rejected on deeper checks`,
    `${held.length} held`,
    `${count("buy") + count("add")} buys, ${count("sell")} sells`,
    shared.settings.enabled && agent.status === "active" ? null : "buys off",
  ]
    .filter(Boolean)
    .join(" · ");
  await logDecision(db, agent.id, "scan", scan);

  // Snapshots of holds and skips every 15 minutes keep the log readable; every trade and error is logged.
  const snapshot = Math.floor(nowMs / 60_000) % 15 === 0;
  for (const action of result.actions) {
    try {
      if (action.kind === "hold" || action.kind === "skip") {
        if (action.kind === "hold") {
          const item = held.find((entry) => entry.position.token === action.token);
          if (item) await db.from("trench_positions").update(positionColumns(action.position)).eq("agent_id", agent.id).eq("token", action.token);
        }
        if (snapshot) await logDecision(db, agent.id, action.kind, action.reason, action.token, action.symbol);
        continue;
      }
      await execute(shared, agent, wallet, action, held.find((entry) => entry.position.token === action.token)?.row ?? null);
    } catch (cause) {
      const message = (cause as Error).message.slice(0, 300);
      shared.summary.errors.push(`${agent.id.slice(0, 8)} ${action.symbol}: ${message}`);
      await logDecision(db, agent.id, "error", `${action.kind} failed: ${message}`, action.token, action.symbol);
      if (action.kind === "sell") await alertOnFailedSells(shared, agent, action.token, action.symbol);
    }
  }

  if (agent.callouts) await postCallouts(shared, agent, wallet, rules.exit.stopPct);
  await db.from("trench_agents").update({ last_run_at: new Date(nowMs).toISOString() }).eq("id", agent.id);
}

/** Claims the order slot, trades, and records the result. */
async function execute(shared: Shared, agent: TrenchAgentRow, wallet: AgentWallet, action: Exclude<MinuteAction, { kind: "hold" } | { kind: "skip" }>, row: PositionRow | null): Promise<void> {
  const { db, chain, signer, ethPrice, nowMs, minute } = shared;
  const side = action.kind === "sell" ? "sell" : "buy";
  let amountIn: bigint;
  // A full sell closes the position whatever the record says, so a record above the wallet's balance
  // (a rounded amount, a transfer tax) can never block an exit again.
  const closing = action.kind === "sell" && action.share >= 0.999;
  if (action.kind === "sell") {
    const wanted = closing ? action.position.tokens : (action.position.tokens * BigInt(Math.round(action.share * 1e6))) / 1_000_000n;
    const held = await chain.readContract({ address: action.token as Address, abi: BALANCE_ABI, functionName: "balanceOf", args: [wallet.address] });
    amountIn = closing || wanted > held ? held : wanted;
    if (amountIn <= 0n) {
      await logDecision(db, agent.id, "error", "sell skipped: the wallet holds none of this token", action.token, action.symbol);
      return;
    }
  } else {
    amountIn = parseEther((action.usd / ethPrice).toFixed(18));
    const balance = await chain.getBalance({ address: wallet.address });
    if (balance < amountIn + parseEther(String(GAS_RESERVE_ETH))) {
      await logDecision(db, agent.id, "skip", `wallet has ${Number(formatEther(balance)).toFixed(5)} ETH, not enough for a $${action.usd.toFixed(2)} buy plus gas`, action.token, action.symbol);
      return;
    }
  }
  const claim = await db.from("trench_executions").insert({ agent_id: agent.id, minute, token: action.token, side, amount_in: amountIn.toString() }).select("id").single();
  if (claim.error) return; // Already tried this minute.
  const executionId = claim.data.id as number;
  try {
    const fill = await trade(chain, signer, wallet, side, action.token as Address, amountIn);
    await db.from("trench_executions").update({ status: "confirmed", tx_hash: fill.txHash }).eq("id", executionId);
    const eth = Number(formatEther(fill.eth));
    shared.summary.trades += 1;

    if (action.kind === "sell") {
      const position = action.position;
      const soldShare = closing ? 1 : Math.min(1, Number(amountIn) / Number(position.tokens));
      const soldCostEth = position.costEth * soldShare;
      const soldCostUsd = (row?.cost_usd ?? 0) * soldShare;
      const pnlUsd = eth * ethPrice - soldCostUsd;
      await db.from("trench_trades").insert({ agent_id: agent.id, token: action.token, symbol: action.symbol, side, eth, usd: eth * ethPrice, tokens: amountIn.toString(), pnl_usd: pnlUsd, reason: action.reason, tx_hash: fill.txHash, fee_tx_hash: fill.feeTxHash });
      const left = closing || amountIn >= position.tokens ? 0n : position.tokens - amountIn;
      const next = { ...position, tokens: left, costEth: position.costEth - soldCostEth, laddersDone: action.ladderStep ?? position.laddersDone };
      await db
        .from("trench_positions")
        .update({ ...positionColumns(next), cost_usd: (row?.cost_usd ?? 0) - soldCostUsd, closed_at: left <= 0n ? new Date(nowMs).toISOString() : null })
        .eq("agent_id", agent.id)
        .eq("token", action.token);
      shared.exposure.set(action.token, Math.max(0, (shared.exposure.get(action.token) ?? 0) - soldCostUsd));
      await logDecision(db, agent.id, "sell", `sold ${(soldShare * 100).toFixed(0)}% for $${(eth * ethPrice).toFixed(2)} (P&L $${pnlUsd.toFixed(2)}): ${action.reason}`, action.token, action.symbol);
      if (agent.callouts && row?.callout_id) {
        await commentOn(wallet.rushrKey, row.callout_id, sellComment({ sharePct: soldShare * 100, eth, pnlUsd, reason: action.reason })).catch(() => undefined);
      }
      return;
    }

    const usd = eth * ethPrice;
    await db.from("trench_trades").insert({ agent_id: agent.id, token: action.token, symbol: action.symbol, side, eth, usd, tokens: fill.tokens.toString(), reason: action.reason, tx_hash: fill.txHash, fee_tx_hash: fill.feeTxHash });
    shared.exposure.set(action.token, (shared.exposure.get(action.token) ?? 0) + usd);
    shared.buysThisMinute.set(action.token, (shared.buysThisMinute.get(action.token) ?? 0) + 1);
    if (action.kind === "add") {
      const position = action.position;
      await db
        .from("trench_positions")
        .update({ ...positionColumns({ ...position, tokens: position.tokens + fill.tokens, tokensBought: position.tokensBought + fill.tokens, costEth: position.costEth + eth, added: true }), cost_usd: (row?.cost_usd ?? 0) + usd })
        .eq("agent_id", agent.id)
        .eq("token", action.token);
      await logDecision(db, agent.id, "add", `added $${usd.toFixed(2)}: ${action.reason}`, action.token, action.symbol);
      return;
    }
    const token = action.candidate;
    const curve = await curveOf(chain, token.address as Address);
    await db.from("trench_positions").insert({
      agent_id: agent.id,
      token: token.address,
      symbol: token.symbol,
      curve: curve ?? "",
      tokens: fill.tokens.toString(),
      tokens_bought: fill.tokens.toString(),
      cost_eth: eth,
      cost_usd: usd,
      opened_at: new Date(nowMs).toISOString(),
      entry_bonding: token.bonding_progress ?? 0,
      high_per_token: fill.tokens > 0n ? eth / Number(fill.tokens) : 0,
      last_bonding: token.bonding_progress ?? 0,
      last_bonding_at: new Date(nowMs).toISOString(),
      entry_dev_pct: token.dev_pct ?? 0,
      entry_top10_pct: token.top10_pct ?? 0,
      narrative: shared.narratives.get(token.address) ?? null,
    });
    await logDecision(db, agent.id, "buy", `bought $${usd.toFixed(2)}: ${action.reason}`, action.token, action.symbol);
  } catch (cause) {
    await db.from("trench_executions").update({ status: "failed", error: (cause as Error).message.slice(0, 500) }).eq("id", executionId);
    throw cause;
  }
}

/**
 * After 2 failed sells of the same token in a row, say so loudly and pause the agent (no new buys;
 * exits keep trying): an "alert" line in the agent's log (shown in red) and in the minute summary.
 * HYLIT's exit failed 906 times on 2026-11-17 without anyone noticing until Research looked.
 */
async function alertOnFailedSells(shared: Shared, agent: TrenchAgentRow, token: string, symbol: string): Promise<void> {
  const { db } = shared;
  const { data } = await db.from("trench_executions").select("status").eq("agent_id", agent.id).eq("token", token).eq("side", "sell").order("created_at", { ascending: false }).limit(10);
  let failedInARow = 0;
  for (const row of data ?? []) {
    if (row.status !== "failed") break;
    failedInARow += 1;
  }
  if (failedInARow < 2) return;
  const text = `ALERT: ${failedInARow} sells of ${symbol} failed in a row; the position can't be closed. Agent paused; exits keep trying. Check the wallet and Rushr.`;
  shared.summary.errors.push(`${agent.id.slice(0, 8)} ${text}`);
  if (agent.status === "active") {
    await db.from("trench_agents").update({ status: "paused", halted_reason: `Paused: ${failedInARow} sells of ${symbol} failed in a row.` }).eq("id", agent.id);
    agent.status = "paused";
  }
  // At 2 failures, then every 10, so the log doesn't drown in alerts.
  if (failedInARow === 2 || failedInARow % 10 === 0) await logDecision(db, agent.id, "alert", text, token, symbol);
}

/** One public call per position a few minutes after the buy, so Rushr links our entry. */
async function postCallouts(shared: Shared, agent: TrenchAgentRow, wallet: AgentWallet, stopPct: number): Promise<void> {
  const { db, nowMs } = shared;
  const { data } = await db.from("trench_positions").select("token, symbol, opened_at, cost_usd, narrative").eq("agent_id", agent.id).is("callout_id", null).is("closed_at", null);
  for (const row of data ?? []) {
    if (nowMs - Date.parse(row.opened_at) < CALLOUT_DELAY_MS) continue;
    const { data: buy } = await db.from("trench_trades").select("usd, reason").eq("agent_id", agent.id).eq("token", row.token).eq("side", "buy").order("ts").limit(1).maybeSingle();
    if (!buy) continue;
    try {
      const id = await postCallout(wallet.rushrKey, row.token, buyCallout({ symbol: row.symbol, usd: buy.usd, ruleFacts: buy.reason, narrative: row.narrative, presetName: PRESET_INFO[agent.preset].name, stopPct }));
      await db.from("trench_positions").update({ callout_id: id }).eq("agent_id", agent.id).eq("token", row.token);
    } catch (cause) {
      // Mark it so a refused call (duplicate, rate limit) is not retried every minute.
      await db.from("trench_positions").update({ callout_id: "failed" }).eq("agent_id", agent.id).eq("token", row.token);
      await logDecision(db, agent.id, "error", `call on Rushr failed: ${(cause as Error).message.slice(0, 200)}`, row.token, row.symbol);
    }
  }
}

/** Facts for every candidate that passes stage 1 for at least one agent, fetched once. */
async function gatherCandidates(shared: Shared, agents: TrenchAgentRow[]): Promise<void> {
  // Trades rank within the token's own market (the curve preset's traders check counts on it).
  const ranked = (market: Market | undefined) => shared.list.filter((token) => shared.marketOf.get(token.address) === market).sort((a, b) => (b.trades_24h ?? 0) - (a.trades_24h ?? 0));
  const rankLists = new Map<Market, RushrToken[]>([
    ["curve", ranked("curve")],
    ["graduated", ranked("graduated")],
  ]);
  const agentRules = agents.map((agent) => parseTrenchRules(agent.rules, agent.preset));
  const socialBudget = { left: MAX_SOCIAL_PER_MINUTE };
  let checked = 0;
  for (const token of shared.list) {
    const tradesRank = (rankLists.get(shared.marketOf.get(token.address) ?? "curve") ?? []).indexOf(token) + 1;
    const passesList = agentRules.some((rules) => listStage(token, rules, shared.nowMs).pass);
    if (!passesList || checked >= MAX_CHECKS_PER_MINUTE) {
      shared.candidates.push({ token, tradesRank, checks: null, social: null });
      continue;
    }
    checked += 1;
    try {
      const [stats, blocked, paid] = await Promise.all([tokenStats(token.address), safetyRefusesBuy(token.address), dexPaidMinutes(token.address, Date.parse(token.created_at)).catch(() => null)]);
      const checks = { stats, safetyBlocked: blocked, dexPaidMinutesAfterLaunch: paid };
      let social: Verdict | null = null;
      const passesStats = agentRules.some((rules) => statsStage({ ...checks, tradesRank }, rules).pass);
      if (passesStats && agentRules.some((rules) => rules.entry.requireSocial)) {
        const result = await socialVerdict(shared.db, token, socialBudget).catch(() => null);
        social = result?.verdict ?? null;
        if (result) shared.narratives.set(token.address, result.narrative);
      }
      shared.candidates.push({ token, tradesRank, checks, social });
    } catch {
      shared.candidates.push({ token, tradesRank, checks: null, social: null });
    }
  }
}

/** Every Zolva agent's open exposure per token (USD at cost). */
async function exposureByToken(db: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await db.from("trench_positions").select("token, cost_usd").is("closed_at", null);
  if (error) throw new Error(`loading exposure failed: ${error.message}`);
  const map = new Map<string, number>();
  for (const row of data ?? []) map.set(row.token, (map.get(row.token) ?? 0) + Number(row.cost_usd));
  return map;
}

export async function runTrenchMinute(db: SupabaseClient, nowMs: number = Date.now()): Promise<MinuteSummary> {
  const minute = new Date(Math.floor(nowMs / 60_000) * 60_000).toISOString();
  const summary: MinuteSummary = { minute, ran: false, agents: 0, candidates: 0, trades: 0, errors: [] };

  const { data: settingsRow, error: settingsError } = await db.from("trench_settings").select("*").eq("id", 1).single();
  if (settingsError) return { ...summary, note: `settings: ${settingsError.message}` };
  const settings = settingsRow as TrenchSettings;

  const { data: agentRows, error: agentsError } = await db
    .from("trench_agents")
    .select("id, owner, name, preset, rules, budget_usd, status, wallet_address, privy_wallet_id, rushr_handle, rushr_key_enc, callouts")
    .in("status", ["active", "paused", "halted"]);
  if (agentsError) return { ...summary, note: `agents: ${agentsError.message}` };
  const exposure = await exposureByToken(db);
  // Paused and halted agents still run their exits while they hold something.
  const holders = new Set<string>();
  if (exposure.size > 0) {
    const { data } = await db.from("trench_positions").select("agent_id").is("closed_at", null);
    for (const row of data ?? []) holders.add(row.agent_id);
  }
  const agents = (agentRows as TrenchAgentRow[]).filter((agent) => agent.status === "active" || holders.has(agent.id));
  if (agents.length === 0) return { ...summary, note: "no agents to run" };

  const privyConfig = env.privy;
  const authorizationKey = env.privyAuthorizationKey;
  const keySecret = env.trenchKeySecret;
  if (!privyConfig || !authorizationKey || !keySecret) return { ...summary, note: "Privy signer or TRENCH_KEY_SECRET not configured" };
  if (!(await claimMinute(db, minute, nowMs))) return { ...summary, note: "already ran, or an earlier run is still going" };

  try {
    const chain = createChainClient(env.robinhoodRpcUrl);
    // Each market's list only when an agent trades it.
    const markets = new Set(agents.map((agent) => parseTrenchRules(agent.rules, agent.preset).market));
    const [ethPrice, curveList, graduatedList] = await Promise.all([
      ethUsd(chain, nowMs),
      markets.has("curve") ? tokenColumn("almost") : Promise.resolve([]),
      markets.has("graduated") ? tokenColumn("migrated") : Promise.resolve([]),
    ]);
    const marketOf = new Map<string, Market>([...curveList.map((token) => [token.address, "curve"] as const), ...graduatedList.map((token) => [token.address, "graduated"] as const)]);
    const list = [...curveList, ...graduatedList.filter((token) => !curveList.some((other) => other.address === token.address))];
    const shared: Shared = {
      db,
      chain,
      signer: { privy: new PrivyClient({ appId: privyConfig.appId, appSecret: privyConfig.appSecret }), authorizationKey },
      keySecret,
      settings,
      ethPrice,
      nowMs,
      minute,
      list,
      marketOf,
      candidates: [],
      narratives: new Map(),
      exposure,
      buysThisMinute: new Map(),
      summary: { ...summary, ran: true, agents: agents.length },
    };
    const activeAgents = agents.filter((agent) => agent.status === "active");
    if (settings.enabled && activeAgents.length > 0) await gatherCandidates(shared, activeAgents);
    shared.summary.candidates = shared.candidates.filter((candidate) => candidate.checks !== null).length;
    for (const agent of shuffle(agents)) {
      try {
        await runAgent(shared, agent);
      } catch (cause) {
        shared.summary.errors.push(`${agent.id.slice(0, 8)}: ${(cause as Error).message.slice(0, 200)}`);
      }
    }
    await db.from("trench_minutes").update({ finished_at: new Date().toISOString(), summary: shared.summary }).eq("minute", minute);
    return shared.summary;
  } catch (cause) {
    const note = (cause as Error).message.slice(0, 300);
    await db.from("trench_minutes").update({ finished_at: new Date().toISOString(), summary: { ...summary, note } }).eq("minute", minute);
    return { ...summary, note };
  }
}

