/**
 * Trench agent rules: one format for presets and custom rules (docs/rushr-integration-plan.md 3.6).
 * A preset is a saved TrenchRules; a custom agent edits the same fields from a preset. parseTrenchRules
 * is the only way rules reach the engine: unknown fields are dropped, numbers are clamped, the market
 * comes from the preset, and the locked guards (a stop loss, Rushr's safety check, the slippage cap,
 * the money limits' ranges) can't be turned off.
 *
 * "almost_bonded" (shown as Curve Rider) is the Zolva Lab rule v3 and trade plan (zolva-lab-agent).
 * "graduated_safe" trades tokens after they left the curve, through Uniswap; owner decision
 * 2026-11-17 to open it to everyone, against Research's NO-GO on graduated tokens (2026-11-16), so it
 * waits 6 h after graduation, filters hard and exits fast.
 *
 * Exit v2 (owner 2026-11-18, "Yes, send both"; Research's review trench-exit-review-2026-11-18.md, values
 * Research's to tune): bank 50% early, then lock the stop above entry and trail the rest; weak buying
 * (or top-10 holders selling) while in profit tightens the trail instead of selling everything; the
 * stop needs N one-minute closes below it. Re-entry exists but is off. Values: Research's frozen set
 * (docs/perps-research.md "Trench exit v2", b8cc25c). Curve Rider uses it; Graduated Safe keeps its
 * exits (the new fields off) until Research says otherwise.
 */

/** Where a preset trades: on the PONS bonding curve, or graduated tokens on Uniswap. */
export type Market = "curve" | "graduated";
export type RiskLevel = "low" | "medium" | "high";

export type EntryRules = {
  maxAgeHours: number;
  minBonding: number;
  maxBonding: number;
  /** Graduated only: hours since the token left the curve. */
  minHoursSinceGraduation: number;
  maxTaxBps: number;
  maxDevPct: number;
  maxFreshPct: number;
  maxTop10Pct: number;
  maxSnipersPct: number;
  maxBundledPct: number;
  minHolders: number;
  minVolume24hUsd: number;
  /** Highest Rushr risk level allowed. */
  maxRisk: RiskLevel;
  minPullbackPct: number;
  maxPullbackPct: number;
  minTraders24h: number;
  /** A token in the top N by 24h trades passes the traders check anyway. */
  topTradesRank: number;
  minBuySell6h: number;
  /** A paid DEX profile within maxDexPaidMinutes of launch. */
  requireDexPaid: boolean;
  maxDexPaidMinutes: number;
  /** The project's X account: blue check, website, contract posted by itself, and the AI narrative veto. */
  requireSocial: boolean;
  /** One re-entry per token, only after a flow or time exit (never a stop or red flag). */
  reentryEnabled: boolean;
  reentryCooldownMinutes: number;
  reentryMinBuySell6h: number;
};

export type ExitRules = {
  stopPct: number;
  ladder: { gainPct: number; sellShareOfEntry: number }[];
  trailingPct: number;
  graduateBonding: number;
  timeStopHours: number;
  timeStopNeedGainPct: number;
  flatBondingHours: number;
  flatBondingPts: number;
  minBuySell1h: number;
  /** Ignore the 1h buy/sell ratio under this much volume (too few trades to mean anything). */
  minVolume1hUsd: number;
  addBondingPts: number;
  addMinBuySell6h: number;
  /** After the first take profit the stop moves to entry + this (%). -100 = off. */
  lockInPct: number;
  /** Weak buying while in profit: trail this tight (%) instead of selling everything. 0 = off (sell all). */
  weakFlowTrailPct: number;
  /** The stop fires after this many one-minute closes in a row below it (1 = the first). */
  stopConfirmMinutes: number;
};

/** Shares of the agent's money. */
export type SizingRules = {
  firstBuyShare: number;
  addShare: number;
  maxPerTokenShare: number;
  maxOpenTokens: number;
  dailyLossShare: number;
  totalLossShare: number;
};

export type TrenchRules = { version: 1; market: Market; entry: EntryRules; exit: ExitRules; sizing: SizingRules };

