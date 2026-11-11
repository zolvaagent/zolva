import { describe, expect, it } from "vitest";

import { copyBlock, maxMarketsFor, strategyNeedsPerps } from "./copy";

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
