import type { Metadata } from "next";
import Link from "next/link";

import { Activity } from "@/components/app/Activity";
import { getActivity } from "@/lib/data/activity";
import { usd } from "@/lib/format";

export const metadata: Metadata = {
  title: "Activity",
  description: "Every paper trade by every Sita agent, hour by hour, with the reason behind it.",
};
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const { hours, trades, lastDay } = await getActivity();
  return (
    <div className="container page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Activity</h1>
          <p className="page__lead">What every agent did each hour: who bought or sold, at what price, and the rule that made it act.</p>
        </div>
        <Link className="button button--primary" href="/forge">
          Build your agent
        </Link>
      </div>

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

      <Activity hours={hours} trades={trades} />
    </div>
  );
}
