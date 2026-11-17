import type { Metadata } from "next";
import Link from "next/link";

import { TrenchCreate } from "@/components/app/TrenchCreate";
import { db } from "@/lib/supabase";
import { getSessionAddress } from "@/lib/auth/session";
import { getTrenchSettings, mayCreateTrenchAgent } from "@/lib/trench/data";
import { MIN_BUDGET_USD } from "@/lib/trench/onboard";

export const metadata: Metadata = { title: "New trench agent", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewTrenchAgentPage() {
  const [settings, owner] = await Promise.all([getTrenchSettings(db()), getSessionAddress()]);
  return (
    <div className="container page trenches-page">
      <div className="page__head">
        <div>
          <h1 className="page__title">New trench agent</h1>
          <p className="page__lead">It trades almost-bonded memecoins every minute from its own wallet, through Rushr. You fund it, you can pause it, and you withdraw whenever it holds nothing.</p>
        </div>
      </div>
      {settings && mayCreateTrenchAgent(settings, owner) ? (
        <TrenchCreate maxBudgetUsd={Number(settings.max_agent_budget_usd)} minBudgetUsd={MIN_BUDGET_USD} />
      ) : (
        <p className="card muted">
          Trench agents are not open yet. <Link className="text-link" href="/trenches">Get notified on the Trenches page</Link>.
        </p>
      )}
    </div>
  );
}
