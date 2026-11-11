/**
 * What the Studio can build, and "Copy to Studio": which agents it can rebuild from their
 * settings. Shared by the server (lib/agents/create.ts, lib/data/agents.ts) and client pages (the
 * Studio, the agent page), so it imports nothing server-only.
 */
import type { AgentSummary } from "@/lib/data/agents";

/** Strategies the Studio builds. */
export const STUDIO_STRATEGIES = ["momentum", "mean_reversion", "custom", "dip_hunter", "spike_fade"] as const;
export type StudioStrategy = (typeof STUDIO_STRATEGIES)[number];
/** Most markets for momentum, mean reversion and custom agents. */
export const STUDIO_MAX_MARKETS = 3;
/**
 * Dip Hunter and Spike Fade compare all their markets each hour and enter only the most extreme
 * one, so they are built for a wider basket.
 */
export const STUDIO_MAX_MARKETS_WIDE = 8;

/** How many markets a Studio agent with this strategy may watch. */
export function maxMarketsFor(strategy: string): number {
  return strategy === "dip_hunter" || strategy === "spike_fade" ? STUDIO_MAX_MARKETS_WIDE : STUDIO_MAX_MARKETS;
}

/** Spike Fade opens shorts, and shorts trade perps only (spot is long only). */
export function strategyNeedsPerps(strategy: string): boolean {
  return strategy === "spike_fade";
}

/**
 * Why the Studio cannot rebuild an agent, or null when it can. The Studio builds published paper
 * agents (spot or perps) with its strategies and their market limits.
 */
export function copyBlock(summary: Pick<AgentSummary, "venue" | "strategy" | "tokens" | "published" | "live">): string | null {
  if (summary.live) return "Real money agents can't be copied.";
  if (!summary.published) return "Only agents on the leaderboard can be copied.";
  if (!(STUDIO_STRATEGIES as readonly string[]).includes(summary.strategy)) return "This strategy isn't in the Studio yet.";
  if (strategyNeedsPerps(summary.strategy) && summary.venue !== "perps") return "Spot Spike Fade is retired: Spike Fade now trades perps.";
  const max = maxMarketsFor(summary.strategy);
  if (summary.tokens.length > max) return `Studio agents with this strategy watch up to ${max} markets; this one watches ${summary.tokens.length}.`;
  return null;
}
