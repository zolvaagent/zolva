/**
 * "Copy to Studio": which agents the Studio can rebuild from their settings. Shared by the server
 * (lib/data/agents.ts) and client pages (the agent page), so it imports nothing server-only.
 */
import type { AgentSummary } from "@/lib/data/agents";

/** Strategies the Studio builds. Dip Hunter and Spike Fade compare all their markets each hour, which its rules cannot express yet. */
export const STUDIO_STRATEGIES = ["momentum", "mean_reversion", "custom"] as const;
/** Most markets a Studio agent watches. */
export const STUDIO_MAX_MARKETS = 3;

/**
 * Why the Studio cannot rebuild an agent, or null when it can. The Studio builds published paper
 * spot agents with its own strategies and up to STUDIO_MAX_MARKETS markets.
 */
export function copyBlock(summary: Pick<AgentSummary, "venue" | "strategy" | "tokens" | "published" | "live">): string | null {
  if (summary.live) return "Real money agents can't be copied.";
  if (!summary.published) return "Only agents on the leaderboard can be copied.";
  if (summary.venue === "perps") return "Perps agents can't be copied to the Studio yet.";
  if (!(STUDIO_STRATEGIES as readonly string[]).includes(summary.strategy)) return "This strategy isn't in the Studio yet.";
  if (summary.tokens.length > STUDIO_MAX_MARKETS) return `Studio agents watch up to ${STUDIO_MAX_MARKETS} markets; this one watches ${summary.tokens.length}.`;
  return null;
}
