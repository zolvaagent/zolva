import type { AgentSummary } from "@/lib/data/agents";

/** Filter tabs shared by the leaderboard and /agents: what an agent trades. */
export const VENUE_FILTERS = [
  ["all", "All"],
  ["spot", "Spot"],
  ["perps", "Perps"],
] as const;

export type VenueFilter = (typeof VENUE_FILTERS)[number][0];

/** The label for agents that trade real money (mode live): a green dot and "Real money". */
export function RealMoneyPill() {
  return (
    <span className="pill pill--real" title="Trades real USDG on Robinhood Chain. Every trade is an on-chain transaction.">
      <span className="pill__dot" aria-hidden="true" />
      Real money
    </span>
  );
}

export const matchesVenue = (agent: Pick<AgentSummary, "venue">, filter: VenueFilter) => filter === "all" || agent.venue === filter;

/**
 * Small labels for what is not the default (paper, spot, long): "Real money", "Perps" and
 * "Short". Paper spot long agents get none, so the labels stand out where they matter.
 */
export function AgentKindPills({ agent }: { agent: Pick<AgentSummary, "venue" | "shorts"> & { live?: boolean } }) {
  if (agent.venue !== "perps" && !agent.shorts && !agent.live) return null;
  return (
    <>
      {agent.live && <RealMoneyPill />}
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
