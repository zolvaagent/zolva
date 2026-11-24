import { describe, expect, it } from "vitest";

import { openPnlAt, pnlSplit } from "./pnl-split";

describe("openPnlAt", () => {
  it("is 0 for a flat agent", () => {
    expect(openPnlAt([])).toBe(0);
  });

  it("values a long at close minus average entry", () => {
    expect(openPnlAt([{ side: "long", quantity: 2, entryPrice: 100, margin: null, price: 110 }])).toBeCloseTo(20);
  });

  it("values a short at average entry minus close, with or without margin", () => {
    expect(openPnlAt([{ side: "short", quantity: 3, entryPrice: 50, margin: null, price: 40 }])).toBeCloseTo(30);
    expect(openPnlAt([{ side: "short", quantity: 3, entryPrice: 50, margin: 150, price: 60 }])).toBeCloseTo(-30);
  });

  it("adds positions up, and is null when one has no price", () => {
    const long = { side: "long" as const, quantity: 1, entryPrice: 10, margin: null, price: 12 };
    const short = { side: "short" as const, quantity: 1, entryPrice: 10, margin: null, price: 9 };
    expect(openPnlAt([long, short])).toBeCloseTo(3);
    expect(openPnlAt([long, { ...short, price: null }])).toBeNull();
  });
});

describe("pnlSplit", () => {
  it("puts costs and funding in Realised (Research's Pentest A momentum, 24 Nov)", () => {
    const split = pnlSplit(10_000, 10_468, 1_205)!;
    expect(split.totalUsd).toBeCloseTo(468);
    expect(split.openUsd).toBe(1_205);
    expect(split.realisedUsd).toBeCloseTo(-737);
  });

  it("is all realised when flat", () => {
    expect(pnlSplit(10_000, 10_828, 0)).toEqual({ totalUsd: 828, openUsd: 0, realisedUsd: 828 });
  });

  it("is null when the open P&L is unknown", () => {
    expect(pnlSplit(1_000, 1_050, null)).toBeNull();
    expect(pnlSplit(1_000, 1_050, undefined)).toBeNull();
  });
});
