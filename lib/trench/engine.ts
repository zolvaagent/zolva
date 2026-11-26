/**
 * The trench decision engine: `runMinute` is the only place a trench agent decides (CLAUDE.md engine
 * rule). Pure: the runner (lib/trench/runner.ts) gathers prices, Rushr data and checks, calls this,
 * then carries out the actions. Ported from the Zolva Lab agent (zolva-lab-agent src/rules.ts,
 * exits.ts, limits.ts); lib/trench/engine.test.ts holds the Lab's cases so both trade the same way.
 *
 * Order each minute: open positions first (exits never wait), then new candidates. Every action and
 * every rejection carries a plain reason.
 */
import type { ExitRules, Limits, RiskLevel, TrenchRules } from "./rules.ts";

/** One token from GET api.rushr.trade/tokens?column=almost (the fields used). */
export type RushrToken = {
  address: string;
  symbol: string;
  name: string;
  launchpad: string;
  status: string;
  quote: string;
  created_at: string;
  migrated_at: string | null;
  market_cap_usd: number | null;
  ath_market_cap_usd: number | null;
  bonding_progress: number | null;
  dev_pct: number | null;
  fresh_pct: number | null;
  top10_pct: number | null;
  trades_24h: number | null;
  twitter_handle: string | null;
  website: string | null;
  buy_tax_bps: number | null;
  sell_tax_bps: number | null;
  no_sells: boolean;
  farm: boolean;
  spam: boolean;
  /** Graduated tokens (column=migrated) also carry these. */
  holders?: number | null;
  volume_24h_usd?: number | null;
  risk?: string | null;
  snipers_pct?: number | null;
  bundled_pct?: number | null;
};

type Window = { buyUsd: number; sellUsd: number; makers: number; buys: number; sells: number; volumeUsd: number };
/** GET /tokens/<a>/stats. */
export type RushrStats = Record<"5m" | "1h" | "6h" | "24h", Window>;

export type Verdict = { pass: true } | { pass: false; reason: string };
const no = (reason: string): Verdict => ({ pass: false, reason });
const PASS: Verdict = { pass: true };

const NATIVE_ETH = "0x0000000000000000000000000000000000000000";

// ---------------------------------------------------------------- entry stages

export function pullbackPct(token: Pick<RushrToken, "market_cap_usd" | "ath_market_cap_usd">): number | null {
  if (!token.market_cap_usd || !token.ath_market_cap_usd) return null;
  return (1 - token.market_cap_usd / token.ath_market_cap_usd) * 100;
}

const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

/** Stage 1 for graduated tokens (Uniswap, after the curve): list fields only. */
function graduatedListStage(token: RushrToken, rules: TrenchRules, nowMs: number): Verdict {
  const r = rules.entry;
  if (!token.migrated_at) return no("not graduated yet");
  if (token.quote !== NATIVE_ETH) return no("not quoted in ETH");
  if (token.no_sells || token.spam) return no("flagged: no sells or spam");
  const sinceGraduation = (nowMs - Date.parse(token.migrated_at)) / 3_600_000;
  if (sinceGraduation < r.minHoursSinceGraduation) return no(`graduated ${sinceGraduation.toFixed(1)}h ago, waits ${r.minHoursSinceGraduation}h`);
  const ageHours = (nowMs - Date.parse(token.created_at)) / 3_600_000;
  if (!(ageHours < r.maxAgeHours)) return no(`age ${ageHours.toFixed(1)}h is not under ${r.maxAgeHours}h`);
  if ((token.buy_tax_bps ?? 9999) > r.maxTaxBps || (token.sell_tax_bps ?? 9999) > r.maxTaxBps) return no(`tax ${token.buy_tax_bps}/${token.sell_tax_bps} bps above ${r.maxTaxBps}`);
  if ((token.dev_pct ?? 100) > r.maxDevPct) return no(`dev holds ${token.dev_pct}%`);
  if ((token.fresh_pct ?? 100) >= r.maxFreshPct) return no(`fresh wallets ${token.fresh_pct}%`);
  if ((token.top10_pct ?? 100) > r.maxTop10Pct) return no(`top 10 hold ${token.top10_pct}%`);
  if ((token.snipers_pct ?? 100) > r.maxSnipersPct) return no(`snipers bought ${token.snipers_pct}%`);
  if ((token.bundled_pct ?? 100) > r.maxBundledPct) return no(`launch bundle ${token.bundled_pct}%`);
  if ((token.holders ?? 0) < r.minHolders) return no(`${token.holders ?? 0} holders`);
  if ((token.volume_24h_usd ?? 0) < r.minVolume24hUsd) return no(`24h volume $${Math.round(token.volume_24h_usd ?? 0)}`);
  const risk = (token.risk ?? "high") as RiskLevel;
  if (!(risk in RISK_ORDER) || RISK_ORDER[risk] > RISK_ORDER[r.maxRisk]) return no(`Rushr risk ${token.risk ?? "unknown"}`);
  return PASS;
}

