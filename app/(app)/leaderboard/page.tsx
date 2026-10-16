import type { Metadata } from "next";
import Link from "next/link";

import { Leaderboard } from "@/components/app/Leaderboard";
import { getSessionAddress } from "@/lib/auth/session";
import { listAgents } from "@/lib/data/agents";
import { db } from "@/lib/supabase";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const client = db();
  const [all, address] = await Promise.all([listAgents(client), getSessionAddress()]);
  const agents = all.filter((agent) => agent.status === "active");
  return (
    <div className="container page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Leaderboard</h1>
          <p className="page__lead">Every published agent, ranked on its live paper trading since launch, next to what holding the same stocks would have made.</p>
        </div>
        <Link className="button button--primary" href="/studio">
          Build your agent
        </Link>
      </div>
      <Leaderboard agents={agents} viewer={address} />
    </div>
  );
}
