import { Landing } from "@/components/site/Landing";
import { listAgents, recentTrades } from "@/lib/data/agents";
import { getMarket } from "@/lib/data/market";
import { houseBacktests } from "@/lib/data/showcase";
import { db } from "@/lib/supabase";

// Prices and agents change every hour; render on request.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const client = db();
  const [market, agents, feed] = await Promise.all([getMarket(client), listAgents(client), recentTrades(client, 14)]);
  return <Landing market={market} backtests={houseBacktests(market)} agents={agents} feed={feed} />;
}
