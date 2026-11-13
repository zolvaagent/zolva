import Link from "next/link";

import { RealMoneyPill } from "@/components/app/AgentKind";
import { DecisionRow } from "@/components/app/AgentView";
import { TrackedLink } from "@/components/ui/TrackedLink";
import type { AgentSummary } from "@/lib/data/agents";
import type { Decision } from "@/lib/engine/engine";
import { dateAt, marketList, percent, shortAddress, sparkline, STRATEGY_NAMES, tone, usd } from "@/lib/format";
import { formatCredits } from "@/lib/ai/models";
import { TIERS, type Tier } from "@/lib/tiers";

type Props = {
  /** AI co-pilot credits, USD. */
  credits: { freeUsd: number; paidUsd: number };
  address: string;
  agents: AgentSummary[];
  curves: Record<string, number[]>;
  latest: { agentName: string; agentId: string; ts: number; decisions: (Decision & { symbol: string })[] } | null;
  top: AgentSummary[];
  /** ZOLVA membership tier, shown in the account summary. */
  tier: Tier;
  /** Running agents allowed at once: 5, or more for ZOLVA holders (lib/tiers.ts). */
  maxActive: number;
  /** A public paper agent a new account can start from ("Use these rules"), or null. */
  starter: AgentSummary | null;
};

/** Agent cards shown before "Show more": with the Build card that fills three rows of two. */
const AGENTS_SHOWN = 5;

