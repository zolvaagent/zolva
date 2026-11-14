import { describe, expect, it } from "vitest";

import { runHour, type AgentParams } from "./engine";
import { explainDecision } from "./explain";
import { RULE_TEMPLATES, type Rules } from "./rules";

const flat = (length: number, price = 100) => Array<number>(length).fill(price);

// Breakout: price crosses above the 72h high, and the 24h RSI is below 70.
const breakout: Rules = {
  entry: {
    join: "all",
    conditions: [
      { left: { kind: "price" }, op: "crossesAbove", right: { kind: "high", hours: 72 } },
      { left: { kind: "rsi", hours: 24 }, op: "below", right: { kind: "value", value: 70 } },
    ],
  },
  exit: { join: "any", conditions: [{ left: { kind: "price" }, op: "below", right: { kind: "sma", hours: 48, offsetPct: -2 } }] },
  takeProfitPct: 12,
  maxHoldHours: 72,
};
const params: AgentParams = { strategy: "custom", rules: breakout, maxPositionPct: 33, stopLossPct: 5 };

describe("explainDecision", () => {
  it("explains what a flat agent waits for, how far away it is, and what is already met", () => {
    // Highest close of the last 72 hours is 110; the price is 100.
    const closes = [...flat(40, 100), 110, ...Array.from({ length: 39 }, (_, i) => (i % 2 ? 101 : 99)), 100];
    const hour = runHour({ cash: 1000, positions: {} }, params, { NVDA: closes }, closes.length - 1);
    const decision = hour.decisions[0];
    expect(decision).toMatchObject({ action: "hold", price: 100, checks: [{ met: false }, { met: true }] });
    const explanation = explainDecision(decision, params, "NVDA")!;
    expect(explanation.paragraphs).toEqual([
      "This agent buys breakouts: it waits for the price to climb above its recent high.",
      "It waits until NVDA rises above its highest price of the last 3 days ($110.00). NVDA is at $100.00, so it would need to climb about 10% first.",
      "It holds cash until then.",
      "Its other rule (24h rsi below 70) is already met.",
    ]);
    expect(explanation.checks).toEqual([
      { text: "price $100.00 crosses above 72h highest $110.00", met: false },
      { text: expect.stringMatching(/^24h rsi \d+ below 70$/), met: true },
    ]);
  });

  it("explains a held position: why it keeps it, the stop loss, take profit and max hold", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + i * 0.1);
    const position = { quantity: 3, entryPrice: 100, openedAt: (79 - 31) * 3600 };
    const hour = runHour({ cash: 700, positions: { NVDA: position } }, params, { NVDA: closes }, 79);
    const decision = hour.decisions[0];
    expect(decision.position).toEqual({ entryPrice: 100, heldHours: 31 });
    const text = explainDecision(decision, params, "NVDA")!.paragraphs.join(" ");
    expect(text).toContain("It holds NVDA, bought at $100.00 (+7.9% since).");
    expect(text).toContain("It waits to sell until NVDA falls below 2% below its 2-day average");
    expect(text).toContain("Until then it keeps the position.");
    expect(text).toContain("If NVDA falls to $95.00, about 5% below where it bought, the stop loss sells everything.");
    expect(text).toContain("If it rises to $112.00, 12% above where it bought, it takes the profit.");
    expect(text).toContain("It has held for 31 hours of its 72 hour maximum, so it sells in 41 hours at the latest.");
  });

  it("explains presets from their stored indicators", () => {
    const noisy = Array.from({ length: 49 }, (_, i) => 100 + (i % 2 ? 1 : -1));
    const meanReversion: AgentParams = { strategy: "mean_reversion", maxPositionPct: 50, stopLossPct: 8 };
    const decision = runHour({ cash: 1000, positions: {} }, meanReversion, { AAPL: noisy }, 48).decisions[0];
    const text = explainDecision(decision, meanReversion, "AAPL")!.paragraphs.join(" ");
    expect(text).toContain("This agent buys unusual dips.");
    expect(text).toContain("a z score below −2.5. Right now the z score is");
  });

  it("names the AI co-pilot's verdict", () => {
    const closes = [...flat(40, 100), 110, ...flat(40, 100)];
    const decision = { ...runHour({ cash: 1000, positions: {} }, params, { NVDA: closes }, closes.length - 1).decisions[0], ai: { model: "x", verdict: "passed" as const, reasoning: "Earnings tomorrow." } };
    expect(explainDecision(decision, params, "NVDA")!.paragraphs.at(-1)).toBe("The AI co-pilot reviewed the signal and passed on it, so no trade was made: Earnings tomorrow.");
  });

  it("returns null for decisions stored before details existed", () => {
    expect(explainDecision({ token: "NVDA", action: "hold", reasoning: "Waiting.", indicators: {} }, params, "NVDA")).toBeNull();
    // A preset's old decision has indicators but no position: it could be holding, so no details.
    expect(explainDecision({ token: "ETH", action: "hold", reasoning: "Still below.", indicators: { zScore: -1.4, average48h: 1966 } }, { strategy: "mean_reversion", maxPositionPct: 50, stopLossPct: 10 }, "ETH")).toBeNull();
    expect(explainDecision({ token: "NVDA", action: "hold", reasoning: "Waiting." }, { strategy: "custom", rules: RULE_TEMPLATES.momentum, maxPositionPct: 50, stopLossPct: 8 }, "NVDA")).toBeNull();
  });
});
