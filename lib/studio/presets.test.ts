import { describe, expect, it } from "vitest";

import type { Market } from "../data/market";
import { BACKTEST_HOURS, canBacktest, openingPreset, scorePresets, STUDIO_PRESETS, suggestedName } from "./presets";

const HOURS = BACKTEST_HOURS + 200;

/** A market with every preset symbol on a gentle wave, so every strategy has something to do. */
function market(overrides: Record<string, { firstIndex?: number | null; drift?: number }> = {}): Market {
  const symbols = [...new Set(STUDIO_PRESETS.flatMap((preset) => preset.symbols))];
  return {
    startTs: 1_700_000_000,
    hours: HOURS,
    tokens: symbols.map((symbol, k) => {
      const { firstIndex = 0, drift = 0 } = overrides[symbol] ?? {};
      const closes = Array.from({ length: HOURS }, (_, i) => (firstIndex !== null && i >= firstIndex ? 100 * (1 + drift * i) + 6 * Math.sin((i + k * 7) / 9) : null));
      return { address: `0x${k}`, symbol, name: symbol, assetClass: symbol === "BTC" || symbol === "ETH" ? "crypto" : "stock", closes, firstIndex } as unknown as Market["tokens"][number];
    }),
  };
}

describe("studio presets", () => {
  it("scores every preset whose markets have enough history", () => {
    const scored = scorePresets(market());
    expect(scored.map((preset) => preset.id)).toEqual(STUDIO_PRESETS.map((preset) => preset.id));
    for (const preset of scored) {
      expect(Number.isFinite(preset.returnPct)).toBe(true);
      expect(Number.isFinite(preset.holdPct)).toBe(true);
    }
  });

  it("leaves out a preset with a market too new to backtest", () => {
    const fresh = market({ BTC: { firstIndex: HOURS - 100 } });
    expect(canBacktest(fresh, "BTC")).toBe(false);
    expect(scorePresets(fresh).some((preset) => preset.symbols.includes("BTC"))).toBe(false);
  });

  it("opens on the best 30 day return, or nothing when no preset can run", () => {
    const scored = scorePresets(market());
    const best = openingPreset(scored);
    expect(best?.returnPct).toBe(Math.max(...scored.map((preset) => preset.returnPct)));
    expect(openingPreset([])).toBeNull();
  });

  it("names an agent after its markets and strategy, within 40 characters", () => {
    expect(suggestedName("mean_reversion", ["GOOGL", "META", "NVDA"])).toBe("GOOGL META NVDA Mean reversion");
    expect(suggestedName("momentum", [])).toBe("Momentum");
    expect(suggestedName("custom", ["SPCX", "GOOGL", "CRCL"]).length).toBeLessThanOrEqual(40);
  });
});