/** Stage 1: list fields only (free, every minute). */
export function listStage(token: RushrToken, rules: TrenchRules, nowMs: number): Verdict {
  if (rules.market === "graduated") return graduatedListStage(token, rules, nowMs);
  const r = rules.entry;
  if (token.launchpad !== "pons") return no("not a PONS token");
  if (token.migrated_at) return no("already graduated");
  if (token.quote !== NATIVE_ETH) return no("curve not quoted in ETH");
  // Rushr's "farm"/copycat labels are not a filter (Lab decision); no-sells and spam are.
  if (token.no_sells || token.spam) return no("flagged: no sells or spam");
  const ageHours = (nowMs - Date.parse(token.created_at)) / 3_600_000;
  if (!(ageHours < r.maxAgeHours)) return no(`age ${ageHours.toFixed(1)}h is not under ${r.maxAgeHours}h`);
  const bonding = token.bonding_progress ?? -1;
  if (bonding < r.minBonding || bonding > r.maxBonding) return no(`bonding ${(bonding * 100).toFixed(0)}% outside ${Math.round(r.minBonding * 100)} to ${Math.round(r.maxBonding * 100)}%`);
  if ((token.buy_tax_bps ?? 9999) > r.maxTaxBps || (token.sell_tax_bps ?? 9999) > r.maxTaxBps) return no(`tax ${token.buy_tax_bps}/${token.sell_tax_bps} bps above ${r.maxTaxBps}`);
  if ((token.dev_pct ?? 100) > r.maxDevPct) return no(`dev holds ${token.dev_pct}%`);
  if ((token.fresh_pct ?? 100) >= r.maxFreshPct) return no(`fresh wallets ${token.fresh_pct}%`);
  const pullback = pullbackPct(token);
  if (pullback === null || pullback < r.minPullbackPct || pullback > r.maxPullbackPct) return no(`pullback ${pullback?.toFixed(0) ?? "?"}% from the high, not ${r.minPullbackPct} to ${r.maxPullbackPct}%`);
  if (r.requireSocial && !token.twitter_handle) return no("no X account");
  return PASS;
}

/** Buy dollars over sell dollars in a window; null without trades. */
export function buySellRatio(window: Pick<Window, "buyUsd" | "sellUsd">): number | null {
  return window.sellUsd > 0 ? window.buyUsd / window.sellUsd : window.buyUsd > 0 ? Infinity : null;
}

