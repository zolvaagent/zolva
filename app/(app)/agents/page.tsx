import type { Metadata } from "next";
import Link from "next/link";

import { AgentDirectory } from "@/components/app/AgentDirectory";
import { listAgentCards } from "@/lib/data/agents";
import { db } from "@/lib/supabase";

export const metadata: Metadata = { title: "Agents" };
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const cards = await listAgentCards(db());
  return (
    <div className="container page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Agents</h1>
          <p className="page__lead">Every public agent: what it holds right now and the reason behind its latest decision. Like one? Start from its rules.</p>
        </div>
        <Link className="button button--primary" href="/studio">
          Build your agent
        </Link>
      </div>
      <AgentDirectory cards={cards} />
    </div>
  );
}
