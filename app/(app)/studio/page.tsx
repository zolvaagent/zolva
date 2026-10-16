import type { Metadata } from "next";

import { Studio } from "@/components/app/Studio";
import { getSessionAddress } from "@/lib/auth/session";
import { listAgentsByOwner } from "@/lib/data/agents";
import { getCredits } from "@/lib/data/credits";
import { getMarket } from "@/lib/data/market";
import { db } from "@/lib/supabase";

export const metadata: Metadata = { title: "Agent Studio" };
export const dynamic = "force-dynamic";

export default async function StudioPage({ searchParams }: PageProps<"/studio">) {
  const client = db();
  const [market, address, params] = await Promise.all([getMarket(client), getSessionAddress(), searchParams]);
  const [mine, credits] = address ? await Promise.all([listAgentsByOwner(client, address), getCredits(client, address)]) : [[], null];
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return (
    <Studio
      market={market}
      activeCount={mine.filter((agent) => agent.status === "active").length}
      initialStrategy={first(params.strategy)}
      initialStock={first(params.stock)}
      credits={credits}
    />
  );
}