/** Stage 2: stats, Rushr safety and DEX paid. `tradesRank` is 1 for the most traded token in the list. */
export function statsStage(input: { stats: RushrStats; tradesRank: number; safetyBlocked: boolean; dexPaidMinutesAfterLaunch: number | null }, rules: TrenchRules): Verdict {
  const r = rules.entry;
  const x = rules.exit;
  if (input.safetyBlocked) return no("Rushr safety: blocked");
  const traders = input.stats["24h"].makers;
  if (traders < r.minTraders24h && input.tradesRank > r.topTradesRank) return no(`${traders} traders in 24h and trades rank ${input.tradesRank}`);
  // Never buy what the exit would sell a minute later (Lab fix of 2026-11-17).
  const lastHour = buySellRatio(input.stats["1h"]);
  if (input.stats["1h"].volumeUsd >= x.minVolume1hUsd && lastHour !== null && lastHour < x.minBuySell1h) {
    return no(`1h buy/sell ${lastHour.toFixed(2)} under ${x.minBuySell1h}: sellers lead right now`);
  }
  const ratio = buySellRatio(input.stats["6h"]);
  if (ratio === null || ratio < r.minBuySell6h) return no(`6h buy/sell ${ratio?.toFixed(2) ?? "none"} under ${r.minBuySell6h}`);
  if (!r.requireDexPaid) return PASS;
  if (input.dexPaidMinutesAfterLaunch === null) return no("DEX not paid");
  if (input.dexPaidMinutesAfterLaunch > r.maxDexPaidMinutes) return no(`DEX paid ${input.dexPaidMinutesAfterLaunch.toFixed(0)} min after launch`);
  return PASS;
}

/** Stage 3: the project's own X account and the narrative (AI may only veto). */
export function socialStage(input: { blueVerified: boolean; hasWebsite: boolean; caInOwnTweets: boolean; narrative: { ok: boolean; reason: string } }): Verdict {
  if (!input.blueVerified) return no("X account has no blue check");
  if (!input.hasWebsite) return no("X account has no website");
  if (!input.caInOwnTweets) return no("contract address not posted by its own X account");
  if (!input.narrative.ok) return no(`narrative: ${input.narrative.reason}`);
  return PASS;
}

/** True when one of the account's own tweets (not retweets) contains the token address. */
export function caPosted(address: string, tweets: { text: string; isRetweet: boolean }[]): boolean {
  const needle = address.toLowerCase();
  return tweets.some((tweet) => !tweet.isRetweet && tweet.text.toLowerCase().includes(needle));
}

// ---------------------------------------------------------------- exits

export type Position = {
  token: string;
  /** Tokens held now (base units). */
  tokens: bigint;
  /** Tokens bought in total (for the ladder shares). */
  tokensBought: bigint;
  /** ETH spent on the tokens still held (average cost basis). */
  costEth: number;
  openedAtMs: number;
  entryBonding: number;
  /** Highest net value per token seen since entry (ETH). */
  highPerToken: number;
  maxGainPct: number;
  laddersDone: number;
  added: boolean;
  lastBondingMove: { bonding: number; atMs: number };
  entryDevPct: number;
  entryTop10Pct: number;
  /** One-minute closes in a row at or below the stop (exit v2 confirms the stop over N minutes). */
  stopHits: number;
  /** The token's launch (moonbag time limit). Missing on positions opened before it was stored: opening time then. */
  launchedAtMs?: number;
};

export type Market = {
  nowMs: number;
  /** Net ETH for selling all `tokens` right now (curve quote, fees and tax included). */
  valueEth: number;
  bonding: number;
  graduated: boolean;
  devPct: number;
  top10Pct: number;
  buySell1h: number | null;
  volume1hUsd: number;
  buySell6h: number | null;
  safetyBlocked: boolean;
};

/**
 * Why a position was sold: decides whether the token may be bought again (only after "flow" or
 * "time", see EntryRules.reentryEnabled).
 */
export type ExitKind = "stop" | "lock" | "red" | "flow" | "graduation" | "time" | "trail" | "ladder" | "halt";

export type ExitAction = { kind: "hold"; reason: string } | { kind: "sell"; share: number; reason: string; ladderStep?: number; exitKind: ExitKind } | { kind: "add"; reason: string };

export function gainPct(position: Pick<Position, "costEth">, valueEth: number): number {
  return position.costEth > 0 ? (valueEth / position.costEth - 1) * 100 : 0;
}

/**
 * First match wins: stop (or the locked-in stop after the first take profit), red flags, weak flow,
 * graduation, time stops, ladder, trailing stop; else maybe add.
 *
 * Exit v2 (ExitRules.lockInPct, weakFlowTrailPct, stopConfirmMinutes): the stop fires only after
 * stopConfirmMinutes one-minute closes at or below it (position.stopHits, counted by track); after the
 * first take profit the stop sits at entry + lockInPct; weak flow (sellers lead the last hour, or the
 * top-10 holders sell) in profit tightens the trail to weakFlowTrailPct instead of selling everything
 * (in a loss it still sells everything). With weakFlowTrailPct 0 (v1), top-10 selling stays a red flag.
 */
