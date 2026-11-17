/**
 * Trench agent rules: one format for presets now and custom rules later (docs/rushr-integration-plan.md 3.6).
 * A preset is a saved TrenchRules; custom will edit the same fields. parseTrenchRules is the only way
 * rules reach the engine: unknown fields are dropped, numbers are clamped, and the locked guards
 * (a stop loss, Rushr's safety check, the slippage cap) can't be turned off.
 *
 * Numbers for "almost_bonded" are the Zolva Lab rule v3 and trade plan (zolva-lab-agent, owner's
 * limits of 2026-11-17 on a $100 budget), expressed as shares of the budget so any budget scales.
 */

export type EntryRules = {
  maxAgeHours: number;
  minBonding: number;
  maxBonding: number;
  maxTaxBps: number;
  maxDevPct: number;
  maxFreshPct: number;
  minPullbackPct: number;
  maxPullbackPct: number;
  minTraders24h: number;
  /** A token in the top N by 24h trades passes the traders check anyway. */
  topTradesRank: number;
  minBuySell6h: number;
  /** DEX profile paid within this long after launch. */
  maxDexPaidMinutes: number;
  /** The project's X account: blue check, website, contract posted by itself, and the AI narrative veto. */
  requireSocial: boolean;
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
};

/** Shares of the agent's budget. */
export type SizingRules = {
  firstBuyShare: number;
  addShare: number;
  maxPerTokenShare: number;
  maxOpenTokens: number;
  dailyLossShare: number;
  totalLossShare: number;
};

export type TrenchRules = { version: 1; entry: EntryRules; exit: ExitRules; sizing: SizingRules };

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
    entry: {
      maxAgeHours: 24,
      minBonding: 0.35,
      maxBonding: 0.7,
      maxTaxBps: 200,
      maxDevPct: 1,
      maxFreshPct: 5,
      minPullbackPct: 15,
      maxPullbackPct: 45,
      minTraders24h: 90,
      topTradesRank: 3,
      minBuySell6h: 1,
      maxDexPaidMinutes: 90,
      requireSocial: true,
    },
    exit: {
      stopPct: 25,
      ladder: [
        { gainPct: 50, sellShareOfEntry: 0.5 },
        { gainPct: 100, sellShareOfEntry: 0.25 },
      ],
      trailingPct: 30,
      graduateBonding: 0.95,
      timeStopHours: 6,
      timeStopNeedGainPct: 20,
      flatBondingHours: 2,
      flatBondingPts: 0.01,
      minBuySell1h: 0.7,
      minVolume1hUsd: 200,
      addBondingPts: 0.1,
      addMinBuySell6h: 1,
    },
    sizing: { firstBuyShare: 0.1, addShare: 0.1, maxPerTokenShare: 0.2, maxOpenTokens: 4, dailyLossShare: 0.2, totalLossShare: 0.7 },
  },
} as const satisfies Record<string, TrenchRules>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export const PRESET_INFO: Record<PresetId, { name: string; summary: string }> = {
  almost_bonded: {
    name: "Almost Bonded",
    summary: "PONS tokens 35 to 70% along their curve after a pullback, with tight holder, buyer and X checks. Stop -25%, profit ladder, sells before graduation.",
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

/**
 * Rules from untrusted JSON, based on a preset: every field is read, clamped to a safe range, and
 * falls back to the preset's value. The stop loss can be tuned but never removed.
 */
export function parseTrenchRules(raw: unknown, base: PresetId = "almost_bonded"): TrenchRules {
  const preset = PRESETS[base];
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

  return {
    version: 1,
    entry: {
      maxAgeHours: clamp(entry.maxAgeHours, e.maxAgeHours, 0.25, 168),
      minBonding,
      maxBonding: clamp(entry.maxBonding, e.maxBonding, minBonding, 0.94),
      maxTaxBps: clamp(entry.maxTaxBps, e.maxTaxBps, 0, 500),
      maxDevPct: clamp(entry.maxDevPct, e.maxDevPct, 0, 20),
      maxFreshPct: clamp(entry.maxFreshPct, e.maxFreshPct, 0, 50),
      minPullbackPct,
      maxPullbackPct: clamp(entry.maxPullbackPct, e.maxPullbackPct, minPullbackPct, 95),
      minTraders24h: clamp(entry.minTraders24h, e.minTraders24h, 0, 10_000),
      topTradesRank: Math.round(clamp(entry.topTradesRank, e.topTradesRank, 0, 50)),
      minBuySell6h: clamp(entry.minBuySell6h, e.minBuySell6h, 0, 10),
      maxDexPaidMinutes: clamp(entry.maxDexPaidMinutes, e.maxDexPaidMinutes, 0, 10_080),
      requireSocial: typeof entry.requireSocial === "boolean" ? entry.requireSocial : e.requireSocial,
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
