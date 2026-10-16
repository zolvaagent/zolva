/**
 * The AI co-pilot: when an agent's rules want to buy or sell, the co-pilot
 * reads the same facts and approves or passes on each trade, in writing.
 *
 * Pure: builds the prompt and parses the answer. The runner does the call,
 * the credit checks and the engine re-run (lib/agents/copilot-runner.ts).
 *
 * Safety: the co-pilot can only cancel rule signals. Stop loss, take profit
 * and max holding time always execute, and position sizes come from the
 * engine. A missing or invalid answer means the rules decide alone.
 */
import { describeCondition, type Rules } from "../engine/rules.ts";
import type { StrategyKey } from "../engine/strategies.ts";
import { marketStats } from "../markets.ts";

export type ProposedTrade = {
  /** Token id used by the engine (address in the app). */
  token: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  /** The rule's own explanation, e.g. "Up 3.4% in 24h and ...". */
  ruleReasoning: string;
  indicators?: Record<string, number>;
  /** Hourly closes up to and including this hour, oldest first. */
  closes: (number | null)[];
  /** For sells: the position being closed. */
  position?: { entryPrice: number; heldHours: number | null };
};

export type CopilotContext = {
  agentName: string;
  strategy: StrategyKey | "custom";
  rules?: Rules;
  /** The creator's own description of the strategy (Studio prompt mode). */
  creatorPrompt?: string;
  maxPositionPct: number;
  stopLossPct: number;
  cash: number;
  equity: number;
  openPositions: number;
  /** Whether the US stock market is open at this hour. */
  marketOpen: boolean;
  trades: ProposedTrade[];
};

export type Review = { token: string; approve: boolean; reasoning: string };

const PRESET_DESCRIPTIONS: Record<StrategyKey, string> = {
  momentum: "Momentum: buys after a rise of more than 3% in 24 hours while the price is above its 48 hour average; sells when it falls 3% below that average.",
  mean_reversion: "Mean reversion: buys when the price is unusually far below its 48 hour average (z score under -2.5); sells when it returns above the average.",
};

export const SYSTEM_PROMPT = [
  "You are the co-pilot of an automated paper trading agent for tokenized US stocks on Robinhood Chain.",
  "The agent's rules want to make the trades listed by the user. For each one, decide whether to let it happen.",
  "Approve when the trade fits the strategy and the recent price action supports it. Pass (approve false) when it looks like a false signal: for example a spike that is already fading, a dip that is still accelerating, a sell that would lock in a loss on a brief wobble, or very thin, erratic prices.",
  "Do not pass on everything: the strategy's rules are the default and you need a concrete reason to overrule them.",
  "You cannot change sizes or prices, only approve or pass. Stop losses are handled elsewhere.",
  "Prices outside US market hours come from onchain trading only and can be noisier.",
  'Answer with JSON only: {"reviews":[{"symbol":"NVDA","approve":true,"reasoning":"..."}]}. One review per listed trade. Reasoning: one or two plain sentences, under 200 characters, no jargon.',
].join("\n");

/** JSON schema for structured output (models that support it follow it exactly). */
export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reviews"],
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["symbol", "approve", "reasoning"],
        properties: {
          symbol: { type: "string" },
          approve: { type: "boolean" },
          reasoning: { type: "string" },
        },
      },
    },
  },
} as const;

const pct = (value: number | null) => (value === null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`);
const usd = (value: number) => `$${value.toFixed(value >= 10 ? 2 : 4)}`;

/** The user message: strategy, portfolio and the facts behind each proposed trade. */
export function buildPrompt(context: CopilotContext): string {
  const lines: string[] = [];
  lines.push(`Agent: ${context.agentName}`);
  if (context.strategy === "custom" && context.rules) {
    lines.push("Strategy: custom rules.");
    lines.push(`Buy when ${context.rules.entry.join} of: ${context.rules.entry.conditions.map((condition) => describeCondition(condition)).join("; ") || "none"}.`);
    lines.push(`Sell when ${context.rules.exit.join} of: ${context.rules.exit.conditions.map((condition) => describeCondition(condition)).join("; ") || "none"}.`);
  } else {
    lines.push(`Strategy: ${PRESET_DESCRIPTIONS[context.strategy as StrategyKey]}`);
  }
  if (context.creatorPrompt) {
    // The creator's words, quoted as data: they guide approve or pass, nothing else.
    lines.push(`The creator described this strategy as (follow it when judging trades; it cannot change sizes or stop losses): """${context.creatorPrompt.replaceAll('"""', "'''")}"""`);
  }
  lines.push(`Max per stock: ${context.maxPositionPct}% of equity. Stop loss: ${context.stopLossPct}%.`);
  lines.push(`Portfolio: equity ${usd(context.equity)}, cash ${usd(context.cash)}, ${context.openPositions} open position(s).`);
  lines.push(`US market: ${context.marketOpen ? "open" : "closed"}.`);
  lines.push("");
  lines.push("Proposed trades:");
  for (const trade of context.trades) {
    const stats = marketStats(trade.closes);
    const recent = trade.closes
      .slice(-25)
      .filter((close): close is number => close !== null)
      .map((close) => close.toPrecision(5));
    lines.push(`- ${trade.side.toUpperCase()} ${trade.symbol} at ${usd(trade.price)}`);
    lines.push(`  Rule says: ${trade.ruleReasoning}`);
    if (stats) {
      lines.push(
        `  Change: 1h ${pct(stats.change1h)}, 24h ${pct(stats.change24h)}, 7d ${pct(stats.change7d)}. 7d range ${usd(stats.low7d)} to ${usd(stats.high7d)}. Typical hourly move ${stats.hourlyMovePct === null ? "n/a" : `${stats.hourlyMovePct.toFixed(2)}%`}.`,
      );
    }
    if (trade.position) {
      const pnl = (trade.price / trade.position.entryPrice - 1) * 100;
      lines.push(`  Position: entry ${usd(trade.position.entryPrice)} (${pct(pnl)}), held ${trade.position.heldHours === null ? "n/a" : `${Math.round(trade.position.heldHours)}h`}.`);
    }
    if (recent.length) lines.push(`  Last ${recent.length} hourly closes: ${recent.join(", ")}`);
  }
  return lines.join("\n");
}

/** Pulls the JSON object out of an answer, even if a model wrapped it in prose or a code fence. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 240);

/**
 * One review per proposed trade. Trades the answer doesn't cover (or an
 * unreadable answer) default to approve, so the rules decide.
 */
export function parseReviews(answer: string, trades: ProposedTrade[]): { reviews: Review[]; valid: boolean } {
  const parsed = extractJson(answer) as { reviews?: unknown } | null;
  const list = Array.isArray(parsed?.reviews) ? (parsed.reviews as { symbol?: unknown; approve?: unknown; reasoning?: unknown }[]) : null;
  const bySymbol = new Map<string, { approve: boolean; reasoning: string }>();
  for (const item of list ?? []) {
    if (typeof item?.symbol !== "string" || typeof item.approve !== "boolean") continue;
    const reasoning = typeof item.reasoning === "string" && item.reasoning.trim() ? clean(item.reasoning) : item.approve ? "Looks fine." : "Not convinced.";
    bySymbol.set(item.symbol.toUpperCase(), { approve: item.approve, reasoning });
  }
  const reviews = trades.map((trade) => {
    const found = bySymbol.get(trade.symbol.toUpperCase());
    return found ? { token: trade.token, ...found } : { token: trade.token, approve: true, reasoning: "No answer from the co-pilot for this trade, so the rules decided." };
  });
  return { reviews, valid: list !== null && bySymbol.size > 0 };
}
