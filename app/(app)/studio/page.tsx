import type { Metadata } from "next";

import { Studio } from "@/components/app/Studio";
import { getSessionAddress } from "@/lib/auth/session";
import { listAgentsByOwner } from "@/lib/data/agents";
import { getMarket } from "@/lib/data/market";

export const metadata: Metadata = { title: "Agent Studio" };
export const dynamic = "force-dynamic";

export default async function StudioPage({ searchParams }: PageProps<"/studio">) {
  const [market, address, params] = await Promise.all([getMarket(), getSessionAddress(), searchParams]);
  const mine = address ? await listAgentsByOwner(address) : [];
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return (
    <Studio
      market={market}
      activeCount={mine.filter((agent) => agent.status === "active").length}
      initialStrategy={first(params.strategy)}
      initialStock={first(params.stock)}
    />
  );
}
