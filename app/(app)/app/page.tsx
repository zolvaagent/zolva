import type { Metadata } from "next";

import { Dashboard } from "@/components/app/Dashboard";
import { LoginPrompt } from "@/components/app/LoginPrompt";
import { getSessionAddress } from "@/lib/auth/session";
import { equityCurves, listAgents, listAgentsByOwner, tokenSymbols } from "@/lib/data/agents";
import type { Decision } from "@/lib/engine/engine";
import { db } from "@/lib/supabase";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const address = await getSessionAddress();
  if (!address) {
    return (
      <div className="container page">
        <div className="card">
          <div className="empty" style={{ padding: "var(--space-800) var(--space-300)" }}>
            <img src="/img/brand/zolva-mark.png" alt="" width={88} height={88} />
            <h1 className="page__title">Log in to Zolva</h1>
            <p>Use your wallet to sign in. Your dashboard keeps your agents, their results and your account in one place.</p>
            <LoginPrompt />
          </div>
        </div>
      </div>
    );
  }

  const [agents, everyone, symbols] = await Promise.all([listAgentsByOwner(address), listAgents(), tokenSymbols()]);
  const curves = await equityCurves(agents.map((agent) => agent.id));

  // Latest decisions of the newest running agent that has run at least once.
  const newest = agents.find((agent) => agent.status === "active" && agent.runs > 0);
  let latest = null;
  if (newest) {
    const { data } = await db().from("agent_runs").select("ts, decisions").eq("agent_id", newest.id).order("ts", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      latest = {
        agentId: newest.id,
        agentName: newest.name,
        ts: Date.parse(data.ts) / 1000,
        decisions: (data.decisions as Decision[]).map((decision) => ({ ...decision, symbol: symbols.get(decision.token) ?? decision.token })),
      };
    }
  }

  const top = everyone.filter((agent) => agent.status === "active").sort((a, b) => b.returnPct - a.returnPct).slice(0, 3);
  return <Dashboard address={address} agents={agents} curves={Object.fromEntries(curves)} latest={latest} top={top} />;
}