/** Locked guards: never configurable. */
export const LOCKED = {
  /** Max slippage on every Rushr build. */
  slippageBps: 300,
  /** The stop loss always exists and is never wider than this. */
  maxStopPct: 50,
  minStopPct: 5,
} as const;

export const PRESETS = {
  almost_bonded: {
    version: 1,
    market: "curve",
    entry: {
      maxAgeHours: 24,
      minBonding: 0.35,
      maxBonding: 0.7,
      minHoursSinceGraduation: 0,
      maxTaxBps: 200,
      maxDevPct: 1,
      maxFreshPct: 5,
      maxTop10Pct: 100,
      maxSnipersPct: 100,
      maxBundledPct: 100,
      minHolders: 0,
      minVolume24hUsd: 0,
      maxRisk: "high",
      minPullbackPct: 15,
      maxPullbackPct: 45,
      minTraders24h: 90,
      topTradesRank: 3,
      minBuySell6h: 1,
      requireDexPaid: true,
      maxDexPaidMinutes: 90,
      requireSocial: true,
      // Research froze exit v2 without re-entry (2026-11-18); the rule is built but off.
      reentryEnabled: false,
      reentryCooldownMinutes: 60,
      reentryMinBuySell6h: 1.2,
    },
    exit: {
      stopPct: 25,
      // v2: bank half at +20% (v1: +50% and +100%; ORRY and HOLBRIC reached +31% and still lost).
      ladder: [{ gainPct: 20, sellShareOfEntry: 0.5 }],
      trailingPct: 15,
      graduateBonding: 0.95,
      timeStopHours: 6,
      timeStopNeedGainPct: 20,
      flatBondingHours: 2,
      flatBondingPts: 0.01,
      minBuySell1h: 0.7,
      minVolume1hUsd: 200,
      addBondingPts: 0.1,
      addMinBuySell6h: 1,
      lockInPct: 3,
      weakFlowTrailPct: 10,
      stopConfirmMinutes: 2,
    },
    sizing: { firstBuyShare: 0.1, addShare: 0.1, maxPerTokenShare: 0.2, maxOpenTokens: 4, dailyLossShare: 0.2, totalLossShare: 0.7 },
  },
  graduated_safe: {
    version: 1,
    market: "graduated",
    entry: {
      maxAgeHours: 72,
      minBonding: 0,
      maxBonding: 0.94,
      minHoursSinceGraduation: 6,
      maxTaxBps: 200,
      maxDevPct: 1,
      maxFreshPct: 10,
      maxTop10Pct: 30,
      maxSnipersPct: 25,
      maxBundledPct: 15,
      minHolders: 200,
      minVolume24hUsd: 50_000,
      maxRisk: "medium",
      minPullbackPct: 0,
      maxPullbackPct: 95,
      minTraders24h: 0,
      topTradesRank: 0,
      minBuySell6h: 1.1,
      requireDexPaid: false,
      maxDexPaidMinutes: 90,
      requireSocial: false,
      reentryEnabled: false,
      reentryCooldownMinutes: 60,
      reentryMinBuySell6h: 1.2,
    },
    exit: {
      stopPct: 15,
      ladder: [{ gainPct: 25, sellShareOfEntry: 0.5 }],
      trailingPct: 15,
      graduateBonding: 0.95,
      timeStopHours: 4,
      // Out after 4 hours whatever the gain: graduated tokens fade (Research, 2026-11-16).
      timeStopNeedGainPct: 1000,
      flatBondingHours: 2,
      flatBondingPts: 0.01,
      minBuySell1h: 0.8,
      minVolume1hUsd: 500,
      addBondingPts: 0.1,
      addMinBuySell6h: 1,
      lockInPct: -100,
      weakFlowTrailPct: 0,
      stopConfirmMinutes: 1,
    },
    sizing: { firstBuyShare: 0.08, addShare: 0, maxPerTokenShare: 0.08, maxOpenTokens: 5, dailyLossShare: 0.15, totalLossShare: 0.5 },
  },
} as const satisfies Record<string, TrenchRules>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export const PRESET_INFO: Record<PresetId, { name: string; summary: string; icon: string }> = {
  almost_bonded: {
    name: "Curve Rider",
    icon: "path",
    summary: "PONS tokens 35 to 70% along their curve after a pullback, with tight holder, buyer and X checks. Stop -25%, profit ladder, sells before graduation.",
  },
  graduated_safe: {
    name: "Graduated Safe",
    icon: "shield-check",
    summary: "Tokens 6 h or more after graduation, with 200+ holders, real volume and low or medium Rushr risk. Small sizes, stop -15%, out within 4 hours.",
  },
};

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === "string" && value in PRESETS;
}

