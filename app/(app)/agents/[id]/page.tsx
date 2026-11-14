import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { AgentView, type Preview } from "@/components/app/AgentView";
import { agentParams } from "@/lib/agents/plan";
import { getSessionAddress, LOGIN_METHOD_COOKIE } from "@/lib/auth/session";
import { getAgentDetail, type AgentDetail } from "@/lib/data/agents";
import { getCredits } from "@/lib/data/credits";
import { getMarket } from "@/lib/data/market";
import { dayAt, percent, signedUsd } from "@/lib/format";
import { getAgentShare } from "@/lib/share/agent-share";
import { buyAndHold, costRateFor, paramsLookback, simulate } from "@/lib/engine/engine";
import { describeAgent } from "@/lib/engine/summary";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// A page stays public once the agent has been published, even after its owner unpublishes it:
// unpublishing only takes it off the leaderboard, it never hides the record.
const canView = (detail: AgentDetail, address: string | null) =>
  detail.agent.published_at !== null || detail.agent.first_published_at !== null || address === detail.agent.owner;

export async function generateMetadata({ params }: PageProps<"/agents/[id]">): Promise<Metadata> {
  const client = db();
  const { id } = await params;
  const [detail, address, share] = await Promise.all([getAgentDetail(client, id), getSessionAddress(), getAgentShare(client, id)]);
  if (!detail || !canView(detail, address)) return { title: "Agent not found" };
  // Shareable agents get their own preview text; the image comes from opengraph-image.tsx.
  if (!share) return { title: detail.agent.name };
  const title = `${share.name}: ${percent(share.returnPct)} since ${dayAt(share.createdAt)}`;
  const description = `${share.live ? "Real money" : "Paper"} AI trading agent on ${share.symbols.join(", ")}. P&L ${signedUsd(share.pnlUsd)}, holding the same markets ${percent(share.holdReturnPct)}. Every decision and its reason is public on Zolva.`;
  return {
    title: share.name,
    description,
    openGraph: { title, description, url: `/agents/${id}`, type: "website", siteName: "Zolva" },
    twitter: { card: "summary_large_image", site: "@zolva_agent", title, description },
  };
}

export default async function AgentPage({ params }: PageProps<"/agents/[id]">) {
  const client = db();
  const { id } = await params;
  const [detail, address, market] = await Promise.all([getAgentDetail(client, id), getSessionAddress(), getMarket(client, { perps: true })]);
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
    const own = detail.agent.token_addresses.map((address) => market.tokens.find((token) => token.address === address));
    const series = Object.fromEntries(detail.agent.token_addresses.map((address, i) => [address, own[i]?.closes ?? []]));
    // Perps agents also pay funding (missing for DEX tokens, which the engine ignores).
    const funding = Object.fromEntries(detail.agent.token_addresses.map((address, i) => [address, own[i]?.funding ?? []]));
    const params = agentParams(detail.agent);
    // Only when the window holds the rule's whole look-back (the 1,200 hour Lab rules do not fit).
    if (fromIndex - paramsLookback(params) >= 0 && Object.values(series).every((closes) => closes[fromIndex - paramsLookback(params)] != null)) {
      const result = simulate({ series, params, capital: detail.summary.startCapital, fromIndex, times: market.tokens[0].closes.map((_, i) => market.startTs + i * 3600), funding });
      const hold = buyAndHold(series, detail.summary.startCapital, fromIndex, undefined, costRateFor(params.venue));
      preview = { startTs: market.startTs + fromIndex * 3600, equity: result.runs.map((run) => run.equity), hold: hold.curve, returnPct: result.returnPct, holdReturnPct: hold.returnPct };
    }
  }

  const isOwner = address === detail.agent.owner;
  const credits = isOwner && address ? await getCredits(client, address) : null;
  // Display only: how to sign a manual sale on a live agent (Privy window or browser wallet).
  const method = (await cookies()).get(LOGIN_METHOD_COOKIE)?.value;
  const loginMethod = method === "privy" || method === "wallet" ? method : null;
  const howItTrades = describeAgent(agentParams(detail.agent), {
    symbols: detail.agent.token_addresses.map((address) => symbols[address] ?? address),
    mode: detail.agent.mode,
    aiModel: detail.agent.ai_model,
  });
  return <AgentView detail={detail} isOwner={isOwner} credits={credits} prices={prices} preview={preview} symbols={symbols} howItTrades={howItTrades} loginMethod={loginMethod} />;
}