export function decideExit(position: Position, market: Market, x: ExitRules, onCurve = true): ExitAction {
  if (x.style === "moonbag") return decideMoonbag(position, market, x);
  const gain = gainPct(position, market.valueEth);
  const perToken = position.tokens > 0n ? market.valueEth / Number(position.tokens) : 0;
  const high = Math.max(position.highPerToken, perToken);
  const all = (reason: string, exitKind: ExitKind): ExitAction => ({ kind: "sell", share: 1, reason, exitKind });

  if (position.laddersDone > 0 && x.lockInPct > -100 && gain <= x.lockInPct) return all(`locked-in stop: ${gain.toFixed(1)}% after taking profit (stop at entry +${x.lockInPct}%)`, "lock");
  // This minute's close always counts (track() has usually counted it already).
  const closesBelow = gain <= -x.stopPct ? Math.max(position.stopHits, 1) : 0;
  if (closesBelow >= x.stopConfirmMinutes) {
    return all(x.stopConfirmMinutes > 1 ? `stop: ${gain.toFixed(1)}% from entry, ${closesBelow} closes below -${x.stopPct}%` : `stop: ${gain.toFixed(1)}% from entry`, "stop");
  }

  if (market.safetyBlocked) return all("invalidated: Rushr safety blocked", "red");
  if (market.devPct < position.entryDevPct - 0.05) return all(`invalidated: dev sold (${position.entryDevPct}% to ${market.devPct}%)`, "red");
  const topTenSold = market.top10Pct < position.entryTop10Pct - 5;
  // v1 (no flow trail): top-10 selling is a red flag, everything out at once.
  if (topTenSold && x.weakFlowTrailPct <= 0) return all(`invalidated: top 10 wallets sold (${position.entryTop10Pct}% to ${market.top10Pct}%)`, "red");
  const sellersLead = market.volume1hUsd >= x.minVolume1hUsd && market.buySell1h !== null && market.buySell1h < x.minBuySell1h;
  if (sellersLead || topTenSold) {
    const why = sellersLead ? `1h buy/sell ${market.buySell1h!.toFixed(2)}` : `top 10 wallets sold (${position.entryTop10Pct}% to ${market.top10Pct}%)`;
    if (gain > 0 && x.weakFlowTrailPct > 0) {
      // In profit: tighten the trail instead of selling everything.
      if (perToken <= high * (1 - x.weakFlowTrailPct / 100)) return all(`tight trail: ${why}, price ${x.weakFlowTrailPct}% under the high`, "trail");
    } else {
      return all(`invalidated: ${why}`, "flow");
    }
  }

  if (onCurve && (market.graduated || market.bonding >= x.graduateBonding)) return all(`graduation: bonding ${(market.bonding * 100).toFixed(0)}%`, "graduation");

  const heldHours = (market.nowMs - position.openedAtMs) / 3_600_000;
  const best = Math.max(position.maxGainPct, gain);
  if (heldHours >= x.timeStopHours && best < x.timeStopNeedGainPct) return all(`time stop: no +${x.timeStopNeedGainPct}% in ${x.timeStopHours}h (best ${best.toFixed(1)}%)`, "time");
  const flatHours = (market.nowMs - position.lastBondingMove.atMs) / 3_600_000;
  if (onCurve && Math.abs(market.bonding - position.lastBondingMove.bonding) < x.flatBondingPts && flatHours >= x.flatBondingHours) {
    return all(`time stop: bonding flat for ${flatHours.toFixed(1)}h`, "time");
  }

  const step = x.ladder[position.laddersDone];
  if (step && gain >= step.gainPct) {
    // A share of what was bought, as a share of what is held now.
    const share = Math.min(1, (step.sellShareOfEntry * Number(position.tokensBought)) / Number(position.tokens));
    return { kind: "sell", share, reason: `take profit: +${gain.toFixed(0)}%, sell ${step.sellShareOfEntry * 100}% of the entry`, ladderStep: position.laddersDone + 1, exitKind: "ladder" };
  }
  if (position.laddersDone > 0 && perToken <= high * (1 - x.trailingPct / 100)) return all(`trailing stop: ${x.trailingPct}% below the high`, "trail");

  if (
    onCurve &&
    !position.added &&
    position.laddersDone === 0 &&
    gain > 0 &&
    market.bonding >= position.entryBonding + x.addBondingPts &&
    market.buySell6h !== null &&
    market.buySell6h >= x.addMinBuySell6h
  ) {
    return { kind: "add", reason: `strength: bonding ${(position.entryBonding * 100).toFixed(0)}% to ${(market.bonding * 100).toFixed(0)}%, +${gain.toFixed(0)}%` };
  }
  const waiting = closesBelow > 0 ? ` (${closesBelow} of ${x.stopConfirmMinutes} closes below the stop)` : "";
  return { kind: "hold", reason: `${gain >= 0 ? "+" : ""}${gain.toFixed(1)}%, bonding ${(market.bonding * 100).toFixed(0)}%${waiting}` };
}

