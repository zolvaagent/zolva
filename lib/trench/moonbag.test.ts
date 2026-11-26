/**
 * Research's exit v3 "moonbag" (pre-registered 5f2d07c) for house agents, its locked-guard boundary,
 * and the candidate log's pure parts.
 */
import { describe, expect, it } from "vitest";

import { calloutExitNote } from "./callouts.ts";
import { candidateVerdict, dueHorizons } from "./candidate-log.ts";
import { decideExit, type CandidateInput, type Market, type Position, type RushrToken } from "./engine.ts";
import { agentRules, describeRules, moonbagRules, parseTrenchRules, PRESETS } from "./rules.ts";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 26, 12);

const position = (over: Partial<Position> = {}): Position => ({
  token: "0x" + "1".repeat(40),
  tokens: 1_000_000n,
  tokensBought: 1_000_000n,
  costEth: 1,
  openedAtMs: NOW - 2 * HOUR,
  entryBonding: 0.6,
  highPerToken: 1 / 1_000_000,
  maxGainPct: 0,
  laddersDone: 0,
  added: false,
  lastBondingMove: { bonding: 0.6, atMs: NOW - 2 * HOUR },
  entryDevPct: 1,
  entryTop10Pct: 30,
  stopHits: 0,
  launchedAtMs: NOW - 3 * HOUR,
  ...over,
});

const market = (over: Partial<Market> = {}): Market => ({
  nowMs: NOW,
  valueEth: 1,
  bonding: 0.6,
  graduated: false,
  devPct: 1,
  top10Pct: 30,
  buySell1h: 1,
  volume1hUsd: 1000,
  buySell6h: 1,
  safetyBlocked: false,
  ...over,
});

const moon = moonbagRules().exit;

describe("moonbag exit (v3)", () => {
  it("has no stop: an 80% drop is held", () => {
    expect(decideExit(position(), market({ valueEth: 0.2 }), moon).kind).toBe("hold");
  });

  it("ignores sellers, dev and top-10 selling, and safety flags (no red-flag exits in v3)", () => {
    const action = decideExit(position(), market({ valueEth: 0.7, buySell1h: 0.1, devPct: 0, top10Pct: 5, safetyBlocked: true }), moon);
    expect(action.kind).toBe("hold");
  });

  it("sells half of the entry at +100%", () => {
    const action = decideExit(position(), market({ valueEth: 2 }), moon);
    expect(action).toMatchObject({ kind: "sell", share: 0.5, exitKind: "ladder", ladderStep: 1 });
  });

  it("after the ladder, trails 45% from the peak", () => {
    const after = position({ tokens: 500_000n, costEth: 0.5, laddersDone: 1, highPerToken: 3 / 1_000_000 });
    // Peak value 1.5 ETH for the half; 0.83 ETH is above peak x 0.55 (0.825): hold. 0.82 is below: sell.
    expect(decideExit(after, market({ valueEth: 0.83 }), moon).kind).toBe("hold");
    expect(decideExit(after, market({ valueEth: 0.82 }), moon)).toMatchObject({ kind: "sell", share: 1, exitKind: "trail" });
  });

  it("sells everything at 95% bonding or on graduation", () => {
    expect(decideExit(position(), market({ bonding: 0.95 }), moon)).toMatchObject({ kind: "sell", share: 1, exitKind: "graduation" });
    expect(decideExit(position(), market({ graduated: true }), moon, false)).toMatchObject({ kind: "sell", share: 1, exitKind: "graduation" });
  });

  it("sells everything 7 days after the token's launch, not after our entry", () => {
    const old = position({ launchedAtMs: NOW - 168 * HOUR, openedAtMs: NOW - 10 * HOUR });
    expect(decideExit(old, market(), moon)).toMatchObject({ kind: "sell", share: 1, exitKind: "time" });
    expect(decideExit(position({ launchedAtMs: NOW - 167 * HOUR }), market(), moon).kind).toBe("hold");
  });

  it("never adds", () => {
    const strong = decideExit(position(), market({ valueEth: 1.5, bonding: 0.85, buySell6h: 3 }), moon);
    expect(strong.kind).toBe("hold");
  });

  it("keeps Research's frozen values", () => {
    expect(moon).toMatchObject({ style: "moonbag", ladder: [{ gainPct: 100, sellShareOfEntry: 0.5 }], trailingPct: 45, graduateBonding: 0.95, maxHoursFromLaunch: 168 });
    expect(moonbagRules().entry).toEqual(PRESETS.almost_bonded.entry);
    expect(moonbagRules().sizing).toEqual(PRESETS.almost_bonded.sizing);
  });
});

describe("locked guard: only house agents may drop the stop", () => {
  const stored = moonbagRules();

  it("a user's custom rules asking for the moonbag still get the v2 exit with its stop", () => {
    expect(parseTrenchRules(stored).exit.style).toBe("v2");
    expect(agentRules({ preset: "almost_bonded", rules: stored, custom: true }).exit.style).toBe("v2");
    expect(agentRules({ preset: "almost_bonded", rules: stored, custom: true }).exit.stopPct).toBeGreaterThanOrEqual(5);
  });

  it("a house agent trades its stored moonbag rules", () => {
    expect(agentRules({ preset: "almost_bonded", rules: stored, custom: false, house: true }).exit.style).toBe("moonbag");
  });

  it("non-house agents keep exit v2", () => {
    expect(agentRules({ preset: "almost_bonded", rules: null, custom: false }).exit.style).toBe("v2");
  });

  it("says so in plain words and in the call", () => {
    expect(describeRules(stored).sells).toMatch(/^No stop loss/);
    expect(describeRules(stored).line).toContain("no stop (moonbag)");
    expect(calloutExitNote(stored.exit)).toBe("No stop: 50% out at +100%, the rest trails 45%.");
    expect(calloutExitNote(PRESETS.almost_bonded.exit)).toBe("Stop -25%.");
  });
});

describe("candidate log", () => {
  const rules = parseTrenchRules(PRESETS.almost_bonded);
  const token = (over: Partial<RushrToken> = {}): RushrToken =>
    ({ address: "0x" + "2".repeat(40), symbol: "TEST", launchpad: "pons", created_at: new Date(NOW - HOUR).toISOString(), bonding_progress: 0.01, ...over }) as RushrToken;

  it("names the stage that stopped a token", () => {
    const verdict = candidateVerdict({ token: token(), tradesRank: 1, checks: null, social: null } as CandidateInput, rules, NOW);
    expect(verdict.stage).toBe("list");
    expect(verdict.reason).toBeTruthy();
  });

  it("due horizons: only those reached and not yet recorded", () => {
    const first = NOW - 7 * HOUR;
    expect(dueHorizons(first, {}, NOW)).toEqual(["1h", "6h"]);
    expect(dueHorizons(first, { "1h": {} }, NOW)).toEqual(["6h"]);
    expect(dueHorizons(NOW - 30 * 60_000, {}, NOW)).toEqual([]);
    expect(dueHorizons(NOW - 200 * HOUR, { "1h": {}, "6h": {}, "24h": {}, "72h": {} }, NOW)).toEqual(["7d"]);
  });
});
