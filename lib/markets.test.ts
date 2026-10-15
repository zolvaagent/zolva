import { describe, expect, it } from "vitest";

import { changeOver, marketStats } from "./markets";

describe("changeOver", () => {
  it("compares the last close with the close that many hours earlier", () => {
    expect(changeOver([100, 105, 110], 2)).toBeCloseTo(10);
    expect(changeOver([100, 105, 110], 1)).toBeCloseTo(4.7619, 3);
  });

  it("is null without a price that far back", () => {
    expect(changeOver([null, 105, 110], 2)).toBeNull();
    expect(changeOver([110], 24)).toBeNull();
    expect(changeOver([100, null], 1)).toBeNull();
  });
});

describe("marketStats", () => {
  it("is null for a token with no price yet", () => {
    expect(marketStats([null, null])).toBeNull();
  });

  it("summarises the last week", () => {
    // 200 hours climbing by 1 a step from 100.
    const closes = Array.from({ length: 200 }, (_, i) => 100 + i);
    const stats = marketStats(closes)!;
    expect(stats.price).toBe(299);
    expect(stats.change24h).toBeCloseTo((299 / 275 - 1) * 100);
    expect(stats.change7d).toBeCloseTo((299 / 131 - 1) * 100);
    expect(stats.change30d).toBeNull();
    expect(stats.week).toHaveLength(169);
    expect(stats.high7d).toBe(299);
    expect(stats.low7d).toBe(131);
    expect(stats.hourlyMovePct).toBeGreaterThan(0);
  });

  it("measures a flat price as zero movement", () => {
    const stats = marketStats(Array.from({ length: 50 }, () => 42))!;
    expect(stats.hourlyMovePct).toBe(0);
    expect(stats.change24h).toBe(0);
  });

  it("skips the hourly move with less than a day of history", () => {
    expect(marketStats([null, null, 10, 11, 12])!.hourlyMovePct).toBeNull();
  });
});
