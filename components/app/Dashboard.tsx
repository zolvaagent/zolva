import Link from "next/link";

import { DecisionRow } from "@/components/app/AgentView";
import { LoginPrompt } from "@/components/app/LoginPrompt";
import { WalletExport } from "@/components/app/WalletExport";
import type { AgentSummary } from "@/lib/data/agents";
import type { Decision } from "@/lib/engine/engine";
import { dateAt, percent, shortAddress, sparkline, STRATEGY_NAMES, tone, usd } from "@/lib/format";
import { formatCredits } from "@/lib/ai/models";
import { EXPLORER_URL } from "@/lib/chain";
import { X_HANDLE, X_URL } from "@/lib/social";

const MAX_ACTIVE = 5;

type Props = {
  /** AI co-pilot credits, USD. */
  credits: { freeUsd: number; paidUsd: number };
  address: string;
  agents: AgentSummary[];
  curves: Record<string, number[]>;
  latest: { agentName: string; agentId: string; ts: number; decisions: (Decision & { symbol: string })[] } | null;
  top: AgentSummary[];
  /** How this browser logged in (display only); "privy" means an email or Google account with a Privy wallet. */
  loginMethod: "privy" | "wallet" | null;
  /** Zolva has a live trading signer on this wallet. */
  liveSigner: boolean;
};

function greeting() {
  const hour = new Date().getUTCHours();
  return hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function Dashboard({ address, agents, curves, latest, top, credits, loginMethod, liveSigner }: Props) {
  const active = agents.filter((agent) => agent.status === "active");
  const totalStart = agents.reduce((sum, agent) => sum + agent.startCapital, 0);
  const totalNow = agents.reduce((sum, agent) => sum + agent.equity, 0);
  const totalReturn = totalStart ? (totalNow / totalStart - 1) * 100 : 0;

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

      <div className="dash-stats">
        <div className="dash-stat dash-stat--accent">
          <span className="stat__label">Paper balance</span>
          <span className="dash-stat__value">{usd(totalNow || 0)}</span>
          <span className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
            Virtual dollars across your agents
          </span>
        </div>
        <div className="dash-stat">
          <span className="stat__label">Running agents</span>
          <span className="dash-stat__value">
            {active.length}{" "}
            <span className="muted" style={{ fontSize: 18, fontWeight: 450 }}>
              of {MAX_ACTIVE}
            </span>
          </span>
          <span className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
            {active[0] ? `Newest: ${active[0].name}` : "Run up to 5 agents at once"}
          </span>
        </div>
        <div className="dash-stat">
          <span className="stat__label">All time return</span>
          <span className={`dash-stat__value ${tone(totalReturn)}`}>{percent(totalReturn)}</span>
          <span className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
            {agents.length} {agents.length === 1 ? "agent" : "agents"} built
          </span>
        </div>
      </div>

      <div className="dash-layout">
        <div className="stack">
          <div className="card-head" style={{ margin: "var(--space-200) 0 0" }}>
            <h2 className="card__title">Your agents</h2>
            <Link className="eyebrow" href="/leaderboard" style={{ textDecoration: "none" }}>
              See the leaderboard
              <i className="ph ph-arrow-right" />
            </Link>
          </div>
          <div className="agent-cards">
            {agents.map((agent) => {
              const curve = curves[agent.id] ?? [];
              return (
                <Link key={agent.id} className="agent-card" href={`/agents/${agent.id}`}>
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
                      <span className="pill">
                        <i className={`ph ${agent.published ? "ph-globe-simple" : "ph-lock-simple"}`} aria-hidden="true" />
                        {agent.published ? "On leaderboard" : "Private"}
                      </span>
                    </span>
                  </div>
                  <div>
                    <h3 className="card__title">{agent.name}</h3>
                    <p className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
                      {STRATEGY_NAMES[agent.strategy]} · {agent.tokens.map((token) => token.symbol).join(", ")}
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
            })}
            <Link className="agent-card agent-card--new" href="/studio">
              <img src="/img/icons/agent.png" alt="" width={64} height={64} />
              <h3 className="card__title">{agents.length ? "Build another agent" : "Build your first agent"}</h3>
              <p className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
                Replay 30 days of real prices before you launch.
              </p>
            </Link>
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
              <div className="empty">
                <img src="/img/icons/backtest.png" alt="" width={64} height={64} />
                <p>{active.length ? "Your agents make their first decision at the top of the hour." : "Launch an agent and its reasoning shows up here every hour."}</p>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card stack stack--tight">
            <h2 className="card__title">Account</h2>
            <div className="account" style={{ padding: 0 }}>
              <span className="avatar" aria-hidden="true">
                {address.slice(2, 3).toUpperCase()}
              </span>
              <span className="account__text">
                <strong className="mono">{shortAddress(address)}</strong>
                <span>{loginMethod === "privy" ? "Email or Google login" : loginMethod === "wallet" ? "Wallet login" : "Signed in"}</span>
              </span>
            </div>
            <div className="wallet-box">
              <div className="growth__row" style={{ border: 0, padding: 0 }}>
                <span className="muted">{loginMethod === "privy" ? "Your Zolva wallet" : "Connected wallet"}</span>
                <span className="pill pill--accent">Robinhood Chain</span>
              </div>
              <a className="wallet-box__address mono" href={`${EXPLORER_URL}/address/${address}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                {shortAddress(address)}
                <i className="ph ph-arrow-square-out" />
              </a>
              <p className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
                {loginMethod === "privy"
                  ? "Created for you when you logged in. It is yours: export its private key to use it in any wallet app."
                  : "Paper trading needs no funds. Your wallet is only used to sign in."}
              </p>
              {loginMethod === "privy" && <WalletExport address={address} liveSigner={liveSigner} />}
            </div>
            <LoginPrompt mode="logout" />
          </div>

          <a className="card follow-card" href={X_URL} target="_blank" rel="noopener noreferrer">
            <span className="follow-card__icon" aria-hidden="true">
              <i className="ph ph-x-logo" />
            </span>
            <span className="follow-card__text">
              <strong>Follow @{X_HANDLE}</strong>
              <span className="muted">New features, live agent results and what is coming next.</span>
            </span>
            <i className="ph ph-arrow-up-right muted" aria-hidden="true" />
          </a>

          <div className="card stack stack--tight">
            <div className="card-head" style={{ margin: 0 }}>
              <h2 className="card__title">AI credits</h2>
              <i className="ph ph-sparkle" style={{ color: "var(--color-purple-rich)", fontSize: 22 }} aria-hidden="true" />
            </div>
            <div className="growth__row" style={{ padding: 0, border: 0 }}>
              <span className="muted">Free (Lite models)</span>
              <strong>{formatCredits(credits.freeUsd)}</strong>
            </div>
            <div className="growth__row" style={{ padding: 0, border: 0 }}>
              <span className="muted">Paid (any model)</span>
              <strong>{formatCredits(credits.paidUsd)}</strong>
            </div>
            <p className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
              Spent only when an agent&apos;s AI co-pilot reviews a trade. If credits run out, agents keep trading on their rules.
            </p>
            <button className="button button--ghost" type="button" disabled>
              Top up <span className="pill pill--accent">Soon</span>
            </button>
          </div>

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
                    {agent.tokens.map((token) => token.symbol).join(", ")}
                  </span>
                </span>
                <span className={tone(agent.returnPct)} style={{ fontWeight: 500 }}>
                  {percent(agent.returnPct)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