type Loose = Record<string, unknown>;

/** A number from `raw` clamped to [min, max], or the fallback when missing or not a number. */
function clamp(raw: unknown, fallback: number, min: number, max: number): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  return Math.min(max, Math.max(min, value));
}

const RISKS: RiskLevel[] = ["low", "medium", "high"];

/**
 * Rules from untrusted JSON, based on a preset: every field is read, clamped to a safe range, and
 * falls back to the preset's value. The market always comes from the preset. The stop loss can be
 * tuned but never removed.
 */
export function parseTrenchRules(raw: unknown, base: PresetId = "almost_bonded"): TrenchRules {
  const preset: TrenchRules = PRESETS[base];
  const input = (raw && typeof raw === "object" ? raw : {}) as Loose;
  const entry = (input.entry && typeof input.entry === "object" ? input.entry : {}) as Loose;
  const exit = (input.exit && typeof input.exit === "object" ? input.exit : {}) as Loose;
  const sizing = (input.sizing && typeof input.sizing === "object" ? input.sizing : {}) as Loose;
  const e = preset.entry;
  const x = preset.exit;
  const s = preset.sizing;

  const minBonding = clamp(entry.minBonding, e.minBonding, 0, 0.9);
  const minPullbackPct = clamp(entry.minPullbackPct, e.minPullbackPct, 0, 90);
  const ladderRaw = Array.isArray(exit.ladder) ? (exit.ladder as Loose[]) : x.ladder;
  const ladder = ladderRaw
    .slice(0, 3)
    .map((step) => ({ gainPct: clamp(step.gainPct, 50, 5, 1000), sellShareOfEntry: clamp(step.sellShareOfEntry, 0.5, 0.05, 1) }))
    .sort((a, b) => a.gainPct - b.gainPct);
  const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

  return {
    version: 1,
    market: preset.market,
    entry: {
      maxAgeHours: clamp(entry.maxAgeHours, e.maxAgeHours, 0.25, 168),
      minBonding,
      maxBonding: clamp(entry.maxBonding, e.maxBonding, minBonding, 0.94),
      minHoursSinceGraduation: clamp(entry.minHoursSinceGraduation, e.minHoursSinceGraduation, 0, 168),
      maxTaxBps: clamp(entry.maxTaxBps, e.maxTaxBps, 0, 500),
      maxDevPct: clamp(entry.maxDevPct, e.maxDevPct, 0, 20),
      maxFreshPct: clamp(entry.maxFreshPct, e.maxFreshPct, 0, 50),
      maxTop10Pct: clamp(entry.maxTop10Pct, e.maxTop10Pct, 5, 100),
      maxSnipersPct: clamp(entry.maxSnipersPct, e.maxSnipersPct, 0, 100),
      maxBundledPct: clamp(entry.maxBundledPct, e.maxBundledPct, 0, 100),
      minHolders: Math.round(clamp(entry.minHolders, e.minHolders, 0, 100_000)),
      minVolume24hUsd: clamp(entry.minVolume24hUsd, e.minVolume24hUsd, 0, 100_000_000),
      maxRisk: RISKS.includes(entry.maxRisk as RiskLevel) ? (entry.maxRisk as RiskLevel) : e.maxRisk,
      minPullbackPct,
      maxPullbackPct: clamp(entry.maxPullbackPct, e.maxPullbackPct, minPullbackPct, 95),
      minTraders24h: clamp(entry.minTraders24h, e.minTraders24h, 0, 10_000),
      topTradesRank: Math.round(clamp(entry.topTradesRank, e.topTradesRank, 0, 50)),
      minBuySell6h: clamp(entry.minBuySell6h, e.minBuySell6h, 0, 10),
      requireDexPaid: bool(entry.requireDexPaid, e.requireDexPaid),
      maxDexPaidMinutes: clamp(entry.maxDexPaidMinutes, e.maxDexPaidMinutes, 0, 10_080),
      requireSocial: bool(entry.requireSocial, e.requireSocial),
      reentryEnabled: bool(entry.reentryEnabled, e.reentryEnabled),
      reentryCooldownMinutes: clamp(entry.reentryCooldownMinutes, e.reentryCooldownMinutes, 15, 1440),
      reentryMinBuySell6h: clamp(entry.reentryMinBuySell6h, e.reentryMinBuySell6h, 0, 10),
    },
    exit: {
      // Locked guard: always a stop, between 5% and 50%.
      stopPct: clamp(exit.stopPct, x.stopPct, LOCKED.minStopPct, LOCKED.maxStopPct),
      ladder,
      trailingPct: clamp(exit.trailingPct, x.trailingPct, 5, 90),
      graduateBonding: clamp(exit.graduateBonding, x.graduateBonding, 0.5, 0.99),
      timeStopHours: clamp(exit.timeStopHours, x.timeStopHours, 0.25, 168),
      timeStopNeedGainPct: clamp(exit.timeStopNeedGainPct, x.timeStopNeedGainPct, 0, 1000),
      flatBondingHours: clamp(exit.flatBondingHours, x.flatBondingHours, 0.25, 168),
      flatBondingPts: clamp(exit.flatBondingPts, x.flatBondingPts, 0, 0.5),
      minBuySell1h: clamp(exit.minBuySell1h, x.minBuySell1h, 0, 10),
      minVolume1hUsd: clamp(exit.minVolume1hUsd, x.minVolume1hUsd, 0, 1_000_000),
      addBondingPts: clamp(exit.addBondingPts, x.addBondingPts, 0, 0.5),
      addMinBuySell6h: clamp(exit.addMinBuySell6h, x.addMinBuySell6h, 0, 10),
      lockInPct: clamp(exit.lockInPct, x.lockInPct, -100, 50),
      weakFlowTrailPct: clamp(exit.weakFlowTrailPct, x.weakFlowTrailPct, 0, 50),
      stopConfirmMinutes: Math.round(clamp(exit.stopConfirmMinutes, x.stopConfirmMinutes, 1, 10)),
    },
    sizing: {
      firstBuyShare: clamp(sizing.firstBuyShare, s.firstBuyShare, 0.01, 0.5),
      addShare: clamp(sizing.addShare, s.addShare, 0, 0.5),
      maxPerTokenShare: clamp(sizing.maxPerTokenShare, s.maxPerTokenShare, 0.01, 0.5),
      maxOpenTokens: Math.round(clamp(sizing.maxOpenTokens, s.maxOpenTokens, 1, 10)),
      dailyLossShare: clamp(sizing.dailyLossShare, s.dailyLossShare, 0.01, 1),
      totalLossShare: clamp(sizing.totalLossShare, s.totalLossShare, 0.05, 1),
    },
  };
}