/**
 * Research's exit v3 "moonbag", as pre-registered (scripts/research-trench-backtest.mts `ride` version 3): no
 * stop and no flow, time-stop, flat-bonding or red-flag exit; the position size is the risk limit. In order:
 * graduation (bonding at graduateBonding, or graduated) sells everything; the time limit after launch sells
 * everything; the ladder takes its share (50% at +100%); after it, the rest trails trailingPct from the peak.
 */
export function decideMoonbag(position: Position, market: Market, x: ExitRules): ExitAction {
  const gain = gainPct(position, market.valueEth);
  const perToken = position.tokens > 0n ? market.valueEth / Number(position.tokens) : 0;
  const high = Math.max(position.highPerToken, perToken);
  const all = (reason: string, exitKind: ExitKind): ExitAction => ({ kind: "sell", share: 1, reason, exitKind });

  if (market.graduated || market.bonding >= x.graduateBonding) return all(`graduation: bonding ${(market.bonding * 100).toFixed(0)}%`, "graduation");
  const launchedAtMs = position.launchedAtMs ?? position.openedAtMs;
  const sinceLaunchHours = (market.nowMs - launchedAtMs) / 3_600_000;
  if (sinceLaunchHours >= x.maxHoursFromLaunch) return all(`time limit: ${(x.maxHoursFromLaunch / 24).toFixed(0)} days since launch`, "time");
  const step = x.ladder[position.laddersDone];
  if (step && gain >= step.gainPct) {
    const share = Math.min(1, (step.sellShareOfEntry * Number(position.tokensBought)) / Number(position.tokens));
    return { kind: "sell", share, reason: `take profit: +${gain.toFixed(0)}%, sell ${step.sellShareOfEntry * 100}% of the entry`, ladderStep: position.laddersDone + 1, exitKind: "ladder" };
  }
  if (position.laddersDone > 0 && perToken <= high * (1 - x.trailingPct / 100)) return all(`trailing stop: ${x.trailingPct}% below the peak`, "trail");
  return { kind: "hold", reason: `${gain >= 0 ? "+" : ""}${gain.toFixed(1)}%, bonding ${(market.bonding * 100).toFixed(0)}%, moonbag (no stop)` };
}

/** Update the running high, best gain and bonding clock after a minute (before deciding). */
export function track(position: Position, market: Market, x: ExitRules): Position {
  const perToken = position.tokens > 0n ? market.valueEth / Number(position.tokens) : 0;
  const moved = Math.abs(market.bonding - position.lastBondingMove.bonding) >= x.flatBondingPts;
  return {
    ...position,
    highPerToken: Math.max(position.highPerToken, perToken),
    maxGainPct: Math.max(position.maxGainPct, gainPct(position, market.valueEth)),
    lastBondingMove: moved ? { bonding: market.bonding, atMs: market.nowMs } : position.lastBondingMove,
    stopHits: gainPct(position, market.valueEth) <= -x.stopPct ? position.stopHits + 1 : 0,
  };
}

