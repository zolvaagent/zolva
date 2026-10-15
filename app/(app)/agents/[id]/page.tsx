import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AgentView, type Preview } from "@/components/app/AgentView";
import { agentParams } from "@/lib/agents/plan";
import { getSessionAddress } from "@/lib/auth/session";
import { getAgentDetail } from "@/lib/data/agents";
import { getMarket } from "@/lib/data/market";
import { buyAndHold, simulate } from "@/lib/engine/engine";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/agents/[id]">): Promise<Metadata> {
  const detail = await getAgentDetail((await params).id);
  return { title: detail ? detail.agent.name : "Agent not found" };
}

export default async function AgentPage({ params }: PageProps<"/agents/[id]">) {
  const { id } = await params;
  const [detail, address, market] = await Promise.all([getAgentDetail(id), getSessionAddress(), getMarket()]);
  if (!detail) notFound();

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

  return <AgentView detail={detail} isOwner={address === detail.agent.owner} prices={prices} preview={preview} symbols={symbols} />;
}