function greeting() {
  const hour = new Date().getUTCHours();
  return hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function Dashboard({ address, agents, curves, latest, top, credits, tier, maxActive, starter }: Props) {
  const active = agents.filter((agent) => agent.status === "active");
  // Paper totals leave real money agents out: their dollars are not virtual.
  const paper = agents.filter((agent) => !agent.live);
  const liveCount = agents.length - paper.length;
  const totalStart = paper.reduce((sum, agent) => sum + agent.startCapital, 0);
  const totalNow = paper.reduce((sum, agent) => sum + agent.equity, 0);
  const totalReturn = totalStart ? (totalNow / totalStart - 1) * 100 : 0;
  const liveNote = liveCount ? `, ${liveCount} real money ${liveCount === 1 ? "agent" : "agents"} not counted` : "";
  const moreCount = Math.max(agents.length - AGENTS_SHOWN, 0);

  // Cards past AGENTS_SHOWN stay in the same grid but are hidden by CSS until
  // "Show more" opens, so the Build card stays last either way.
  const agentCard = (agent: AgentSummary, index: number) => {
    const curve = curves[agent.id] ?? [];
    return (
      <Link key={agent.id} className={`agent-card${index >= AGENTS_SHOWN ? " agent-card--extra" : ""}`} href={`/agents/${agent.id}`}>
        <div className="agent-card__head">
          <img src={`/img/icons/${agent.strategy === "mean_reversion" ? "mean-reversion" : agent.strategy === "custom" ? "backtest" : "momentum"}.png`} alt="" width={44} height={44} />
          <span className="agent-card__pills">
            {agent.status === "active" ? (
              <span className="pill pill--running">
                <span className="pulse" />
                Running
              </span>
            ) : (
              <span className="pill pill--paused">
                <i className="ph ph-pause" />
                Paused
              </span>
            )}
            {agent.live && <RealMoneyPill />}
            <span className="pill">
              <i className={`ph ${agent.published ? "ph-globe-simple" : "ph-lock-simple"}`} aria-hidden="true" />
              {agent.published ? "On leaderboard" : "Private"}
            </span>
          </span>
        </div>
        <div>
          <h3 className="card__title">{agent.name}</h3>
          <p className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
            {STRATEGY_NAMES[agent.strategy]} · {marketList(agent.tokens.map((token) => token.symbol))}
          </p>
        </div>
        {curve.length > 1 ? (
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" style={{ width: "100%", height: 32 }} aria-hidden="true">
            <polyline points={sparkline(curve, 32, 2)} fill="none" stroke="var(--color-purple-rich)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <div className="agent-card__waiting">
            {agent.status === "active" ? (
              <>
                <span className="pulse" />
                First decision at the top of the hour
              </>
            ) : (
              <>
                <i className="ph ph-pause" />
                Paused, not trading
              </>
            )}
          </div>
        )}
        <div className="agent-card__foot">
          <span>
            Value<strong>{usd(agent.equity)}</strong>
          </span>
          <span style={{ textAlign: "right" }}>
            Return<strong className={tone(agent.returnPct)}>{percent(agent.returnPct)}</strong>
          </span>
        </div>
      </Link>
    );
  };

  return (
    <div className="container page">
      <div className="page__head">
        <div>
          <span className="eyebrow">{greeting()} (UTC)</span>
          <h1 className="page__title" style={{ marginTop: "var(--space-75)" }}>
            Your desk
          </h1>
        </div>
        <Link className="button button--primary" href="/studio">
          <i className="ph ph-plus" />
          New agent
        </Link>
      </div>

      {/* A new account has nothing to total yet: point it at its first launch instead. */}
      {agents.length === 0 ? (
        <div className="card first-agent">
          <img src="/img/icons/agent.png" alt="" width={72} height={72} />
          <div className="first-agent__text">
            <h2 className="card__title">Launch your first agent</h2>
            <p className="muted">Pick a starting point, check its last 30 days, then launch. Paper trading is free and takes about a minute.</p>
          </div>
          <div className="first-agent__actions">
            <TrackedLink className="button button--primary" href="/studio" event="first_agent_cta" detail="dashboard_studio">
              Open the Studio
            </TrackedLink>
            {starter && (
              <TrackedLink className="button" href={`/studio?from=${starter.id}`} title={`Start from the rules of ${starter.name}`} event="first_agent_cta" detail="dashboard_copy">
                <i className="ph ph-copy" aria-hidden="true" />
                Copy {starter.name}
              </TrackedLink>
            )}
          </div>
        </div>
      ) : (
      <div className="dash-stats">
        <div className="dash-stat dash-stat--accent">
          <span className="stat__label">Paper balance</span>
          <span className="dash-stat__value">{usd(totalNow || 0)}</span>
          <span className="dash-stat__note muted">Virtual dollars across your paper agents{liveNote}</span>
        </div>
        <div className="dash-stat">
          <span className="stat__label">Running agents</span>
          <span className="dash-stat__value">
            {active.length}{" "}
            <span className="muted" style={{ fontSize: 18, fontWeight: 450 }}>
              of {maxActive}
            </span>
          </span>
          <span className="dash-stat__note muted">{active[0] ? `Newest: ${active[0].name}` : "Run up to 5 agents at once"}</span>
        </div>
        <div className="dash-stat">
          <span className="stat__label">All time return{liveCount ? " (paper)" : ""}</span>
          <span className={`dash-stat__value ${tone(totalReturn)}`}>{percent(totalReturn)}</span>
          <span className="dash-stat__note muted">
            {agents.length} {agents.length === 1 ? "agent" : "agents"} built
          </span>
        </div>
      </div>
      )}

      <div className="dash-layout">
        <div className="stack">
          <div className="card-head" style={{ margin: "var(--space-200) 0 0" }}>
            <h2 className="card__title">Your agents</h2>
            <Link className="eyebrow" href="/leaderboard" style={{ textDecoration: "none" }}>
              See the leaderboard
              <i className="ph ph-arrow-right" />
            </Link>
          </div>
          <div className="agent-list">
            <div className="agent-cards">
              {agents.map(agentCard)}
              <Link className="agent-card agent-card--new" href="/studio">
                <img src="/img/icons/agent.png" alt="" width={64} height={64} />
                <h3 className="card__title">{agents.length ? "Build another agent" : "Build your first agent"}</h3>
                <p className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
                  Replay 30 days of real prices before you launch.
                </p>
              </Link>
            </div>
            {moreCount > 0 && (
              <details className="agent-more">
                <summary className="button button--ghost">
                  Show {moreCount} more {moreCount === 1 ? "agent" : "agents"}
                  <i className="ph ph-caret-down" aria-hidden="true" />
                </summary>
              </details>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2 className="card__title">Latest decisions</h2>
              {latest && (
                <Link className="eyebrow" href={`/agents/${latest.agentId}`} style={{ textDecoration: "none" }}>
                  {latest.agentName}
                  <i className="ph ph-arrow-right" />
                </Link>
              )}
            </div>
            {latest ? (
              <div className="stack stack--tight">
                <span className="log-run__time">{dateAt(latest.ts)}</span>
                {latest.decisions.map((decision, i) => (
                  <DecisionRow key={i} symbol={decision.symbol} action={decision.action} reasoning={decision.reasoning} />
                ))}
              </div>
            ) : (
              <div className="empty empty--inline">
                <img src="/img/icons/backtest.png" alt="" width={40} height={40} />
                <p>{active.length ? "Your agents make their first decision at the top of the hour." : "Launch an agent and its reasoning shows up here every hour."}</p>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card stack stack--tight">
            <div className="card-head" style={{ margin: 0 }}>
              <h2 className="card__title">Top agents</h2>
              <img src="/img/icons/leaderboard.png" alt="" width={36} height={36} />
            </div>
            {top.map((agent, i) => (
              <Link key={agent.id} className="mini-row" href={`/agents/${agent.id}`}>
                <span className="rank">{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{agent.name}</strong>
                  <span className="muted" style={{ display: "block", fontSize: 12, lineHeight: "16px" }}>
                    {marketList(agent.tokens.map((token) => token.symbol))}
                  </span>
                </span>
                <span className={tone(agent.returnPct)} style={{ fontWeight: 500 }}>
                  {percent(agent.returnPct)}
                </span>
              </Link>
            ))}
          </div>

          {/* The full account, membership, credits and API keys live on /settings. */}
          <Link className="card account-summary" href="/settings">
            <span className="avatar" aria-hidden="true">
              {address.slice(2, 3).toUpperCase()}
            </span>
            <span className="account-summary__text">
              <strong className="mono">{shortAddress(address)}</strong>
              <span className="muted">
                {TIERS[tier].label} plan · {formatCredits(credits.freeUsd + credits.paidUsd)} AI credits
              </span>
            </span>
            <span className="account-summary__manage">
              Settings
              <i className="ph ph-arrow-right" aria-hidden="true" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