// ---------------------------------------------------------------- money limits

export type Book = {
  /** Open positions: what was spent on each (USD at buy time) and what it is worth now (USD). */
  open: { token: string; costUsd: number; valueUsd: number }[];
  realisedTodayUsd: number;
  realisedTotalUsd: number;
  /** Set once the total stop fired; never cleared by code. */
  halted: boolean;
  /** Global switch off, or the agent paused: no new buys, exits keep running. */
  buysOff: boolean;
};

export type BuyCheck = { ok: true; usd: number } | { ok: false; reason: string };

export function totalPnlUsd(book: Book): number {
  return book.realisedTotalUsd + book.open.reduce((sum, position) => sum + position.valueUsd - position.costUsd, 0);
}

export function mustHalt(book: Book, limits: Limits): boolean {
  return book.halted || totalPnlUsd(book) <= -limits.totalLossUsd;
}

/** May we buy more of `token` (a first buy or the one add)? */
export function checkBuy(book: Book, limits: Limits, token: string, kind: "first" | "add"): BuyCheck {
  if (book.buysOff) return { ok: false, reason: "buys are off" };
  if (mustHalt(book, limits)) return { ok: false, reason: `total stop: P&L $${totalPnlUsd(book).toFixed(2)}` };
  if (book.realisedTodayUsd <= -limits.dailyLossUsd) return { ok: false, reason: `day stop: $${book.realisedTodayUsd.toFixed(2)} today` };
  const usd = kind === "first" ? limits.firstBuyUsd : limits.addUsd;
  if (usd <= 0) return { ok: false, reason: "no size set" };
  const held = book.open.find((position) => position.token === token);
  if (kind === "first" && held) return { ok: false, reason: "already holding it" };
  if (kind === "first" && book.open.length >= limits.maxOpenTokens) return { ok: false, reason: `${book.open.length} tokens open (max ${limits.maxOpenTokens})` };
  if ((held?.costUsd ?? 0) + usd > limits.maxPerTokenUsd + 0.01) return { ok: false, reason: `would pass $${limits.maxPerTokenUsd} in one token` };
  const spent = book.open.reduce((sum, position) => sum + position.costUsd, 0);
  const cash = limits.capitalUsd + book.realisedTotalUsd - spent;
  if (usd > cash + 0.01) return { ok: false, reason: `only $${cash.toFixed(2)} left` };
  return { ok: true, usd };
}

// ---------------------------------------------------------------- one minute

/** Shared crowding limits across every Zolva trench agent (plan 3.2, decision 3). */
export type Crowding = {
  maxTokenExposureUsd: number;
  maxBuysPerTokenMinute: number;
  /** What all Zolva agents hold in each token now (USD at cost), before this agent. */
  exposureUsd: ReadonlyMap<string, number>;
  /** Buys already planned this minute per token, before this agent. */
  buysThisMinute: ReadonlyMap<string, number>;
};

export type HeldInput = { position: Position; symbol: string; costUsd: number; market: Market };

/** A closed position: how it ended, when, the market cap then and the highest seen while held. */
export type PreviousExit = { exitKind: ExitKind | null; exitAtMs: number; exitMarketCapUsd: number | null; highMarketCapUsd: number | null; reentries: number };

