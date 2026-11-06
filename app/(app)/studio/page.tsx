import type { Metadata } from "next";

import { Studio, type StudioTemplate } from "@/components/app/Studio";
import { getSessionAddress } from "@/lib/auth/session";
import { getAgentTemplate, listAgentsByOwner } from "@/lib/data/agents";
import { getCredits } from "@/lib/data/credits";
import { getMarket } from "@/lib/data/market";
import { parseRules } from "@/lib/engine/rules";
import { db } from "@/lib/supabase";

export const metadata: Metadata = { title: "Agent Studio" };
export const dynamic = "force-dynamic";

const clamp = (value: number, min: number, max: number, fallback: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);

export default async function StudioPage({ searchParams }: PageProps<"/studio">) {
  const client = db();
  const [market, address, params] = await Promise.all([getMarket(client), getSessionAddress(), searchParams]);
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  // "Use these rules" on /agents: start from a published agent's settings. Unknown or private ids open a blank Studio.
  const fromId = first(params.from);
  const [[mine, credits], source] = await Promise.all([
    address ? Promise.all([listAgentsByOwner(client, address), getCredits(client, address)]) : Promise.resolve([[], null] as const),
    fromId ? getAgentTemplate(client, fromId) : Promise.resolve(null),
  ]);
  const rules = source?.strategy === "custom" ? parseRules(source.rules).rules : null;
  const template: StudioTemplate | null =
    fromId && source && (source.strategy !== "custom" || rules)
      ? {
          id: fromId,
          name: source.name,
          strategy: source.strategy,
          rules,
          symbols: source.symbols,
          // Same ranges as the Studio sliders.
          maxPositionPct: clamp(source.maxPositionPct, 10, 100, 33),
          stopLossPct: clamp(source.stopLossPct, 2, 25, 8),
        }
      : null;
  return (
    <Studio
      market={market}
      activeCount={mine.filter((agent) => agent.status === "active").length}
      initialStrategy={first(params.strategy)}
      initialStock={first(params.stock)}
      credits={credits}
      template={template}
    />
  );
}