/**
 * The rules an agent trades with: its own edited copy when custom, otherwise its preset as it is
 * today (so preset updates such as exit v2 reach every non-custom agent).
 */
export function agentRules(agent: { preset: PresetId; rules: unknown; custom?: boolean | null }): TrenchRules {
  return agent.custom ? parseTrenchRules(agent.rules, agent.preset) : parseTrenchRules(PRESETS[agent.preset], agent.preset);
}

/** True when rules differ from their preset (a custom agent). */
export function isCustom(rules: TrenchRules, base: PresetId): boolean {
  return JSON.stringify(rules) !== JSON.stringify(parseTrenchRules(PRESETS[base], base));
}

/**
 * The fields a user may edit in "Your own rules", per market, with their display unit and the
 * range parseTrenchRules accepts. `scale` turns the stored value into the shown one (0.35 -> 35%).
 */
export type EditableField = { group: "entry" | "exit" | "sizing"; key: string; label: string; unit: string; scale: number; min: number; max: number; step: number; markets: Market[] };

export const EDITABLE_FIELDS: EditableField[] = [
  { group: "entry", key: "minBonding", label: "Bonding from", unit: "%", scale: 100, min: 0, max: 90, step: 5, markets: ["curve"] },
  { group: "entry", key: "maxBonding", label: "Bonding up to", unit: "%", scale: 100, min: 5, max: 94, step: 1, markets: ["curve"] },
  { group: "entry", key: "minPullbackPct", label: "Pullback from high, at least", unit: "%", scale: 1, min: 0, max: 90, step: 5, markets: ["curve"] },
  { group: "entry", key: "maxPullbackPct", label: "Pullback from high, at most", unit: "%", scale: 1, min: 5, max: 95, step: 5, markets: ["curve"] },
  { group: "entry", key: "minTraders24h", label: "Traders in 24 h, at least", unit: "", scale: 1, min: 0, max: 2000, step: 10, markets: ["curve"] },
  { group: "entry", key: "minHoursSinceGraduation", label: "Hours since graduation, at least", unit: "h", scale: 1, min: 0, max: 168, step: 1, markets: ["graduated"] },
  { group: "entry", key: "minHolders", label: "Holders, at least", unit: "", scale: 1, min: 0, max: 10000, step: 50, markets: ["graduated"] },
  { group: "entry", key: "minVolume24hUsd", label: "24 h volume, at least", unit: "$", scale: 1, min: 0, max: 5_000_000, step: 5000, markets: ["graduated"] },
  { group: "entry", key: "maxTop10Pct", label: "Top 10 holders, at most", unit: "%", scale: 1, min: 5, max: 100, step: 5, markets: ["graduated"] },
  { group: "entry", key: "maxAgeHours", label: "Token age, at most", unit: "h", scale: 1, min: 1, max: 168, step: 1, markets: ["curve", "graduated"] },
  { group: "entry", key: "maxDevPct", label: "Dev wallet, at most", unit: "%", scale: 1, min: 0, max: 20, step: 0.5, markets: ["curve", "graduated"] },
  { group: "entry", key: "maxTaxBps", label: "Token tax, at most", unit: "%", scale: 0.01, min: 0, max: 5, step: 0.5, markets: ["curve", "graduated"] },
  { group: "entry", key: "minBuySell6h", label: "6 h buys / sells, at least", unit: "x", scale: 1, min: 0, max: 5, step: 0.1, markets: ["curve", "graduated"] },
  { group: "exit", key: "stopPct", label: "Stop loss", unit: "%", scale: 1, min: LOCKED.minStopPct, max: LOCKED.maxStopPct, step: 1, markets: ["curve", "graduated"] },
  { group: "exit", key: "trailingPct", label: "Trailing stop after the first take profit", unit: "%", scale: 1, min: 5, max: 90, step: 5, markets: ["curve", "graduated"] },
  { group: "exit", key: "timeStopHours", label: "Time stop", unit: "h", scale: 1, min: 0.5, max: 168, step: 0.5, markets: ["curve", "graduated"] },
  { group: "exit", key: "lockInPct", label: "Stop after the first take profit, entry +", unit: "%", scale: 1, min: -100, max: 50, step: 1, markets: ["curve", "graduated"] },
  { group: "exit", key: "stopConfirmMinutes", label: "Stop needs closes below it", unit: "min", scale: 1, min: 1, max: 10, step: 1, markets: ["curve", "graduated"] },
  { group: "sizing", key: "firstBuyShare", label: "Per new token", unit: "% of its money", scale: 100, min: 1, max: 50, step: 1, markets: ["curve", "graduated"] },
  { group: "sizing", key: "maxOpenTokens", label: "Tokens at once", unit: "", scale: 1, min: 1, max: 10, step: 1, markets: ["curve", "graduated"] },
  { group: "sizing", key: "dailyLossShare", label: "Day stop after losing", unit: "%", scale: 100, min: 1, max: 100, step: 1, markets: ["curve", "graduated"] },
  { group: "sizing", key: "totalLossShare", label: "Stop for good after losing", unit: "%", scale: 100, min: 5, max: 100, step: 1, markets: ["curve", "graduated"] },
];