/** May this agent buy a token it held before? One re-entry, after a flow or time exit only, once flow is strong again and the price is back above the exit but under the old high. */
export function reentryVerdict(previous: PreviousExit | undefined, token: RushrToken, buySell6h: number | null, rules: TrenchRules, nowMs: number): Verdict {
  const r = rules.entry;
  if (!previous || !r.reentryEnabled) return no("held before");
  if (previous.reentries >= 1) return no("already re-entered once");
  if (previous.exitKind !== "flow" && previous.exitKind !== "time") return no(`left on a ${previous.exitKind ?? "unknown"} exit: no re-entry`);
  const waited = (nowMs - previous.exitAtMs) / 60_000;
  if (waited < r.reentryCooldownMinutes) return no(`re-entry cooldown: ${Math.round(waited)} of ${r.reentryCooldownMinutes} min`);
  if (buySell6h === null || buySell6h < r.reentryMinBuySell6h) return no(`re-entry needs 6h buy/sell ${r.reentryMinBuySell6h}, has ${buySell6h?.toFixed(2) ?? "none"}`);
  const cap = token.market_cap_usd;
  if (cap === null || previous.exitMarketCapUsd === null || previous.highMarketCapUsd === null) return no("re-entry: price history missing");
  if (!(cap > previous.exitMarketCapUsd)) return no("re-entry: price not above the last exit");
  if (!(cap < previous.highMarketCapUsd)) return no("re-entry: price at or above the old high");
  return PASS;
}

/**
 * A candidate with the facts for stages 2 and 3, gathered once for every agent. `checks` null: not
 * fetched this minute; `social` null: X and narrative not checked yet. Either way it is not bought.
 */
export type CandidateInput = {
  token: RushrToken;
  /** 1 for the most traded token in the list. */
  tradesRank: number;
  checks: { stats: RushrStats; safetyBlocked: boolean; dexPaidMinutesAfterLaunch: number | null } | null;
  social: Verdict | null;
};

export type MinuteInput = {
  nowMs: number;
  rules: TrenchRules;
  limits: Limits;
  book: Omit<Book, "open">;
  held: HeldInput[];
  /** Tokens this agent ever held (bought again only by a re-entry, see `previous`). */
  everHeld: ReadonlySet<string>;
  /** How each closed position ended, for the one re-entry after a flow or time exit. */
  previous?: ReadonlyMap<string, PreviousExit>;
  candidates: CandidateInput[];
  crowding: Crowding;
};

export type MinuteAction =
  | { kind: "sell"; token: string; symbol: string; share: number; reason: string; ladderStep?: number; exitKind: ExitKind; position: Position }
  | { kind: "add"; token: string; symbol: string; usd: number; reason: string; position: Position }
  | { kind: "buy"; token: string; symbol: string; usd: number; reason: string; candidate: RushrToken; reentry: boolean }
  | { kind: "hold"; token: string; symbol: string; reason: string; position: Position }
  | { kind: "skip"; token: string; symbol: string; reason: string };

export type MinuteResult = { actions: MinuteAction[]; halt: boolean };

function crowdingBlock(token: string, usd: number, crowding: Crowding, planned: Map<string, number>, plannedUsd: Map<string, number>): string | null {
  const exposure = (crowding.exposureUsd.get(token) ?? 0) + (plannedUsd.get(token) ?? 0);
  if (exposure + usd > crowding.maxTokenExposureUsd + 0.01) return `Zolva agents already hold $${exposure.toFixed(0)} of it (cap $${crowding.maxTokenExposureUsd})`;
  const buys = (crowding.buysThisMinute.get(token) ?? 0) + (planned.get(token) ?? 0);
  if (buys >= crowding.maxBuysPerTokenMinute) return `${buys} Zolva buys of it this minute already`;
  return null;
}

