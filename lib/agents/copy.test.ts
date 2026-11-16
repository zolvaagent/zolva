import { describe, expect, it } from "vitest";

import { copyBlock, dcaEveryText, dcaSpanText, maxMarketsFor, strategyNeedsPerps } from "./copy";

const tokens = (n: number) => Array.from({ length: n }, (_, i) => ({ address: `0x${i}`, symbol: `T${i}` }));
const base = { venue: "spot" as const, strategy: "momentum", tokens: tokens(2), published: true, live: false };

describe("maxMarketsFor", () => {
  it("allows 3 markets for rule strategies and 8 for Dip hunter and Spike fade", () => {
    expect(maxMarketsFor("momentum")).toBe(3);
    expect(maxMarketsFor("custom")).toBe(3);
    expect(maxMarketsFor("dip_hunter")).toBe(8);
    expect(maxMarketsFor("spike_fade")).toBe(8);
  });
  it("puts Spike fade (shorts) on perps only", () => {
    expect(strategyNeedsPerps("spike_fade")).toBe(true);
    expect(strategyNeedsPerps("dip_hunter")).toBe(false);
  });
});

describe("copyBlock", () => {
  it("copies published paper agents the Studio can build, spot or perps", () => {
    expect(copyBlock(base)).toBeNull();
    expect(copyBlock({ ...base, venue: "perps", strategy: "custom" })).toBeNull();
    expect(copyBlock({ ...base, venue: "perps", strategy: "spike_fade", tokens: tokens(2) })).toBeNull();
    expect(copyBlock({ ...base, strategy: "dip_hunter", tokens: tokens(8) })).toBeNull();
  });
  it("gives the reason when it can't", () => {
    expect(copyBlock({ ...base, live: true })).toMatch(/Real money/);
    expect(copyBlock({ ...base, published: false })).toMatch(/leaderboard/);
    expect(copyBlock({ ...base, strategy: "spike_fade" })).toMatch(/perps/);
    expect(copyBlock({ ...base, strategy: "dip_hunter", tokens: tokens(14) })).toMatch(/up to 8 markets; this one watches 14/);
    expect(copyBlock({ ...base, tokens: tokens(4) })).toMatch(/up to 3 markets/);
    expect(copyBlock({ ...base, strategy: "something_new" })).toMatch(/isn't in the Studio/);
  });
});

describe("copyBlock with params", () => {
  it("blocks settings the Studio can't set", () => {
    const summary = { venue: "spot" as const, strategy: "custom", tokens: [{ address: "0x1", symbol: "BTC" }], published: true, live: false };
    expect(copyBlock(summary, {})).toBeNull();
    expect(copyBlock(summary, { sizing: { kind: "volTarget", targetPct: 20, hours: 720 } })).toMatch(/volatility/);
    expect(copyBlock(summary, { rules: { entry: { join: "all", conditions: [{ left: { kind: "oiChange", period: 168 } }] } } })).toMatch(/Lab data/);
  });
});

describe("DCA schedule text", () => {
  it("says the gap and span in the largest whole unit", () => {
    expect(dcaEveryText(168)).toBe("every week");
    expect(dcaEveryText(24)).toBe("every day");
    expect(dcaEveryText(6)).toBe("every 6 hours");
    expect(dcaEveryText(336)).toBe("every 2 weeks");
    expect(dcaSpanText(52 * 168)).toBe("52 weeks");
    expect(dcaSpanText(12 * 24)).toBe("12 days");
    expect(dcaSpanText(36)).toBe("36 hours");
  });
});
