/**
 * An agent's rules in plain words, built from its parsed params (never from AI), so the text
 * always says exactly what the engine does. Shown in the Studio before launch, on agent pages
 * and in the public API/MCP.
 *
 * Preset sentences read their thresholds from strategies.ts, so they cannot drift from the code.
 */
import { costRateFor, LIQUIDATION_LOSS, RESIZE_BAND, type AgentParams } from "./engine.ts";
import { describeCondition, type RuleGroup } from "./rules.ts";
import { BOUNCE_SHORT, DIP_FADE, LOOKBACK_HOURS, MEAN_REVERSION, MOMENTUM, SPIKE_FADE } from "./strategies.ts";

export type SummaryOptions = {
  /** Market symbols the agent trades, in order. */
  symbols: string[];
  /** live: real money from the owner's wallet. Default paper. */
  mode?: "paper" | "live";
  /** Set when an AI co-pilot reviews the rule signals. */
  aiModel?: string | null;
};

/** One sentence per line, in the order a reader needs them: what, when in, when out, risk, size, how often. */
export function describeAgent(params: AgentParams, options: SummaryOptions): string[] {
  const perps = params.venue === "perps";
  const lines: string[] = [];

  lines.push(`Trades ${list(options.symbols)}${perps ? " on Lighter perps" : ""}.`);
  lines.push(...strategyLines(params));

  if (params.rules?.takeProfitPct) lines.push(`Take profit: sells everything ${pct(params.rules.takeProfitPct)} above the entry price.`);
  if (params.rules?.maxHoldHours) lines.push(`Sells after holding a market for ${hours(params.rules.maxHoldHours)}.`);

  const shorts = params.strategy === "spike_fade" || params.strategy === "bounce_short" || params.strategy === "dip_fade" || Boolean(params.rules?.shortEntry?.conditions.length);
  const longs = params.strategy !== "spike_fade" && params.strategy !== "bounce_short";
  if (longs) lines.push(`Stop loss: sells everything ${pct(params.stopLossPct)} below the entry price.`);
  if (shorts) lines.push(`Stop loss: covers everything ${pct(params.stopLossPct)} above the short price.`);
  const leverage = params.strategy === "bounce_short" && perps ? Math.max(1, params.leverage ?? 1) : 1;
  if (leverage > 1) {
    lines.push(`Shorts at ${leverage}x: a position is ${leverage} times the cash it puts in, and is closed once it has lost ${pct(LIQUIDATION_LOSS * 100)} of that cash (a ${pct((LIQUIDATION_LOSS / leverage) * 100)} move against it).`);
  }

  if (params.strategy === "custom" && params.sizing) {
    lines.push(
      `Sizes each buy by volatility: ${pct(params.sizing.targetPct)} a year divided by the market's volatility over the last ${hours(params.sizing.hours)}, at most ${pct(params.maxPositionPct)} of the agent. Once a day at 00:00 UTC it buys or sells the difference when the position is more than ${pct(RESIZE_BAND * 100)} off that size.`,
    );
  } else {
    lines.push(`Puts at most ${pct(params.maxPositionPct)} of the agent into one market.`);
  }

  lines.push(`Decides once an hour on the hourly close. Each trade pays ${pct(costRateFor(params.venue) * 100)} for fees and slippage${perps ? ", and open positions pay or earn hourly funding" : ""}.`);
  if (options.aiModel) lines.push("An AI co-pilot reviews each rule signal and may pass on a trade. It never sizes trades or skips a stop loss.");
  lines.push(options.mode === "live" ? "Real money from your own wallet." : "Paper money: virtual dollars at real prices.");
  return lines;
}

function strategyLines(params: AgentParams): string[] {
  switch (params.strategy) {
    case "momentum":
      return [
        `Buys a market that is up more than ${pct(MOMENTUM.entryChange24h * 100)} over 24 hours and above its ${LOOKBACK_HOURS}h average.`,
        `Sells when the price falls ${pct(MOMENTUM.exitBelowAverage * 100)} below its ${LOOKBACK_HOURS}h average.`,
      ];
    case "mean_reversion":
      return [dipLine(), dipExitLine()];
    case "dip_hunter":
      return [dipLine(), dipExitLine(), "Holds one market at a time: when several dip together, it buys the deepest."];
    case "spike_fade":
      return [spikeLine(), spikeExitLine(), "Holds one short at a time: when several spike together, it shorts the highest."];
    case "dip_fade":
      return [
        `${dipLine()} ${spikeLine()}`,
        `${dipExitLine()} ${spikeExitLine()}`,
        `Holds at most one long and one short. No long while a market is down more than ${pct(DIP_FADE.trendLimit * 100)} over 7 days, no short while it is up more than ${pct(DIP_FADE.trendLimit * 100)}.`,
      ];
    case "bounce_short":
      return [
        `Shorts a market that is down more than ${pct(BOUNCE_SHORT.trendLimit * 100)} over 7 days once it bounces back above its ${LOOKBACK_HOURS}h average (z score from ${signed(BOUNCE_SHORT.entryZ)} to ${signed(BOUNCE_SHORT.maxEntryZ)}), unless it rose more than ${pct(BOUNCE_SHORT.fastMax * 100)} in the last ${BOUNCE_SHORT.fastHours} hours.`,
        `Covers once the z score is back to ${signed(BOUNCE_SHORT.exitZ)} or lower.`,
        "Holds one short at a time: the market with the deepest 7 day fall.",
      ];
    case "custom": {
      if (!params.rules) return [];
      const exit = params.rules.exit.conditions.length
        ? `Sells when ${group(params.rules.exit)}.`
        : "No sell rule: it exits only on the stop loss, take profit or max holding time.";
      const lines = [`Buys when ${group(params.rules.entry)}.`, exit];
      // Lab perps rules can also short.
      if (params.rules.shortEntry?.conditions.length) {
        lines.push(`Shorts when ${group(params.rules.shortEntry)}.`);
        if (params.rules.shortExit?.conditions.length) lines.push(`Covers when ${group(params.rules.shortExit)}.`);
      }
      return lines;
    }
  }
}

const dipLine = () =>
  `Buys an unusual dip: the price far below its ${LOOKBACK_HOURS}h average (z score below ${signed(MEAN_REVERSION.entryZ)}).`;
const dipExitLine = () => `Sells once the z score is back to ${signed(MEAN_REVERSION.exitZ)} or higher.`;
const spikeLine = () => `Shorts an unusual spike: the price far above its ${LOOKBACK_HOURS}h average (z score above ${signed(SPIKE_FADE.entryZ)}).`;
const spikeExitLine = () => `Covers once the z score is back to ${signed(SPIKE_FADE.exitZ)} or lower.`;

/** "price above 48h average" or "all of: a; b" / "any of: a; b". */
function group(rules: RuleGroup): string {
  const parts = rules.conditions.map((condition) => describeCondition(condition));
  if (parts.length === 1) return parts[0];
  return `${rules.join === "all" ? "all of these hold" : "any of these holds"}: ${parts.join("; ")}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "no markets";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function pct(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}`;
}

function hours(value: number): string {
  return value % 24 === 0 && value >= 48 ? `${value / 24} days` : `${value} hours`;
}
