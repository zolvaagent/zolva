import { describe, expect, it, vi } from "vitest";

import { runHour, type AgentParams, type AgentState } from "../engine/engine";
import { buildPrompt, parseReviews, type CopilotContext, type ProposedTrade } from "./copilot";
import { AI_MODELS, aiModel, callCostUsd, formatCredits, isLite, maxCallCostUsd, monthlyEstimateUsd } from "./models";
import { chatJson, OpenRouterError } from "./openrouter";

const flat = (length: number, price = 100) => Array<number>(length).fill(price);
// Ends 7.2% above 24h ago: momentum wants to buy at the last index.
const rising = [...flat(40), ...Array.from({ length: 9 }, (_, i) => 100 + (i + 1) * 0.8)];
const momentum: AgentParams = { strategy: "momentum", maxPositionPct: 50, stopLossPct: 8 };

describe("engine veto (AI co-pilot)", () => {
  const empty: AgentState = { cash: 10_000, positions: {} };

  it("cancels a signal buy and keeps the reason", () => {
    const base = runHour(empty, momentum, { NVDA: rising }, rising.length - 1);
    expect(base.fills).toHaveLength(1);

    const vetoed = runHour(empty, momentum, { NVDA: rising }, rising.length - 1, undefined, { veto: new Map([["NVDA", "Spike already fading."]]) });
    expect(vetoed.fills).toHaveLength(0);
    expect(vetoed.state.cash).toBe(10_000);
    expect(vetoed.decisions[0].action).toBe("hold");
    expect(vetoed.decisions[0].reasoning).toContain("The AI co-pilot passed: Spike already fading.");
  });

  it("can never cancel a stop loss", () => {
    const held: AgentState = { cash: 0, positions: { NVDA: { quantity: 100, entryPrice: 100 } } };
    const crash = [...flat(48), 90];
    const result = runHour(held, momentum, { NVDA: crash }, crash.length - 1, undefined, { veto: new Map([["NVDA", "Hold on."]]) });
    expect(result.fills.map((fill) => fill.reason)).toEqual(["stop_loss"]);
  });

  it("ignores a veto for a token with no trade", () => {
    const result = runHour(empty, momentum, { NVDA: flat(49) }, 48, undefined, { veto: new Map([["NVDA", "No."]]) });
    expect(result.decisions[0].reasoning).not.toContain("co-pilot");
  });
});

const trade = (overrides: Partial<ProposedTrade> = {}): ProposedTrade => ({
  token: "0xnvda",
  symbol: "NVDA",
  side: "buy",
  price: 217.5,
  ruleReasoning: "Up 3.4% in 24h. Buying.",
  closes: rising,
  ...overrides,
});

const context = (trades: ProposedTrade[]): CopilotContext => ({
  agentName: "Night Owl",
  strategy: "momentum",
  maxPositionPct: 33,
  stopLossPct: 8,
  cash: 10_000,
  equity: 10_000,
  openPositions: 0,
  marketOpen: false,
  trades,
});

describe("buildPrompt", () => {
  it("states the strategy, the trade, its facts and the market hours", () => {
    const prompt = buildPrompt(context([trade(), trade({ token: "0xtsla", symbol: "TSLA", side: "sell", price: 361, position: { entryPrice: 340, heldHours: 30 } })]));
    expect(prompt).toContain("Momentum: buys after a rise");
    expect(prompt).toContain("BUY NVDA at $217.50");
    expect(prompt).toContain("Rule says: Up 3.4% in 24h. Buying.");
    expect(prompt).toContain("Change: 1h");
    expect(prompt).toContain("SELL TSLA");
    expect(prompt).toMatch(/entry \$340\.00 \(\+6\.18%\), held 30h/);
    expect(prompt).toContain("US market: closed.");
  });
});

describe("parseReviews", () => {
  const trades = [trade(), trade({ token: "0xtsla", symbol: "TSLA" })];

  it("reads one review per trade by symbol", () => {
    const { reviews, valid } = parseReviews('{"reviews":[{"symbol":"NVDA","approve":false,"reasoning":"Fading spike."},{"symbol":"tsla","approve":true,"reasoning":"Fine."}]}', trades);
    expect(valid).toBe(true);
    expect(reviews).toEqual([
      { token: "0xnvda", approve: false, reasoning: "Fading spike." },
      { token: "0xtsla", approve: true, reasoning: "Fine." },
    ]);
  });

  it("finds JSON inside prose or a code fence", () => {
    const { reviews } = parseReviews('Sure:\n```json\n{"reviews":[{"symbol":"NVDA","approve":false,"reasoning":"No."}]}\n```', trades);
    expect(reviews[0].approve).toBe(false);
  });

  it("lets the rules decide when the answer is missing or broken", () => {
    const broken = parseReviews("I think you should buy.", trades);
    expect(broken.valid).toBe(false);
    expect(broken.reviews.every((review) => review.approve)).toBe(true);

    const partial = parseReviews('{"reviews":[{"symbol":"NVDA","approve":false,"reasoning":"No."}]}', trades);
    expect(partial.reviews[1]).toMatchObject({ token: "0xtsla", approve: true });
  });

  it("keeps reasoning short and on one line", () => {
    const long = "x ".repeat(400);
    const { reviews } = parseReviews(JSON.stringify({ reviews: [{ symbol: "NVDA", approve: true, reasoning: `a\n\nb ${long}` }] }), trades);
    expect(reviews[0].reasoning.length).toBeLessThanOrEqual(240);
    expect(reviews[0].reasoning).not.toContain("\n");
  });
});

describe("models", () => {
  it("prices calls from per-million rates", () => {
    const haiku = aiModel("anthropic/claude-haiku-5.5")!;
    expect(callCostUsd(haiku, 3000, 400)).toBeCloseTo(0.0005, 8);
    expect(monthlyEstimateUsd(haiku)).toBeCloseTo(0.015, 8);
    expect(maxCallCostUsd(haiku)).toBeGreaterThan(callCostUsd(haiku, 3000, 400));
  });

  it("marks only Lite models as payable with free credits", () => {
    expect(isLite("anthropic/claude-haiku-5.5")).toBe(true);
    expect(isLite("anthropic/claude-sonnet-5.5")).toBe(false);
    expect(isLite("unknown/model")).toBe(false);
    expect(AI_MODELS.filter((model) => model.tier === "lite").length).toBeGreaterThan(0);
  });

  it("formats tiny amounts honestly", () => {
    expect(formatCredits(0.004)).toBe("< $0.01");
    expect(formatCredits(0.5)).toBe("$0.50");
    expect(formatCredits(0)).toBe("$0.00");
  });
});

describe("chatJson", () => {
  it("sends the model, the messages and a token cap, and reads usage and cost", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"reviews":[]}' } }], usage: { prompt_tokens: 1200, completion_tokens: 80, cost: 0.00016 } }), { status: 200 }),
    );
    const result = await chatJson({ apiKey: "k", model: "anthropic/claude-haiku-5.5", system: "s", user: "u", schema: {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ content: '{"reviews":[]}', inputTokens: 1200, outputTokens: 80, costUsd: 0.00016 });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("anthropic/claude-haiku-5.5");
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.usage).toEqual({ include: true });
  });

  it("turns API errors into OpenRouterError", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Insufficient credits" } }), { status: 402 }));
    await expect(chatJson({ apiKey: "k", model: "m", system: "s", user: "u", fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toBeInstanceOf(OpenRouterError);
  });
});
