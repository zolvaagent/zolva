import { AskDock } from "@/components/site/AskDock";
import { Landing } from "@/components/site/Landing";
import { listAgents, recentTrades } from "@/lib/data/agents";
import { getMarket } from "@/lib/data/market";
import { houseBacktests } from "@/lib/data/showcase";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";

// Prices and agents change every hour; render on request.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const client = db();
  const [market, allMarkets, agents, feed] = await Promise.all([getMarket(client), getMarket(client, { perps: true }), listAgents(client), recentTrades(client, 14)]);
  // Perps (Lighter, paper only) get their own row under the token grid; the rest of the page stays spot only.
  const perps = allMarkets.tokens.filter((token) => token.venue === "lighter");
  return (
    <>
      <Landing market={market} perps={perps} backtests={houseBacktests(market)} agents={agents} feed={feed} ca={env.zolvaToken?.address ?? null} />
      <AskDock />
    </>
  );
}