/** Plain-words summary of any rules (preset or custom), for the agent page. */
export function describeRules(rules: TrenchRules): { buys: string; sells: string; sizing: string; line: string } {
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const e = rules.entry;
  const x = rules.exit;
  const s = rules.sizing;
  const buys =
    rules.market === "curve"
      ? `PONS tokens under ${e.maxAgeHours} h old, ${pct(e.minBonding)} to ${pct(e.maxBonding)} bonded, after a ${e.minPullbackPct} to ${e.maxPullbackPct}% pullback; dev ${e.maxDevPct}% or less, ${e.minTraders24h}+ traders, buyers at ${e.minBuySell6h}x sellers or more${e.requireDexPaid ? ", DEX paid" : ""}${e.requireSocial ? ", contract posted by its own X" : ""}; Rushr safety passed`
      : `Graduated ${e.minHoursSinceGraduation} h or more ago, under ${e.maxAgeHours} h old; ${e.minHolders}+ holders, $${Math.round(e.minVolume24hUsd / 1000)}k+ volume in 24 h, top 10 at most ${e.maxTop10Pct}%, dev ${e.maxDevPct}% or less, tax ${e.maxTaxBps / 100}% or less, Rushr risk ${e.maxRisk} or lower, buyers at ${e.minBuySell6h}x sellers or more`;
  const ladder = x.ladder.map((step) => `${pct(step.sellShareOfEntry)} at +${step.gainPct}%`).join(", ");
  const timeStop = x.timeStopNeedGainPct >= 1000 ? `everything after ${x.timeStopHours} h` : `after ${x.timeStopHours} h without +${x.timeStopNeedGainPct}%`;
  const stop = x.stopConfirmMinutes > 1 ? `Stop -${x.stopPct}% after ${x.stopConfirmMinutes} one-minute closes below it` : `Stop -${x.stopPct}%`;
  const lock = x.lockInPct > -100 && x.ladder.length > 0 ? `, then the stop moves to entry +${x.lockInPct}%` : "";
  const flow = x.weakFlowTrailPct > 0 ? `; if sellers take over: out at a loss, a ${x.weakFlowTrailPct}% trail in profit` : "; at once if sellers take over";
  const sells = `${stop}; ${ladder || "no take profit"}${lock}, the rest on a ${x.trailingPct}% trailing stop; ${timeStop}${rules.market === "curve" ? "; everything near graduation" : ""}${flow}${e.reentryEnabled ? `; one re-entry after a flow or time exit (${e.reentryCooldownMinutes} min later, buyers ${e.reentryMinBuySell6h}x)` : ""}`;
  const sizing = `${pct(s.firstBuyShare)} of its money per new token${s.addShare > 0 ? `, one add of ${pct(s.addShare)}` : ""}, at most ${pct(s.maxPerTokenShare)} in one token and ${s.maxOpenTokens} tokens at once. Day stop after -${pct(s.dailyLossShare)}, stops for good after -${pct(s.totalLossShare)}.`;
  const line = `${pct(s.firstBuyShare)} per token · stop -${x.stopPct}% · up to ${s.maxOpenTokens} tokens · stops for good at -${pct(s.totalLossShare)}`;
  return { buys, sells, sizing, line };
}

/** Dollar limits for a budget. */
export type Limits = {
  capitalUsd: number;
  firstBuyUsd: number;
  addUsd: number;
  maxPerTokenUsd: number;
  maxOpenTokens: number;
  dailyLossUsd: number;
  totalLossUsd: number;
};

export function limitsFor(rules: TrenchRules, budgetUsd: number): Limits {
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    capitalUsd: budgetUsd,
    firstBuyUsd: round(budgetUsd * rules.sizing.firstBuyShare),
    addUsd: round(budgetUsd * rules.sizing.addShare),
    maxPerTokenUsd: round(budgetUsd * rules.sizing.maxPerTokenShare),
    maxOpenTokens: rules.sizing.maxOpenTokens,
    dailyLossUsd: round(budgetUsd * rules.sizing.dailyLossShare),
    totalLossUsd: round(budgetUsd * rules.sizing.totalLossShare),
  };
}
