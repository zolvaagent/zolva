import { describe, expect, it } from "vitest";

import { toLighterRows } from "./lighter";

const HOUR = 3_600_000;
const start = Date.UTC(2026, 10, 7, 10);

describe("toLighterRows", () => {
  const candles = [
    { t: start - HOUR, o: 1, h: 1, l: 1, c: 1 },
    { t: start, o: 100, h: 102, l: 99, c: 101, V: 5000 },
    { t: start + HOUR, o: 101, h: 101, l: 100, c: 100.5 },
    { t: start + 2 * HOUR, o: 100.5, h: 100.5, l: 100.5, c: 100.5 }, // not complete yet
  ];
  const fundings = [
    { timestamp: (start + HOUR) / 1000, rate: "0.0005", direction: "long" as const },
    { timestamp: (start + 2 * HOUR) / 1000, rate: "0.0012", direction: "short" as const },
  ];
  const rows = toLighterRows("lighter:1", candles, fundings, start, start + 2 * HOUR);

  it("keeps only complete hours inside the range", () => {
    expect(rows.map((row) => row.ts)).toEqual([new Date(start).toISOString(), new Date(start + HOUR).toISOString()]);
    expect(rows[0]).toMatchObject({ token_address: "lighter:1", open: 100, close: 101, volume_usd: 5000, source: "lighter" });
  });

  it("stores the funding paid at an hour mark on the hour that just ended, as a signed fraction", () => {
    expect(rows[0].funding_rate).toBeCloseTo(0.000005, 12); // longs paid 0.0005%
    expect(rows[1].funding_rate).toBeCloseTo(-0.000012, 12); // shorts paid
  });

  it("leaves funding empty when Lighter has none for the hour", () => {
    expect(toLighterRows("lighter:1", candles, [], start, start + HOUR)[0].funding_rate).toBeNull();
  });
});
