import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TrenchSetup } from "@/components/app/TrenchSetup";
import { getSessionAddress } from "@/lib/auth/session";
import { EXPLORER_URL } from "@/lib/chain";
import { usd } from "@/lib/format";
import { db } from "@/lib/supabase";
import { getMyTrenchAgent, getTrenchSettings } from "@/lib/trench/data";
import { MIN_BUDGET_USD } from "@/lib/trench/onboard";
import { PRESET_INFO, PRESETS } from "@/lib/trench/rules";

export const metadata: Metadata = { title: "Trench agent", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  setup: "Setting up",
  active: "Trading every minute",
  paused: "Paused: no new buys, exits still run",
  halted: "Stopped: selling everything, never buys again",
  closed: "Closed",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const signed = (value: number) => `${value >= 0 ? "+" : "-"}${usd(Math.abs(value))}`;

/** One trench agent, for its owner only (everyone else gets a 404). */
export default async function TrenchAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await getSessionAddress();
  if (!owner) notFound();
  const [data, settings] = await Promise.all([getMyTrenchAgent(db(), owner, id), getTrenchSettings(db())]);
  if (!data) notFound();
  const { agent, positions, trades, decisions } = data;
  const rules = PRESETS[agent.preset];
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const maxCapitalUsd = Number(settings?.max_agent_budget_usd ?? 100);
  const realised = trades.reduce((sum, trade) => sum + (trade.pnlUsd ?? 0), 0);
  const open = positions.filter((position) => position.closedAt === null);

  return (
    <div className="container page trenches-page">
      <div className="page__head">
        <div>
          <p className="muted">
            <Link className="text-link" href="/trenches">
              <i className="ph ph-arrow-left" aria-hidden="true" /> Trenches
            </Link>
          </p>
          <h1 className="page__title">{agent.name}</h1>
          <p className="page__lead">{STATUS[agent.status]}</p>
          {agent.haltedReason ? <p className="loss">{agent.haltedReason}</p> : null}
        </div>
      </div>

      <div className="stats-page__grid">
        <TrenchSetup agent={{ id: agent.id, name: agent.name, status: agent.status, walletAddress: agent.walletAddress, onRushr: agent.onRushr, setupDone: agent.setupDone, rushrHandle: agent.rushrHandle }} minCapitalUsd={MIN_BUDGET_USD} maxCapitalUsd={maxCapitalUsd} />

        <section className="card" aria-label="Numbers">
          <h2 className="card__title">So far</h2>
          <div className="stat-grid">
            <Stat label="Realised P&L" value={signed(realised)} />
            <Stat label="Open tokens" value={`${open.length} of ${rules.sizing.maxOpenTokens}`} />
            <Stat label="Trades" value={String(trades.length)} />
            <Stat label="Stops for good at" value={`-${pct(rules.sizing.totalLossShare)}`} />
          </div>
          <p className="muted trenches-small">Open positions are valued on chain every minute; the realised number counts only what was sold.</p>
        </section>

        <section className="card" aria-label="Strategy">
          <h2 className="card__title">Strategy: {PRESET_INFO[agent.preset].name}</h2>
          <p className="muted">{PRESET_INFO[agent.preset].summary}</p>
          <ul className="trenches-list">
            <li>
              Buys {pct(rules.sizing.firstBuyShare)} of its money per new token, adds {pct(rules.sizing.addShare)} once on strength, holds at most {pct(rules.sizing.maxPerTokenShare)} in one token and {rules.sizing.maxOpenTokens} tokens at once.
            </li>
            <li>
              Stop loss -{rules.exit.stopPct}% on every position. Stops buying for the day after losing {pct(rules.sizing.dailyLossShare)}, and sells everything for good after {pct(rules.sizing.totalLossShare)}.
            </li>
            <li>Its money is what the wallet holds when you press Start (up to {usd(maxCapitalUsd)}; anything above stays in the wallet).</li>
          </ul>
        </section>

        <section className="card" aria-label="Trades">
          <h2 className="card__title">Trades</h2>
          {trades.length === 0 ? (
            <p className="muted">No trades yet.</p>
          ) : (
            <ul className="trenches-calls">
              {trades.map((trade) => (
                <li key={trade.txHash}>
                  <div className="trenches-calls__head">
                    <strong>
                      {trade.side === "buy" ? "Bought" : "Sold"} ${trade.symbol}
                    </strong>
                    <span>{usd(trade.usd)}</span>
                    {trade.pnlUsd !== null ? <span className={trade.pnlUsd >= 0 ? "gain" : "loss"}>{signed(trade.pnlUsd)}</span> : null}
                    <a className="text-link" href={`${EXPLORER_URL}/tx/${trade.txHash}`} target="_blank" rel="noopener noreferrer">
                      {when(trade.ts)}
                    </a>
                  </div>
                  <p>{trade.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-label="Decision log">
          <h2 className="card__title">Decision log</h2>
          {decisions.length === 0 ? (
            <p className="muted">Nothing yet. Holds and skips are written every 15 minutes, trades and errors at once.</p>
          ) : (
            <ul className="trenches-calls">
              {decisions.map((decision, i) => (
                <li key={`${decision.ts}-${i}`}>
                  <div className="trenches-calls__head">
                    <strong>{decision.action}</strong>
                    {decision.symbol ? <span>${decision.symbol}</span> : null}
                    <span className="muted">{when(decision.ts)}</span>
                  </div>
                  <p>{decision.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  );
}
