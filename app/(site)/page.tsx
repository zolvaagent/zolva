import { Landing } from "@/components/site/Landing";
import { listAgents, recentTrades } from "@/lib/data/agents";
import { getMarket } from "@/lib/data/market";
import { houseBacktests } from "@/lib/data/showcase";

// Prices and agents change every hour; render on request.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [market, agents, feed] = await Promise.all([getMarket(), listAgents(), recentTrades(14)]);
  return <Landing market={market} backtests={houseBacktests(market)} agents={agents} feed={feed} />;
}
