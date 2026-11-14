import { describe, expect, it } from "vitest";

import { HOUSE_AGENTS, LAB_AGENTS } from "../agents/house";
import type { AgentParams } from "./engine";
import { RULE_TEMPLATES } from "./rules";
import { describeAgent } from "./summary";

const text = (params: AgentParams, symbols = ["NVDA"]) => describeAgent(params, { symbols }).join(" ");

describe("describeAgent", () => {
  it("states the custom rules, exits, risk, size and mode in plain words", () => {
    const lines = describeAgent(
      { strategy: "custom", rules: { ...RULE_TEMPLATES.momentum, takeProfitPct: 12, maxHoldHours: 72 }, maxPositionPct: 33, stopLossPct: 8 },
      { symbols: ["NVDA", "TSLA", "AAPL"] },
    );
    expect(lines).toEqual([
      "Trades NVDA, TSLA and AAPL.",
      "Buys when all of these hold: price above 48h average; 24h change above +3.0%.",
      "Sells when price below 48h average −3%.",
      "Take profit: sells everything 12% above the entry price.",
      "Sells after holding a market for 3 days.",
      "Stop loss: sells everything 8% below the entry price.",
      "Puts at most 33% of the agent into one market.",
      "Decides once an hour on the hourly close. Each trade pays 0.5% for fees and slippage.",
      "Paper money: virtual dollars at real prices.",
    ]);
  });

  it("reads preset thresholds from the strategy code", () => {
    expect(text({ strategy: "momentum", maxPositionPct: 50, stopLossPct: 8 })).toContain("up more than 3% over 24 hours and above its 48h average");
    expect(text({ strategy: "mean_reversion", maxPositionPct: 50, stopLossPct: 8 })).toContain("z score below −2.5");
    expect(text({ strategy: "dip_hunter", maxPositionPct: 100, stopLossPct: 10 })).toContain("it buys the deepest");
  });

  it("describes shorts, leverage, perps costs and funding", () => {
    const summary = text({ strategy: "bounce_short", maxPositionPct: 100, stopLossPct: 5, venue: "perps", leverage: 3 }, ["BTC-PERP", "ETH-PERP"]);
    expect(summary).toContain("Trades BTC-PERP and ETH-PERP on Lighter perps.");
    expect(summary).toContain("covers everything 5% above the short price");
    expect(summary).not.toContain("sells everything 5% below");
    expect(summary).toContain("Shorts at 3x");
    expect(summary).toContain("a 31.67% move against it");
    expect(summary).toContain("0.05% for fees and slippage, and open positions pay or earn hourly funding");
  });

  it("describes volatility sizing with its daily resize", () => {
    const vol = LAB_AGENTS.find((agent) => agent.name === "Lab · SOL Vol Trend")!;
    const summary = text({ strategy: vol.strategy, rules: vol.rules, maxPositionPct: vol.maxPositionPct, stopLossPct: vol.stopLossPct, venue: vol.venue, sizing: vol.sizing }, vol.symbols);
    expect(summary).toContain("Buys when price above 1200h average +3%.");
    expect(summary).toContain("Sells when price below 1200h average.");
    expect(summary).toContain("20% a year divided by the market's volatility over the last 30 days, at most 100% of the agent");
    expect(summary).toContain("more than 25% off");
  });

  it("names real money and the AI co-pilot's limits", () => {
    const lines = describeAgent({ strategy: "momentum", maxPositionPct: 34, stopLossPct: 20 }, { symbols: ["CRCL"], mode: "live", aiModel: "claude" });
    expect(lines).toContain("Real money from your own wallet.");
    expect(lines.join(" ")).toContain("never sizes trades or skips a stop loss");
  });

  it("works for every house and Lab agent", () => {
    for (const agent of [...HOUSE_AGENTS, ...LAB_AGENTS]) {
      const params: AgentParams = { strategy: agent.strategy, rules: agent.rules, maxPositionPct: agent.maxPositionPct, stopLossPct: agent.stopLossPct, venue: agent.venue, leverage: agent.leverage, sizing: agent.sizing };
      const lines = describeAgent(params, { symbols: agent.symbols, aiModel: agent.aiModel });
      expect(lines.length).toBeGreaterThanOrEqual(5);
      expect(lines.every((line) => line.endsWith(".") && !line.includes("undefined") && !line.includes("NaN"))).toBe(true);
    }
  });
});

describe("describeAgent with Lab short rules", () => {
  it("adds the short side and its funding filter in words", () => {
    const ls = LAB_AGENTS.find((agent) => agent.name === "Lab · SOL Vol Trend L+S")!;
    const lines = describeAgent({ strategy: ls.strategy, rules: ls.rules, maxPositionPct: ls.maxPositionPct, stopLossPct: ls.stopLossPct, venue: ls.venue, sizing: ls.sizing }, { symbols: ls.symbols });
    expect(lines).toContain("Shorts when all of these hold: price below 1200h average −3%; 7d funding zero or positive.");
    expect(lines).toContain("Covers when any of these holds: price above 1200h average; 7d funding negative.");
    expect(lines).toContain("Stop loss: covers everything 15% above the short price.");
  });
});
