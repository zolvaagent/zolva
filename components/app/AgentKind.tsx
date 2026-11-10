import type { AgentSummary } from "@/lib/data/agents";

/** Filter tabs shared by the leaderboard and /agents: what an agent trades. */
export const VENUE_FILTERS = [
  ["all", "All"],
  ["spot", "Spot"],
  ["perps", "Perps"],
] as const;

export type VenueFilter = (typeof VENUE_FILTERS)[number][0];

export const matchesVenue = (agent: Pick<AgentSummary, "venue">, filter: VenueFilter) => filter === "all" || agent.venue === filter;

/**
 * Small labels for what is not the default (spot, long): "Perps" and "Short". Spot long
 * agents get none, so the labels stand out where they matter.
 */
export function AgentKindPills({ agent }: { agent: Pick<AgentSummary, "venue" | "shorts"> }) {
  if (agent.venue !== "perps" && !agent.shorts) return null;
  return (
    <>
      {agent.venue === "perps" && (
        <span className="pill pill--accent" title="Paper trades on Lighter perps (Robinhood Chain), no leverage">
          Perps
        </span>
      )}
      {agent.shorts && (
        <span className="pill" title="Opens short positions: gains when the price falls">
          Short
        </span>
      )}
    </>
  );
}
