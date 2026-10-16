import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AgentView, type Preview } from "@/components/app/AgentView";
import { agentParams } from "@/lib/agents/plan";
import { getSessionAddress } from "@/lib/auth/session";
import { getAgentDetail, type AgentDetail } from "@/lib/data/agents";
import { getCredits } from "@/lib/data/credits";
import { getMarket } from "@/lib/data/market";
import { buyAndHold, simulate } from "@/lib/engine/engine";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const canView = (detail: AgentDetail, address: string | null) => detail.agent.published_at !== null || address === detail.agent.owner;

export async function generateMetadata({ params }: PageProps<"/agents/[id]">): Promise<Metadata> {
  const client = db();
  const [detail, address] = await Promise.all([getAgentDetail(client, (await params).id), getSessionAddress()]);
  return { title: detail && canView(detail, address) ? detail.agent.name : "Agent not found" };
}

export default async function AgentPage({ params }: PageProps<"/agents/[id]">) {
  const client = db();
  const { id } = await params;
  const [detail, address, market] = await Promise.all([getAgentDetail(client, id), getSessionAddress(), getMarket(client)]);
  // A private agent looks like it does not exist to everyone but its owner.
  if (!detail || !canView(detail, address)) notFound();

  const last = market.hours - 1;
  const prices: Record<string, number> = {};
  const symbols: Record<string, string> = {};
  for (const token of market.tokens) {
    symbols[token.address] = token.symbol;
    const close = token.closes[last];
    if (close != null) prices[token.address] = close;
  }

  // While the agent has no history, show the same settings over the last 30 days.
  let preview: Preview = null;
  if (!detail.runs.length) {
    const fromIndex = market.hours - 30 * 24;
    const series = Object.fromEntries(detail.agent.token_addresses.map((address) => [address, market.tokens.find((token) => token.address === address)?.closes ?? []]));
    if (Object.values(series).every((closes) => closes[fromIndex - 80] != null)) {
      const result = simulate({ series, params: agentParams(detail.agent), capital: detail.summary.startCapital, fromIndex, times: market.tokens[0].closes.map((_, i) => market.startTs + i * 3600) });
      const hold = buyAndHold(series, detail.summary.startCapital, fromIndex);
      preview = { startTs: market.startTs + fromIndex * 3600, equity: result.runs.map((run) => run.equity), hold: hold.curve, returnPct: result.returnPct, holdReturnPct: hold.returnPct };
    }
  }

  const isOwner = address === detail.agent.owner;
  const credits = isOwner && address ? await getCredits(client, address) : null;
  return <AgentView detail={detail} isOwner={isOwner} credits={credits} prices={prices} preview={preview} symbols={symbols} />;
}
