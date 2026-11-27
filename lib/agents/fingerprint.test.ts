import { describe, expect, it } from "vitest";

import { RULE_TEMPLATES } from "../engine/rules.ts";

import { fingerprintInput, readFingerprint, rulesFingerprint, type FingerprintAgent } from "./fingerprint.ts";

const agent: FingerprintAgent = {
  strategy: "custom",
  params: { max_position_pct: 50, stop_loss_pct: 8, start_prices: { "0xaa": 10 }, rules: RULE_TEMPLATES.momentum },
  token_addresses: ["0xaa", "0xbb"],
};
const withParams = (params: Partial<FingerprintAgent["params"]>): FingerprintAgent => ({ ...agent, params: { ...agent.params, ...params } });
const hash = rulesFingerprint(agent);

describe("rules fingerprint", () => {
  it("is stable: the same settings give this exact hash", () => {
    expect(fingerprintInput(agent)).toContain('"version":"zr1"');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // A changed canonical form would silently orphan every recorded hash: bump FINGERPRINT_VERSION instead.
    expect(hash).toMatchInlineSnapshot(`"a7438dae9368c6377d26f14a485d4af808df32e6736c43b97dbe6eaed1022e5d"`);
  });

  it("ignores key order, launch prices and number-like strings", () => {
    const reordered = JSON.parse(JSON.stringify(agent.params.rules), (_, value) =>
      value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value,
    );
    expect(rulesFingerprint(withParams({ rules: reordered }))).toBe(hash);
    expect(rulesFingerprint(withParams({ start_prices: { "0xaa": 99 } }))).toBe(hash);
    expect(rulesFingerprint(withParams({ max_position_pct: "50" as unknown as number }))).toBe(hash);
    expect(rulesFingerprint(withParams({ venue: undefined }))).toBe(hash);
  });

  it("changes with anything that changes a trade", () => {
    const changed = [
      withParams({ stop_loss_pct: 9 }),
      withParams({ max_position_pct: 60 }),
      withParams({ venue: "perps" }),
      withParams({ rules: RULE_TEMPLATES.breakout }),
      withParams({ leverage: 2 }),
      withParams({ sizing: { kind: "volTarget", targetPct: 20, hours: 72 } }),
      withParams({ portfolio: { leverage: 2 } }),
      { ...agent, strategy: "momentum" as const },
      { ...agent, token_addresses: ["0xaa"] },
      { ...agent, token_addresses: ["0xbb", "0xaa"] },
    ];
    const hashes = changed.map(rulesFingerprint);
    expect(hashes).not.toContain(hash);
    expect(new Set(hashes).size).toBe(changed.length);
  });

  it("leaves out the DCA first-buy hour and the displayed backtest drop", () => {
    const plan = (startTs: number) => withParams({ dca: { buys: 12, everyHours: 168, startTs } });
    expect(rulesFingerprint(plan(3600))).toBe(rulesFingerprint(plan(7200)));
    const sleeve = (backtestDropPct: number) => withParams({ portfolio: { leverage: 2, backtestDropPct } });
    expect(rulesFingerprint(sleeve(10))).toBe(rulesFingerprint(sleeve(20)));
  });

  it("reports whether the settings still match what was recorded", () => {
    expect(readFingerprint({ ...agent, rules_hash: null, rules_hash_at: null })).toBeNull();
    const recorded = { ...agent, rules_hash: hash, rules_hash_at: "2026-11-27T08:00:00+00:00" };
    expect(readFingerprint(recorded)).toMatchObject({ sha256: hash, matches: true, recordedAt: "2026-11-27T08:00:00.000Z" });
    expect(readFingerprint({ ...recorded, params: { ...agent.params, stop_loss_pct: 20 } })).toMatchObject({ sha256: hash, matches: false });
  });
});
