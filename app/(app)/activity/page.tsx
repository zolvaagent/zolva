import type { Metadata } from "next";
import Link from "next/link";

import { Activity } from "@/components/app/Activity";
import { OpenPositions } from "@/components/app/OpenPositions";
import { getActivity } from "@/lib/data/activity";
import { loadOpenPositions } from "@/lib/data/open-positions";
import { usd } from "@/lib/format";
import { db } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Activity",
  description: "Every paper trade by every Zolva agent, hour by hour, with the reason behind it.",
};
export const dynamic = "force-dynamic";

/** Two views as links (?view=positions), so each loads only its own data and can be shared. */
const VIEWS = [
  ["trades", "Trades", "/activity"],
  ["positions", "Open positions", "/activity?view=positions"],
] as const;

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const client = db();
  const view = (await searchParams).view === "positions" ? "positions" : "trades";
  const tabs = (
    <nav className="tabs activity-views" aria-label="Activity views">
      {VIEWS.map(([key, label, href]) => (
        <Link key={key} className="tab" href={href} aria-current={view === key ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
  if (view === "positions") {
    const positions = await loadOpenPositions(client);
    return (
      <div className="container page">
        <div className="page__head">
          <div>
            <h1 className="page__title">Activity</h1>
            <p className="page__lead">What every public agent holds right now, and how each open position is doing.</p>
          </div>
          <Link className="button button--primary" href="/studio">
            Build your agent
          </Link>
        </div>
        {tabs}
        <OpenPositions data={positions} />
      </div>
    );
  }

  const { hours, trades, passes, lastDay } = await getActivity(client, { pnl: true });
  return (
    <div className="container page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Activity</h1>
          <p className="page__lead">What every agent did each hour: who bought or sold, at what price, and the rule that made it act.</p>
        </div>
        <Link className="button button--primary" href="/studio">
          Build your agent
        </Link>
      </div>

      {tabs}
      <div className="stat-grid" style={{ marginBottom: "var(--space-300)" }}>
        <div className="stat">
          <span className="stat__label">Agent checks, 24h</span>
          <span className="stat__value">{lastDay.checks}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Trades, 24h</span>
          <span className="stat__value">
            {lastDay.buys + lastDay.sells}{" "}
            <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
              {lastDay.buys} buys · {lastDay.sells} sells
            </span>
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Paper volume, 24h</span>
          <span className="stat__value">{usd(lastDay.volumeUsd)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Most traded, 24h</span>
          <span className="stat__value">{lastDay.topSymbol ? `${lastDay.topSymbol.symbol} (${lastDay.topSymbol.trades})` : "None yet"}</span>
        </div>
      </div>

      <Activity hours={hours} trades={trades} passes={passes} />
    </div>
  );
}