/** One agent's minute: what to sell, add and buy, and why everything else is held or skipped. */
export function runMinute(input: MinuteInput): MinuteResult {
  const { rules, limits } = input;
  const actions: MinuteAction[] = [];
  const book: Book = { ...input.book, open: input.held.map((item) => ({ token: item.position.token, costUsd: item.costUsd, valueUsd: 0 })) };
  // Value positions for the limits at their net sell quote, scaled from what they cost in USD.
  for (const [i, item] of input.held.entries()) {
    book.open[i].valueUsd = item.position.costEth > 0 ? item.costUsd * (item.market.valueEth / item.position.costEth) : 0;
  }
  const halt = mustHalt(book, limits);
  const planned = new Map<string, number>();
  const plannedUsd = new Map<string, number>();

  for (const item of input.held) {
    const position = track(item.position, item.market, rules.exit);
    const action: ExitAction = halt
      ? { kind: "sell", share: 1, reason: book.halted ? "agent halted" : `total stop: P&L passed -$${limits.totalLossUsd}`, exitKind: "halt" }
      : decideExit(position, item.market, rules.exit, rules.market === "curve");
    if (action.kind === "sell") {
      actions.push({ kind: "sell", token: position.token, symbol: item.symbol, share: action.share, reason: action.reason, ladderStep: action.ladderStep, exitKind: action.exitKind, position });
      continue;
    }
    if (action.kind === "add") {
      const check = checkBuy(book, limits, position.token, "add");
      const crowded = check.ok ? crowdingBlock(position.token, check.usd, input.crowding, planned, plannedUsd) : null;
      if (check.ok && !crowded) {
        actions.push({ kind: "add", token: position.token, symbol: item.symbol, usd: check.usd, reason: action.reason, position });
        planned.set(position.token, (planned.get(position.token) ?? 0) + 1);
        plannedUsd.set(position.token, (plannedUsd.get(position.token) ?? 0) + check.usd);
        const open = book.open.find((entry) => entry.token === position.token);
        if (open) open.costUsd += check.usd;
        continue;
      }
      actions.push({ kind: "hold", token: position.token, symbol: item.symbol, reason: `add skipped: ${check.ok ? crowded : check.reason}`, position });
      continue;
    }
    actions.push({ kind: "hold", token: position.token, symbol: item.symbol, reason: action.reason, position });
  }

  if (halt) return { actions, halt };

  for (const { token, tradesRank, checks, social } of input.candidates) {
    const heldBefore = input.everHeld.has(token.address);
    if (heldBefore && !input.previous?.has(token.address)) continue;
    const first = listStage(token, rules, input.nowMs);
    if (!first.pass || checks === null) continue;
    if (heldBefore) {
      const again = reentryVerdict(input.previous!.get(token.address), token, buySellRatio(checks.stats["6h"]), rules, input.nowMs);
      if (!again.pass) {
        // Quietly skip tokens that simply can't come back; say why only for real re-entry candidates.
        if (!/held before|already re-entered|no re-entry/.test(again.reason)) actions.push({ kind: "skip", token: token.address, symbol: token.symbol, reason: again.reason });
        continue;
      }
    }
    const second = statsStage({ ...checks, tradesRank }, rules);
    if (!second.pass) {
      actions.push({ kind: "skip", token: token.address, symbol: token.symbol, reason: second.reason });
      continue;
    }
    if (rules.entry.requireSocial) {
      if (social === null) continue;
      if (!social.pass) {
        actions.push({ kind: "skip", token: token.address, symbol: token.symbol, reason: social.reason });
        continue;
      }
    }
    const check = checkBuy(book, limits, token.address, "first");
    if (!check.ok) {
      actions.push({ kind: "skip", token: token.address, symbol: token.symbol, reason: `passes the rule; ${check.reason}` });
      continue;
    }
    const crowded = crowdingBlock(token.address, check.usd, input.crowding, planned, plannedUsd);
    if (crowded) {
      actions.push({ kind: "skip", token: token.address, symbol: token.symbol, reason: `passes the rule; ${crowded}` });
      continue;
    }
    const reason =
      rules.market === "curve"
        ? `bonding ${((token.bonding_progress ?? 0) * 100).toFixed(0)}%, dev ${token.dev_pct}%, fresh ${token.fresh_pct}%, pullback ${pullbackPct(token)?.toFixed(0)}%`
        : `graduated, ${token.holders} holders, $${Math.round((token.volume_24h_usd ?? 0) / 1000)}k 24h volume, Rushr risk ${token.risk}, top 10 ${token.top10_pct}%`;
    actions.push({ kind: "buy", token: token.address, symbol: token.symbol, usd: check.usd, reason: heldBefore ? `re-entry: ${reason}` : reason, candidate: token, reentry: heldBefore });
    planned.set(token.address, (planned.get(token.address) ?? 0) + 1);
    plannedUsd.set(token.address, (plannedUsd.get(token.address) ?? 0) + check.usd);
    book.open.push({ token: token.address, costUsd: check.usd, valueUsd: check.usd });
  }
  return { actions, halt };
}
