import { describe, expect, it } from "vitest";

import { LAB_AGENTS, VOL_TREND_1200, VOL_TREND_1200_LS, VOL_TREND_1200_LS_OI } from "./house";
import { isTested } from "./tested";

const sizing = { kind: "volTarget", targetPct: 20, hours: 720 };
const base = { strategy: "custom", venue: "spot" as const, symbols: ["BTC"], params: { rules: VOL_TREND_1200, sizing, stop_loss_pct: 15, max_position_pct: 100 } };

describe("isTested", () => {
  it("passes only an exact match of a rule Research tested", () => {
    expect(isTested(base)).toBe(true);
    expect(isTested({ ...base, symbols: ["ETH"] })).toBe(true);
    expect(isTested({ ...base, venue: "perps", symbols: ["SOL-PERP"], params: { ...base.params, rules: VOL_TREND_1200_LS } })).toBe(true);
  });

  it("does not care about the database's key order", () => {
    const reordered = JSON.parse(JSON.stringify({ maxHoldHours: null, takeProfitPct: null, exit: VOL_TREND_1200.exit, entry: VOL_TREND_1200.entry }));
    expect(isTested({ ...base, params: { ...base.params, rules: reordered, sizing: { hours: 720, targetPct: 20, kind: "volTarget" } } })).toBe(true);
  });

  it("calls anything else an Experiment", () => {
    expect(isTested({ ...base, symbols: ["BTC", "ETH"] })).toBe(false); // two markets in one agent
    expect(isTested({ ...base, symbols: ["SPY"] })).toBe(false); // failed on stocks
    expect(isTested({ ...base, params: { ...base.params, stop_loss_pct: 10 } })).toBe(false);
    expect(isTested({ ...base, params: { ...base.params, sizing: undefined } })).toBe(false);
    expect(isTested({ ...base, params: { ...base.params, rules: VOL_TREND_1200_LS } })).toBe(false); // L+S is perps only
    expect(isTested({ ...base, venue: "perps", symbols: ["SOL-PERP"], params: { ...base.params, rules: VOL_TREND_1200_LS_OI } })).toBe(false); // the OI A/B
    expect(isTested({ ...base, strategy: "momentum" })).toBe(false);
  });

  it("marks the Lab Vol Trend agents and the paper twins Tested, and the OI agents not", () => {
    const tested = LAB_AGENTS.filter((agent) =>
      isTested({
        strategy: agent.strategy,
        venue: agent.venue === "perps" ? "perps" : "spot",
        symbols: agent.symbols,
        params: { rules: agent.rules, sizing: "sizing" in agent ? agent.sizing : undefined, stop_loss_pct: agent.stopLossPct, max_position_pct: agent.maxPositionPct },
      }),
    ).map((agent) => agent.name);
    expect(tested).toContain("Paper BTC Vol Trend");
    expect(tested).toContain("Lab · SOL Vol Trend");
    expect(tested).toContain("Lab · ZEC Vol Trend L+S");
    expect(tested.some((name) => name.endsWith(" OI"))).toBe(false);
  });
});
