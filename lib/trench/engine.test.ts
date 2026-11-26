/**
 * Trench engine tests. The decideExit, stage and limit cases are the Zolva Lab agent's own tests
 * (zolva-lab-agent test/exits.test.ts and rules-limits-curve.test.ts) on the "almost_bonded"
 * preset with a $100 budget, so the app engine and the Lab agent decide the same way.
 */
import { encodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";

import { buyCallout, sellComment, stripLinks } from "./callouts.ts";
import { checkBuild, PERMIT2, RUSHR_TREASURY, UNIVERSAL_ROUTER, type Build } from "./check-build.ts";
import { buyOut, sellOut, type CurveState } from "./curve.ts";
import {
  caPosted,
  checkBuy,
  decideExit,
  listStage,
  mustHalt,
  reentryVerdict,
  runMinute,
  socialStage,
  statsStage,
  track,
  type Book,
  type CandidateInput,
  type Market,
  type MinuteInput,
  type Position,
  type RushrStats,
  type RushrToken,
} from "./engine.ts";
import { maxTxWeiFor, trenchPolicyRules } from "./policy.ts";
import { describeRules, EDITABLE_FIELDS, isCustom, limitsFor, parseTrenchRules, PRESETS } from "./rules.ts";
import { parseNarrative } from "./social.ts";

const RULES = parseTrenchRules({}, "almost_bonded");
// The Lab agent's own exits (v1): Curve Rider moved to exit v2 on 2026-11-18, the Lab agent did not,
// so the Lab cases run on v1 settings to keep both decision paths covered.
const X = { ...RULES.exit, ladder: [{ gainPct: 50, sellShareOfEntry: 0.5 }, { gainPct: 100, sellShareOfEntry: 0.25 }], trailingPct: 30, lockInPct: -100, weakFlowTrailPct: 0, stopConfirmMinutes: 1 };
const LIMITS = limitsFor(RULES, 100);

describe("rules", () => {
  it("the preset parses to itself and matches the Lab's $100 limits", () => {
    expect(RULES).toEqual(PRESETS.almost_bonded);
    expect(LIMITS).toEqual({ capitalUsd: 100, firstBuyUsd: 10, addUsd: 10, maxPerTokenUsd: 20, maxOpenTokens: 4, dailyLossUsd: 20, totalLossUsd: 70 });
  });

  it("clamps untrusted rules and keeps the locked stop loss", () => {
    const wild = parseTrenchRules({ exit: { stopPct: 0 }, entry: { minBonding: 0.8, maxBonding: 0.1, junk: 1 }, sizing: { firstBuyShare: 5, maxOpenTokens: 99 } });
    expect(wild.exit.stopPct).toBe(5);
    expect(parseTrenchRules({ exit: { stopPct: 99 } }).exit.stopPct).toBe(50);
    expect(wild.entry.maxBonding).toBeGreaterThanOrEqual(wild.entry.minBonding);
    expect(wild.sizing.firstBuyShare).toBe(0.5);
    expect(wild.sizing.maxOpenTokens).toBe(10);
    expect("junk" in wild.entry).toBe(false);
    expect(parseTrenchRules("not json").exit.stopPct).toBe(25);
  });
});

// ---------------------------------------------------------------- Lab exits

const H = 3_600_000;
const position: Position = {
  token: "0xabc",
  tokens: 1000n,
  tokensBought: 1000n,
  costEth: 1,
  openedAtMs: 0,
  entryBonding: 0.5,
  highPerToken: 0.001,
  maxGainPct: 0,
  laddersDone: 0,
  added: false,
  lastBondingMove: { bonding: 0.5, atMs: 0 },
  entryDevPct: 0,
  entryTop10Pct: 25,
  stopHits: 0,
};
const market: Market = { nowMs: H, valueEth: 1, bonding: 0.52, graduated: false, devPct: 0, top10Pct: 25, buySell1h: 1.2, volume1hUsd: 500, buySell6h: 1.1, safetyBlocked: false };

describe("decideExit (Lab cases)", () => {
  it("holds a quiet position", () => {
    expect(decideExit(position, market, X).kind).toBe("hold");
  });

  it("stops out at -25% net", () => {
    expect(decideExit(position, { ...market, valueEth: 0.75 }, X)).toMatchObject({ kind: "sell", share: 1, reason: expect.stringMatching(/^stop/) });
    expect(decideExit(position, { ...market, valueEth: 0.76 }, X).kind).toBe("hold");
  });

  it("sells on invalidation: safety, dev or top 10 selling, sellers leading", () => {
    expect(decideExit(position, { ...market, safetyBlocked: true }, X).reason).toMatch(/safety/);
    expect(decideExit({ ...position, entryDevPct: 0.4 }, { ...market, devPct: 0.1 }, X).reason).toMatch(/dev sold/);
    expect(decideExit(position, { ...market, top10Pct: 18 }, X).reason).toMatch(/top 10/);
    expect(decideExit(position, { ...market, buySell1h: 0.5 }, X).reason).toMatch(/1h buy\/sell/);
    expect(decideExit(position, { ...market, buySell1h: 0.5, volume1hUsd: 50 }, X).kind).toBe("hold");
  });

  it("sells everything near graduation", () => {
    expect(decideExit(position, { ...market, bonding: 0.95 }, X).reason).toMatch(/graduation/);
    expect(decideExit(position, { ...market, graduated: true }, X).reason).toMatch(/graduation/);
  });

  it("time stops: no +20% in 6h, or bonding flat for 2h", () => {
    expect(decideExit(position, { ...market, nowMs: 6 * H, bonding: 0.6 }, X).reason).toMatch(/no \+20%/);
    expect(decideExit({ ...position, maxGainPct: 25 }, { ...market, nowMs: 6 * H, bonding: 0.6 }, X).kind).toBe("hold");
    expect(decideExit(position, { ...market, nowMs: 2 * H, bonding: 0.505 }, X).reason).toMatch(/flat/);
  });

  it("takes profit on the ladder, then trails the rest", () => {
    expect(decideExit(position, { ...market, valueEth: 1.5 }, X)).toMatchObject({ kind: "sell", share: 0.5, ladderStep: 1 });
    const half = { ...position, tokens: 500n, costEth: 0.5, laddersDone: 1, highPerToken: 0.0015 };
    const second = decideExit(half, { ...market, valueEth: 1.0 }, X);
    expect(second).toMatchObject({ kind: "sell", ladderStep: 2 });
    expect((second as { share: number }).share).toBeCloseTo(0.5);
    const rest = { ...position, tokens: 250n, costEth: 0.25, laddersDone: 2, highPerToken: 0.004 };
    expect(decideExit(rest, { ...market, valueEth: 0.7 }, X).reason).toMatch(/trailing/);
    expect(decideExit(rest, { ...market, valueEth: 0.9 }, X).kind).toBe("hold");
  });

  it("adds once on strength, never on weakness", () => {
    expect(decideExit(position, { ...market, valueEth: 1.1, bonding: 0.61 }, X).kind).toBe("add");
    expect(decideExit({ ...position, added: true }, { ...market, valueEth: 1.1, bonding: 0.61 }, X).kind).toBe("hold");
    expect(decideExit(position, { ...market, valueEth: 0.95, bonding: 0.61 }, X).kind).toBe("hold");
  });

  it("track keeps the high, the best gain and the bonding clock", () => {
    const next = track(position, { ...market, valueEth: 1.3, bonding: 0.56, nowMs: 3 * H }, X);
    expect(next.maxGainPct).toBeCloseTo(30);
    expect(next.highPerToken).toBeCloseTo(0.0013);
    expect(next.lastBondingMove).toEqual({ bonding: 0.56, atMs: 3 * H });
    expect(track(next, { ...market, valueEth: 1, bonding: 0.565, nowMs: 4 * H }, X).lastBondingMove.atMs).toBe(3 * H);
  });
});

// ---------------------------------------------------------------- Lab entry stages and limits

const NOW = Date.parse("2026-11-17T12:00:00Z");
const token: RushrToken = {
  address: "0xd893000000000000000000000000000000000cb4",
  symbol: "INT",
  name: "Intercept",
  launchpad: "pons",
  status: "new",
  quote: "0x0000000000000000000000000000000000000000",
  created_at: "2026-11-17T07:00:00Z",
  migrated_at: null,
  market_cap_usd: 21_500,
  ath_market_cap_usd: 26_200,
  bonding_progress: 0.66,
  dev_pct: 0.4,
  fresh_pct: 3.4,
  top10_pct: 23.6,
  trades_24h: 720,
  twitter_handle: "intercept",
  website: "https://example.org",
  buy_tax_bps: 160,
  sell_tax_bps: 160,
  no_sells: false,
  farm: false,
  spam: false,
};
const w = (buyUsd: number, sellUsd: number, makers = 0) => ({ buyUsd, sellUsd, makers, buys: 0, sells: 0, volumeUsd: buyUsd + sellUsd });
const stats: RushrStats = { "5m": w(0, 0), "1h": w(100, 80), "6h": w(1440, 1000), "24h": w(5000, 4000, 154) };
const reason = (verdict: { pass: boolean; reason?: string }) => verdict.reason;

describe("entry stages (Lab cases)", () => {
  it("passes the owner's pick on every stage", () => {
    expect(listStage(token, RULES, NOW)).toEqual({ pass: true });
    expect(statsStage({ stats, tradesRank: 2, safetyBlocked: false, dexPaidMinutesAfterLaunch: 11 }, RULES)).toEqual({ pass: true });
    expect(socialStage({ blueVerified: true, hasWebsite: true, caInOwnTweets: true, narrative: { ok: true, reason: "security infra" } })).toEqual({ pass: true });
  });

  it("says why it rejects", () => {
    expect(reason(listStage({ ...token, created_at: "2026-11-16T06:00:00Z" }, RULES, NOW))).toMatch(/age/);
    expect(reason(listStage({ ...token, bonding_progress: 0.8 }, RULES, NOW))).toMatch(/bonding/);
    expect(reason(listStage({ ...token, buy_tax_bps: 300 }, RULES, NOW))).toMatch(/tax/);
    expect(reason(listStage({ ...token, dev_pct: 37 }, RULES, NOW))).toMatch(/dev/);
    expect(reason(listStage({ ...token, fresh_pct: 11 }, RULES, NOW))).toMatch(/fresh/);
    expect(reason(listStage({ ...token, market_cap_usd: 26_000 }, RULES, NOW))).toMatch(/pullback/);
    expect(reason(listStage({ ...token, migrated_at: "2026-11-17T11:00:00Z" }, RULES, NOW))).toMatch(/graduated/);
    expect(reason(statsStage({ stats, tradesRank: 5, safetyBlocked: false, dexPaidMinutesAfterLaunch: null }, RULES))).toMatch(/DEX not paid/);
    expect(reason(statsStage({ stats: { ...stats, "6h": w(900, 1000) }, tradesRank: 1, safetyBlocked: false, dexPaidMinutesAfterLaunch: 5 }, RULES))).toMatch(/6h buy\/sell/);
    expect(reason(statsStage({ stats: { ...stats, "24h": w(1, 1, 40) }, tradesRank: 6, safetyBlocked: false, dexPaidMinutesAfterLaunch: 5 }, RULES))).toMatch(/traders/);
    expect(reason(statsStage({ stats: { ...stats, "1h": w(30, 270) }, tradesRank: 1, safetyBlocked: false, dexPaidMinutesAfterLaunch: 5 }, RULES))).toMatch(/1h buy\/sell 0\.11/);
    expect(statsStage({ stats: { ...stats, "1h": w(10, 90) }, tradesRank: 1, safetyBlocked: false, dexPaidMinutesAfterLaunch: 5 }, RULES)).toEqual({ pass: true });
    expect(reason(socialStage({ blueVerified: true, hasWebsite: true, caInOwnTweets: false, narrative: { ok: true, reason: "" } }))).toMatch(/contract address/);
  });

  it("finds the CA only in the account's own tweets", () => {
    expect(caPosted(token.address, [{ text: `CA: ${token.address.toUpperCase()}`, isRetweet: false }])).toBe(true);
    expect(caPosted(token.address, [{ text: `RT CA: ${token.address}`, isRetweet: true }])).toBe(false);
  });
});

describe("limits (Lab cases)", () => {
  const book: Book = { open: [], realisedTodayUsd: 0, realisedTotalUsd: 0, halted: false, buysOff: false };

  it("allows a $10 first buy and one $10 add", () => {
    expect(checkBuy(book, LIMITS, "a", "first")).toEqual({ ok: true, usd: 10 });
    expect(checkBuy({ ...book, open: [{ token: "a", costUsd: 10, valueUsd: 12 }] }, LIMITS, "a", "add")).toEqual({ ok: true, usd: 10 });
    expect(checkBuy({ ...book, open: [{ token: "a", costUsd: 20, valueUsd: 25 }] }, LIMITS, "a", "add")).toMatchObject({ ok: false, reason: expect.stringMatching(/\$20/) });
  });

  it("caps open tokens, the day loss, the total loss and obeys the switch", () => {
    const four = { ...book, open: ["a", "b", "c", "d"].map((t) => ({ token: t, costUsd: 10, valueUsd: 10 })) };
    expect(checkBuy(four, LIMITS, "e", "first")).toMatchObject({ ok: false, reason: expect.stringMatching(/4 tokens/) });
    expect(checkBuy({ ...book, realisedTodayUsd: -20 }, LIMITS, "a", "first")).toMatchObject({ ok: false, reason: expect.stringMatching(/day stop/) });
    const deep = { ...book, realisedTotalUsd: -60, open: [{ token: "a", costUsd: 20, valueUsd: 9 }] };
    expect(mustHalt(deep, LIMITS)).toBe(true);
    expect(checkBuy(deep, LIMITS, "b", "first")).toMatchObject({ ok: false, reason: expect.stringMatching(/total stop/) });
    expect(checkBuy({ ...book, buysOff: true }, LIMITS, "a", "first")).toMatchObject({ ok: false, reason: "buys are off" });
  });

  it("never spends more than the capital left", () => {
    const spent = { ...book, realisedTotalUsd: -35, open: ["a", "b", "c"].map((t) => ({ token: t, costUsd: 20, valueUsd: 20 })) };
    expect(checkBuy(spent, LIMITS, "d", "first")).toMatchObject({ ok: false, reason: expect.stringMatching(/left/) });
  });
});

// ---------------------------------------------------------------- one minute, crowding

const candidate = (overrides: Partial<CandidateInput> = {}): CandidateInput => ({
  token,
  tradesRank: 1,
  checks: { stats, safetyBlocked: false, dexPaidMinutesAfterLaunch: 11 },
  social: { pass: true },
  ...overrides,
});
const minute = (overrides: Partial<MinuteInput> = {}): MinuteInput => ({
  nowMs: NOW,
  rules: RULES,
  limits: LIMITS,
  book: { realisedTodayUsd: 0, realisedTotalUsd: 0, halted: false, buysOff: false },
  held: [],
  everHeld: new Set(),
  candidates: [candidate()],
  crowding: { maxTokenExposureUsd: 200, maxBuysPerTokenMinute: 3, exposureUsd: new Map(), buysThisMinute: new Map() },
  ...overrides,
});

describe("runMinute", () => {
  it("buys a candidate that passes every stage", () => {
    const { actions } = runMinute(minute());
    expect(actions).toEqual([expect.objectContaining({ kind: "buy", token: token.address, usd: 10 })]);
  });

  it("never buys without checks, without the social verdict, or a token it held before", () => {
    expect(runMinute(minute({ candidates: [candidate({ checks: null })] })).actions).toEqual([]);
    expect(runMinute(minute({ candidates: [candidate({ social: null })] })).actions).toEqual([]);
    expect(runMinute(minute({ everHeld: new Set([token.address]) })).actions).toEqual([]);
    expect(runMinute(minute({ candidates: [candidate({ social: { pass: false, reason: "X account has no blue check" } })] })).actions).toEqual([
      expect.objectContaining({ kind: "skip", reason: "X account has no blue check" }),
    ]);
  });

  it("respects the crowding caps shared by all Zolva agents", () => {
    const full = minute({ crowding: { maxTokenExposureUsd: 200, maxBuysPerTokenMinute: 3, exposureUsd: new Map([[token.address, 195]]), buysThisMinute: new Map() } });
    expect(runMinute(full).actions[0]).toMatchObject({ kind: "skip", reason: expect.stringMatching(/Zolva agents already hold/) });
    const busy = minute({ crowding: { maxTokenExposureUsd: 200, maxBuysPerTokenMinute: 3, exposureUsd: new Map(), buysThisMinute: new Map([[token.address, 3]]) } });
    expect(runMinute(busy).actions[0]).toMatchObject({ kind: "skip", reason: expect.stringMatching(/3 Zolva buys/) });
  });

  it("sells everything and buys nothing once the total stop fires", () => {
    const held = [{ position, symbol: "OLD", costUsd: 20, market: { ...market, valueEth: 0.9 } }];
    const result = runMinute(minute({ held, book: { realisedTodayUsd: 0, realisedTotalUsd: -68, halted: false, buysOff: false } }));
    expect(result.halt).toBe(true);
    expect(result.actions).toEqual([expect.objectContaining({ kind: "sell", share: 1, reason: expect.stringMatching(/total stop/) })]);
  });

  it("keeps running exits while buys are off", () => {
    // Curve Rider (v2) needs 2 closes below the stop: this is the second.
    const held = [{ position: { ...position, stopHits: 1 }, symbol: "OLD", costUsd: 10, market: { ...market, valueEth: 0.7 } }];
    const { actions } = runMinute(minute({ held, book: { realisedTodayUsd: 0, realisedTotalUsd: 0, halted: false, buysOff: true } }));
    expect(actions[0]).toMatchObject({ kind: "sell", reason: expect.stringMatching(/^stop/) });
    expect(actions[1]).toMatchObject({ kind: "skip", reason: expect.stringMatching(/buys are off/) });
  });
});

// ---------------------------------------------------------------- curve, builds, policy, texts

describe("curve math (Lab cases)", () => {
  const curve: CurveState = {
    curve: "0x0000000000000000000000000000000000000001",
    quoteReserve: 10n ** 18n,
    tokenReserve: 10n ** 27n,
    feeBps: 100,
    creatorTaxBps: 200,
    graduated: false,
    realQuoteReserve: 0n,
    graduationThreshold: 4n * 10n ** 18n,
    sellableTokens: 8n * 10n ** 26n,
  };

  it("loses about the fees on an instant round trip", () => {
    const ethIn = 10n ** 16n;
    const out = buyOut(ethIn, curve);
    const after = { ...curve, quoteReserve: curve.quoteReserve + (ethIn * 97n) / 100n, tokenReserve: curve.tokenReserve - out };
    const lossPct = (1 - Number(sellOut(out, after)) / Number(ethIn)) * 100;
    expect(lossPct).toBeGreaterThan(5.8);
    expect(lossPct).toBeLessThan(6.0);
  });

  it("never buys more than the curve still sells", () => {
    expect(buyOut(10n ** 22n, curve)).toBe(curve.sellableTokens);
  });
});

const tokenAddress = "0x1111111111111111111111111111111111111111";
const curveAddress = "0x2222222222222222222222222222222222222222";
const wallet = "0x3333333333333333333333333333333333333333";
const tx = (to: string, value = "0", data = "0x") => ({ chainId: 4663, to, data, value });
const buyBuild: Build = {
  tx: tx(curveAddress, "1000000"),
  approvals: [],
  followUp: { kind: "rushr_fee", amount: "2500", tx: tx(RUSHR_TREASURY, "2500") },
  quote: { amountIn: "1000000", amountOut: "5000", minAmountOut: "4800", pool: { venue: "pons-curve", curve: curveAddress }, fee: { feeAmount: "2500" } },
  simulation: { ok: true, error: null },
};
const expectBuy = { side: "buy" as const, token: tokenAddress, curve: curveAddress, amountIn: 1_000_000n };

describe("checkBuild (Lab cases)", () => {
  it("accepts a curve buy with the Rushr fee", () => {
    expect(() => checkBuild(buyBuild, expectBuy)).not.toThrow();
  });

  it("refuses anything that goes elsewhere, spends more or was not simulated", () => {
    expect(() => checkBuild({ ...buyBuild, tx: tx("0x9999999999999999999999999999999999999999", "1000000") }, expectBuy)).toThrow(/tx goes to/);
    expect(() => checkBuild({ ...buyBuild, tx: tx(curveAddress, "2000000") }, expectBuy)).toThrow(/buy value/);
    expect(() => checkBuild({ ...buyBuild, tx: { ...tx(curveAddress, "1000000"), chainId: 1 } }, expectBuy)).toThrow(/chain/);
    expect(() => checkBuild({ ...buyBuild, followUp: { kind: "rushr_fee", amount: "1", tx: tx(wallet, "2500") } }, expectBuy)).toThrow(/fee transfer/);
    expect(() => checkBuild({ ...buyBuild, followUp: { kind: "rushr_fee", amount: "1", tx: tx(RUSHR_TREASURY, "20000") } }, expectBuy)).toThrow(/over 1%/);
    expect(() => checkBuild({ ...buyBuild, simulation: { ok: false, error: "revert" } }, expectBuy)).toThrow(/simulation/);
    expect(() => checkBuild({ ...buyBuild, simulation: undefined }, expectBuy)).toThrow(/no simulation/);
  });

  it("checks every approval on a sell", () => {
    const approve = (spender: string) => encodeFunctionData({ abi: parseAbi(["function approve(address,uint256) returns (bool)"]), functionName: "approve", args: [spender as `0x${string}`, 10n] });
    const permit = encodeFunctionData({
      abi: parseAbi(["function approve(address token, address spender, uint160 amount, uint48 expiration)"]),
      functionName: "approve",
      args: [tokenAddress, UNIVERSAL_ROUTER, 10n, 1],
    });
    const sell: Build = { ...buyBuild, tx: tx(UNIVERSAL_ROUTER), followUp: null, approvals: [{ kind: "erc20", token: tokenAddress, spender: PERMIT2, tx: tx(tokenAddress, "0", approve(PERMIT2)) }, { kind: "permit2", token: tokenAddress, spender: UNIVERSAL_ROUTER, tx: tx(PERMIT2, "0", permit) }] };
    const expectSell = { side: "sell" as const, token: tokenAddress, curve: null, amountIn: 10n };
    expect(() => checkBuild(sell, expectSell)).not.toThrow();
    const bad = { ...sell, approvals: [{ kind: "erc20", token: tokenAddress, spender: wallet, tx: tx(tokenAddress, "0", approve(wallet)) }] };
    expect(() => checkBuild(bad, expectSell)).toThrow(/approval to/);
  });
});

describe("policy", () => {
  it("caps ETH per transaction, pays curve trades to the wallet and withdraws only to the owner", () => {
    const owner = "0x4444444444444444444444444444444444444444";
    const cap = maxTxWeiFor(20, 3000);
    expect(cap).toBe(10_000_000_000_000_000n); // $30 at $3,000 = 0.01 ETH
    const rules = trenchPolicyRules(wallet.toUpperCase(), owner, cap);
    expect(rules.every((rule) => rule.method === "eth_signTransaction")).toBe(true);
    const json = JSON.stringify(rules);
    expect(json).toContain(wallet.toLowerCase());
    expect(json).toContain(owner);
    expect(json).toContain(cap.toString());
    expect(json).not.toContain("personal_sign");
  });
});

describe("texts", () => {
  it("callouts and comments carry no links and stay within Rushr's limits", () => {
    expect(stripLinks("see https://x.com/a and token.fun now")).toBe("see and now");
    const call = buyCallout({ symbol: "ORRY", usd: 10, ruleFacts: "bonding 44%, dev 0%", narrative: "AI payments infra", presetName: "Curve Rider", exitNote: "Stop -25%." });
    expect(call).toMatch(/^Bullish \$ORRY: bought \$10 by rule \(Curve Rider\)/);
    expect(call).toMatch(/not advice/);
    expect(sellComment({ sharePct: 100, eth: 0.002, pnlUsd: -3.1, reason: "stop: -30.9% from entry" })).toBe("Sold 100% for 0.00200 ETH (-$3.10). Why: stop: -30.9% from entry.");
  });

  it("parseNarrative passes only a clear ok", () => {
    expect(parseNarrative('{"ok": true, "reason": "agent payments infra"}')).toEqual({ ok: true, reason: "agent payments infra" });
    expect(parseNarrative('Sure! {"ok": false, "reason": "penguin game"}')).toEqual({ ok: false, reason: "penguin game" });
    expect(parseNarrative("yes")).toEqual({ ok: false, reason: "unreadable answer" });
  });
});

// ---------------------------------------------------------------- Graduated Safe and custom rules

describe("Graduated Safe", () => {
  const GRAD = parseTrenchRules({}, "graduated_safe");
  const graduated: RushrToken = {
    ...token,
    symbol: "NOUNY",
    launchpad: "pons",
    created_at: "2026-11-16T18:00:00Z",
    migrated_at: "2026-11-17T00:00:00Z",
    bonding_progress: 1,
    dev_pct: 0,
    fresh_pct: 2,
    top10_pct: 24,
    buy_tax_bps: 200,
    sell_tax_bps: 200,
    holders: 466,
    volume_24h_usd: 465_703,
    risk: "medium",
    snipers_pct: 10,
    bundled_pct: 5,
  };

  it("is its own market with tighter exits", () => {
    expect(GRAD.market).toBe("graduated");
    expect(GRAD.exit.stopPct).toBe(15);
    expect(limitsFor(GRAD, 100)).toMatchObject({ firstBuyUsd: 8, maxOpenTokens: 5, totalLossUsd: 50 });
  });

  it("passes a graduated token with holders, volume and medium risk, and says why it rejects", () => {
    expect(listStage(graduated, GRAD, NOW)).toEqual({ pass: true });
    expect(reason(listStage({ ...graduated, migrated_at: "2026-11-17T09:00:00Z" }, GRAD, NOW))).toMatch(/waits 6h/);
    expect(reason(listStage({ ...graduated, migrated_at: null }, GRAD, NOW))).toMatch(/not graduated/);
    expect(reason(listStage({ ...graduated, holders: 120 }, GRAD, NOW))).toMatch(/holders/);
    expect(reason(listStage({ ...graduated, volume_24h_usd: 9_000 }, GRAD, NOW))).toMatch(/volume/);
    expect(reason(listStage({ ...graduated, risk: "high" }, GRAD, NOW))).toMatch(/risk high/);
    expect(reason(listStage({ ...graduated, top10_pct: 39 }, GRAD, NOW))).toMatch(/top 10/);
    expect(reason(listStage({ ...graduated, snipers_pct: 38.4 }, GRAD, NOW))).toMatch(/snipers/);
    // A curve preset never takes a graduated token, and the reverse.
    expect(listStage(graduated, RULES, NOW).pass).toBe(false);
    expect(listStage(token, GRAD, NOW).pass).toBe(false);
  });

  it("needs no paid DEX profile and no X checks", () => {
    expect(statsStage({ stats: { ...stats, "6h": w(1200, 1000) }, tradesRank: 0, safetyBlocked: false, dexPaidMinutesAfterLaunch: null }, GRAD)).toEqual({ pass: true });
    const { actions } = runMinute(minute({ rules: GRAD, limits: limitsFor(GRAD, 100), candidates: [{ token: graduated, tradesRank: 1, checks: { stats: { ...stats, "6h": w(1200, 1000) }, safetyBlocked: false, dexPaidMinutesAfterLaunch: null }, social: null }] }));
    expect(actions).toEqual([expect.objectContaining({ kind: "buy", usd: 8, reason: expect.stringMatching(/graduated, 466 holders/) })]);
  });

  it("skips the curve-only exits and leaves after 4 hours", () => {
    const held = { ...position, entryBonding: 1, lastBondingMove: { bonding: 1, atMs: 0 } };
    expect(decideExit(held, { ...market, graduated: true, bonding: 1 }, GRAD.exit, false).kind).toBe("hold");
    expect(decideExit(held, { ...market, nowMs: 4 * H, valueEth: 1.1, graduated: true, bonding: 1 }, GRAD.exit, false).reason).toMatch(/time stop/);
    expect(decideExit(held, { ...market, valueEth: 0.85, graduated: true }, GRAD.exit, false).reason).toMatch(/^stop/);
    expect(decideExit(held, { ...market, valueEth: 1.25, graduated: true, bonding: 1 }, GRAD.exit, false)).toMatchObject({ kind: "sell", share: 0.5, ladderStep: 1 });
  });
});

describe("custom rules", () => {
  it("keep the preset's market and the locked stop, and are flagged as custom", () => {
    const edited = parseTrenchRules({ ...PRESETS.almost_bonded, market: "graduated", exit: { ...PRESETS.almost_bonded.exit, stopPct: 0 }, sizing: { ...PRESETS.almost_bonded.sizing, firstBuyShare: 0.05 } }, "almost_bonded");
    expect(edited.market).toBe("curve");
    expect(edited.exit.stopPct).toBe(5);
    expect(edited.sizing.firstBuyShare).toBe(0.05);
    expect(isCustom(edited, "almost_bonded")).toBe(true);
    expect(isCustom(parseTrenchRules({}, "graduated_safe"), "graduated_safe")).toBe(false);
  });

  it("every editable field round-trips through the parser inside its range", () => {
    for (const field of EDITABLE_FIELDS) {
      for (const shown of [field.min, field.max]) {
        const base = JSON.parse(JSON.stringify(PRESETS[field.markets.includes("curve") ? "almost_bonded" : "graduated_safe"]));
        base[field.group][field.key] = shown / field.scale;
        const parsed = parseTrenchRules(base, field.markets.includes("curve") ? "almost_bonded" : "graduated_safe");
        const back = Number((parsed[field.group] as Record<string, unknown>)[field.key]) * field.scale;
        expect(back).toBeGreaterThanOrEqual(field.min - 1e-6);
        expect(back).toBeLessThanOrEqual(field.max + 1e-6);
      }
    }
  });

  it("describes any rules in plain words", () => {
    expect(describeRules(RULES).line).toBe("10% per token · stop -25% · up to 4 tokens · stops for good at -70%");
    expect(describeRules(parseTrenchRules({}, "graduated_safe")).sells).toMatch(/everything after 4 h/);
  });
});

describe("Require X checks off", () => {
  it("lets a custom Curve Rider buy while X can't be read, and the summary says so", () => {
    const noX = parseTrenchRules({ ...PRESETS.almost_bonded, entry: { ...PRESETS.almost_bonded.entry, requireSocial: false } }, "almost_bonded");
    expect(noX.entry.requireSocial).toBe(false);
    expect(isCustom(noX, "almost_bonded")).toBe(true);
    // With X checks on, a candidate whose X check never finished is not bought.
    expect(runMinute(minute({ candidates: [candidate({ social: null })] })).actions).toEqual([]);
    expect(runMinute(minute({ rules: noX, candidates: [candidate({ social: null })] })).actions).toEqual([expect.objectContaining({ kind: "buy" })]);
    expect(describeRules(noX).buys).not.toMatch(/own X/);
  });
});

describe("callout amounts", () => {
  it("shows cents under $10 so a $3.65 buy is not called $4", () => {
    expect(buyCallout({ symbol: "HYLIT", usd: 3.65, ruleFacts: "bonding 58%", narrative: null, presetName: "Curve Rider", exitNote: "Stop -25%." })).toMatch(/^Bullish \$HYLIT: bought \$3\.65 by rule/);
  });
});

// ---------------------------------------------------------------- exit v2 (Curve Rider, 2026-11-18)

describe("exit v2", () => {
  const V2 = RULES.exit;
  const inProfit = { ...position, laddersDone: 1, tokens: 500n, costEth: 0.5, highPerToken: 0.00125 };

  it("is Curve Rider's default: half at +20%, stop to entry +3%, 15% trail, 2-minute stop, re-entry on", () => {
    // Research's frozen values (docs/perps-research.md, b8cc25c): no re-entry.
    expect(V2).toMatchObject({ ladder: [{ gainPct: 20, sellShareOfEntry: 0.5 }], lockInPct: 3, trailingPct: 15, weakFlowTrailPct: 10, stopConfirmMinutes: 2 });
    expect(RULES.entry).toMatchObject({ reentryEnabled: false });
    // Graduated Safe keeps its exits.
    expect(parseTrenchRules({}, "graduated_safe").exit).toMatchObject({ lockInPct: -100, weakFlowTrailPct: 0, stopConfirmMinutes: 1 });
  });

  it("banks 50% at +20%", () => {
    expect(decideExit(position, { ...market, valueEth: 1.21 }, V2)).toMatchObject({ kind: "sell", share: 0.5, ladderStep: 1, exitKind: "ladder" });
  });

  it("needs two one-minute closes below the stop", () => {
    const below = { ...market, valueEth: 0.7 };
    const first = track(position, below, V2);
    expect(first.stopHits).toBe(1);
    expect(decideExit(first, below, V2)).toMatchObject({ kind: "hold", reason: expect.stringMatching(/1 of 2 closes below the stop/) });
    const second = track(first, below, V2);
    expect(decideExit(second, below, V2)).toMatchObject({ kind: "sell", share: 1, exitKind: "stop" });
    // A wick that recovers resets the count.
    expect(track(first, { ...market, valueEth: 0.9 }, V2).stopHits).toBe(0);
  });

  it("after the first take profit, the stop sits at entry +3% and the rest trails 15%", () => {
    expect(decideExit(inProfit, { ...market, valueEth: 0.51 }, V2)).toMatchObject({ kind: "sell", exitKind: "lock" });
    expect(decideExit(inProfit, { ...market, valueEth: 0.6 }, V2).kind).toBe("hold");
    // High 0.00125/token, 15% under = 0.0010625 x 500 = 0.531 ETH.
    expect(decideExit(inProfit, { ...market, valueEth: 0.53 }, V2)).toMatchObject({ kind: "sell", exitKind: "trail" });
  });

  it("weak buying: full exit in a loss, a tighter trail in profit", () => {
    const weak = { ...market, buySell1h: 0.5 };
    expect(decideExit(position, { ...weak, valueEth: 0.97 }, V2)).toMatchObject({ kind: "sell", exitKind: "flow" });
    // In profit and close to the high: hold.
    expect(decideExit({ ...position, highPerToken: 0.00115 }, { ...weak, valueEth: 1.1 }, V2).kind).toBe("hold");
    // In profit but 10% or more under the high: sell on the tight trail.
    expect(decideExit({ ...position, highPerToken: 0.00125 }, { ...weak, valueEth: 1.1 }, V2)).toMatchObject({ kind: "sell", exitKind: "trail" });
    // Top-10 holders selling is weak flow too: out in a loss, the tight trail in profit.
    expect(decideExit(position, { ...market, top10Pct: 18, valueEth: 0.97 }, V2)).toMatchObject({ kind: "sell", exitKind: "flow", reason: expect.stringMatching(/top 10/) });
    expect(decideExit({ ...position, highPerToken: 0.00112 }, { ...market, top10Pct: 18, valueEth: 1.1 }, V2).kind).toBe("hold");
  });

  it("re-entry is off in the frozen set", () => {
    const NOW2 = Date.parse("2026-11-17T12:00:00Z");
    const exit = { exitKind: "flow" as const, exitAtMs: NOW2 - 90 * 60_000, exitMarketCapUsd: 20_000, highMarketCapUsd: 26_000, reentries: 0 };
    expect(reentryVerdict(exit, { ...token, market_cap_usd: 22_000 }, 1.3, RULES, NOW2).pass).toBe(false);
  });

  // The re-entry rule itself, switched on as a custom agent could: one re-entry after a flow or time exit.
  const RULES_RE = parseTrenchRules({ ...PRESETS.almost_bonded, entry: { ...PRESETS.almost_bonded.entry, reentryEnabled: true } }, "almost_bonded");

  it("allows one re-entry after a flow or time exit only, with cooldown, strong flow and a price window", () => {
    const RULES = RULES_RE;
    const NOW2 = Date.parse("2026-11-17T12:00:00Z");
    const exit = { exitKind: "flow" as const, exitAtMs: NOW2 - 90 * 60_000, exitMarketCapUsd: 20_000, highMarketCapUsd: 26_000, reentries: 0 };
    const back = { ...token, market_cap_usd: 22_000 };
    expect(reentryVerdict(exit, back, 1.3, RULES, NOW2)).toEqual({ pass: true });
    expect(reason(reentryVerdict({ ...exit, exitKind: "stop" }, back, 1.3, RULES, NOW2))).toMatch(/no re-entry/);
    expect(reason(reentryVerdict({ ...exit, exitKind: "red" }, back, 1.3, RULES, NOW2))).toMatch(/no re-entry/);
    expect(reason(reentryVerdict({ ...exit, reentries: 1 }, back, 1.3, RULES, NOW2))).toMatch(/already re-entered/);
    expect(reason(reentryVerdict({ ...exit, exitAtMs: NOW2 - 30 * 60_000 }, back, 1.3, RULES, NOW2))).toMatch(/cooldown/);
    expect(reason(reentryVerdict(exit, back, 1.1, RULES, NOW2))).toMatch(/6h buy\/sell 1.2/);
    expect(reason(reentryVerdict(exit, { ...token, market_cap_usd: 19_000 }, 1.3, RULES, NOW2))).toMatch(/not above the last exit/);
    expect(reason(reentryVerdict(exit, { ...token, market_cap_usd: 27_000 }, 1.3, RULES, NOW2))).toMatch(/old high/);
  });

  it("runMinute re-buys a token held before only when the re-entry passes", () => {
    const RULES = RULES_RE;
    const strong = { ...stats, "6h": w(1300, 1000) };
    const NOW2 = Date.parse("2026-11-17T12:00:00Z");
    const back = { ...token, market_cap_usd: 22_000 };
    const previous = new Map([[token.address, { exitKind: "time" as const, exitAtMs: NOW2 - 90 * 60_000, exitMarketCapUsd: 20_000, highMarketCapUsd: 26_000, reentries: 0 }]]);
    const input = minute({ rules: RULES, nowMs: NOW2, everHeld: new Set([token.address]), previous, candidates: [candidate({ token: back, checks: { stats: strong, safetyBlocked: false, dexPaidMinutesAfterLaunch: 11 } })] });
    expect(runMinute(input).actions).toEqual([expect.objectContaining({ kind: "buy", reentry: true, reason: expect.stringMatching(/^re-entry:/) })]);
    const stopped = new Map([[token.address, { ...previous.get(token.address)!, exitKind: "stop" as const }]]);
    expect(runMinute({ ...input, previous: stopped }).actions).toEqual([]);
  });
});
