import type { Metadata } from "next";
import { cookies } from "next/headers";

import { Dashboard } from "@/components/app/Dashboard";
import { listApiKeyEvents, listApiKeys } from "@/lib/api-keys/server";
import { LoginPrompt } from "@/components/app/LoginPrompt";
import { getSessionAddress, LOGIN_METHOD_COOKIE } from "@/lib/auth/session";
import { equityCurves, listAgents, listAgentsByOwner, STUDIO_MAX_MARKETS, STUDIO_STRATEGIES, tokenSymbols } from "@/lib/data/agents";
import { getCredits } from "@/lib/data/credits";
import { storedTier } from "@/lib/membership";
import { TIERS } from "@/lib/tiers";
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

  const client = db();
  const [agents, everyone, symbols, credits, liveWallet, cookieStore, tier, apiKeys] = await Promise.all([
    listAgentsByOwner(client, address),
    listAgents(client),
    tokenSymbols(client),
    getCredits(client, address),
    client.from("live_wallets").select("address").eq("address", address).maybeSingle(),
    cookies(),
    storedTier(client, address),
    // Until the api_keys migration is applied the card shows no keys instead of breaking the Dashboard.
    Promise.all([listApiKeys(client, address), listApiKeyEvents(client, address)])
      .then(([keys, events]) => ({ keys, events }))
      .catch((cause) => {
        console.error("dashboard api keys", cause);
        return { keys: [], events: [] };
      }),
  ]);
  // Display only: decides whether to offer the private key export (Privy embedded wallets).
  const loginMethod = cookieStore.get(LOGIN_METHOD_COOKIE)?.value === "privy" ? "privy" : cookieStore.get(LOGIN_METHOD_COOKIE)?.value === "wallet" ? "wallet" : null;
  const curves = await equityCurves(client, agents.map((agent) => agent.id));

  // Latest decisions of the newest running agent that has run at least once.
  const newest = agents.find((agent) => agent.status === "active" && agent.runs > 0);
  let latest = null;
  if (newest) {
    const { data } = await client.from("agent_runs").select("ts, decisions").eq("agent_id", newest.id).order("ts", { ascending: false }).limit(1).maybeSingle();
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
  // For a new account: the best public spot agent the Studio can copy, with at least 3 days on the record.
  // The Studio page itself refuses private and real money agents, so the link can never copy one.
  const starter = agents.length
    ? null
    : (everyone
        .filter((agent) => agent.status === "active" && agent.published && agent.venue === "spot" && agent.runs >= 72 && agent.tokens.length <= STUDIO_MAX_MARKETS && (STUDIO_STRATEGIES as readonly string[]).includes(agent.strategy))
        .sort((a, b) => b.returnPct - a.returnPct)[0] ?? null);
  return <Dashboard address={address} agents={agents} curves={Object.fromEntries(curves)} latest={latest} top={top} credits={credits} loginMethod={loginMethod} liveSigner={Boolean(liveWallet.data)} maxActive={TIERS[tier].activeAgents} starter={starter} apiKeys={apiKeys} />;
}
