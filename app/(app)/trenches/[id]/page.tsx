import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TrenchAgentPills } from "@/components/app/TrenchAgentPills";
import { TrenchControls } from "@/components/app/TrenchControls";
import { TrenchSetup } from "@/components/app/TrenchSetup";
import { getSessionAddress } from "@/lib/auth/session";
import { EXPLORER_URL } from "@/lib/chain";
import { env } from "@/lib/env";
import { usd } from "@/lib/format";
import { createChainClient } from "@/lib/prices/onchain";
import { db } from "@/lib/supabase";
import { getMyTrenchAgent, getTrenchSettings } from "@/lib/trench/data";
import { MIN_BUDGET_USD } from "@/lib/trench/onboard";
import { PRESET_INFO, PRESETS } from "@/lib/trench/rules";
import { agentValuesUsd } from "@/lib/trench/value";

export const metadata: Metadata = { title: "Trench agent", robots: { index: false } };
export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
/** "07:41" in UTC, for the terminal log. */
const clock = (iso: string) => new Date(iso).toISOString().slice(11, 16);
const signed = (value: number) => `${value >= 0 ? "+" : "-"}${usd(Math.abs(value))}`;

/** Terminal colour per log action. */
const TONE: Record<string, string> = { buy: "gain", add: "gain", sell: "warn", halt: "loss", error: "loss", scan: "dim", hold: "dim", skip: "dim" };

/** One trench agent, for its owner only (everyone else gets a 404). */
export default async function TrenchAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await getSessionAddress();
  if (!owner) notFound();
  const client = db();
  const [data, settings] = await Promise.all([getMyTrenchAgent(client, owner, id), getTrenchSettings(client)]);
  if (!data) notFound();
  const { agent, positions, trades, decisions } = data;
  const values = await agentValuesUsd(client, createChainClient(env.robinhoodRpcUrl), [agent]).catch(() => new Map<string, number>());
  const valueUsd = values.get(agent.id) ?? null;
  const rules = PRESETS[agent.preset];
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const maxCapitalUsd = Number(settings?.max_agent_budget_usd ?? 100);
  const realised = trades.reduce((sum, trade) => sum + (trade.pnlUsd ?? 0), 0);
  const open = positions.filter((position) => position.closedAt === null);
  const started = agent.status !== "setup" ? agent.budgetUsd : null;
  // Newest first; the terminal body is column-reverse, so it reads oldest to newest and stays
  // scrolled to the latest line like a live log.
  const log = decisions;

  return (
    <div className="container page trenches-page">
      <p className="muted trench-agent__back">
        <Link className="text-link" href="/trenches">
          <i className="ph ph-arrow-left" aria-hidden="true" /> Trenches
        </Link>
      </p>
      <header className="trench-agent__head">
        <div>
          <h1 className="page__title">{agent.name}</h1>
          <TrenchAgentPills agent={agent} valueUsd={valueUsd} />
          {agent.haltedReason ? <p className="loss">{agent.haltedReason}</p> : null}
        </div>
        <TrenchControls agentId={agent.id} status={agent.status} setupDone={agent.setupDone} />
      </header>

      <details className="card trench-strategy">
        <summary>
          <span className="trench-strategy__icon" aria-hidden="true">
            <i className="ph ph-path" />
          </span>
          <span className="trench-strategy__text">
            <strong>{PRESET_INFO[agent.preset].name}</strong>
            <span className="muted">
              {pct(rules.sizing.firstBuyShare)} per token · stop -{rules.exit.stopPct}% · up to {rules.sizing.maxOpenTokens} tokens · stops for good at -{pct(rules.sizing.totalLossShare)}
            </span>
          </span>
          <span className="trench-strategy__more">
            Details <i className="ph ph-caret-down" aria-hidden="true" />
          </span>
        </summary>
        <div className="trench-strategy__body">
          <p className="muted">{PRESET_INFO[agent.preset].summary}</p>
          <dl className="trench-preset-card__facts">
            <div>
              <dt>Buys</dt>
              <dd>PONS tokens under 24 h old, 35 to 70% bonded, after a 15 to 45% pullback; dev 1% or less, 90+ traders, buyers ahead, DEX paid, contract posted by its own X, Rushr safety passed</dd>
            </div>
            <div>
              <dt>Sells</dt>
              <dd>Stop -{rules.exit.stopPct}%; half at +50%, a quarter at +100%, the rest on a 30% trailing stop; everything near graduation or after 6 h without +20%; at once if the dev or a top holder sells</dd>
            </div>
            <div>
              <dt>Sizing</dt>
              <dd>
                {pct(rules.sizing.firstBuyShare)} of its money per new token, one add of {pct(rules.sizing.addShare)}, at most {pct(rules.sizing.maxPerTokenShare)} in one token. Day stop after -{pct(rules.sizing.dailyLossShare)}.
              </dd>
            </div>
            <div>
              <dt>Money</dt>
              <dd>What the wallet holds when you press Start, up to {usd(maxCapitalUsd)}; anything above stays in the wallet.</dd>
            </div>
          </dl>
        </div>
      </details>

      <div className="stats-page__grid">
        <section className="card" aria-label="Numbers">
          <h2 className="card__title">So far</h2>
          <div className="stat-grid">
            <Stat label="Started with" value={started !== null ? usd(started) : "–"} />
            <Stat label="Worth now" value={valueUsd !== null ? usd(valueUsd) : "–"} tone={started !== null && valueUsd !== null ? (valueUsd >= started ? "gain" : "loss") : undefined} />
            <Stat label="Realised P&L" value={signed(realised)} />
            <Stat label="Open tokens" value={`${open.length} of ${rules.sizing.maxOpenTokens}`} />
          </div>
          <p className="muted trenches-small">Worth now is the wallet&apos;s ETH plus open tokens at their on-chain sell price. {trades.length} trades so far.</p>
        </section>

        <TrenchSetup agent={{ id: agent.id, name: agent.name, status: agent.status, walletAddress: agent.walletAddress, onRushr: agent.onRushr, setupDone: agent.setupDone, rushrHandle: agent.rushrHandle }} minCapitalUsd={MIN_BUDGET_USD} maxCapitalUsd={maxCapitalUsd} />
      </div>

      <section className="trench-terminal" aria-label="Decision log">
        <div className="trench-terminal__bar">
          <span className="trench-terminal__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>decision log · @{agent.rushrHandle ?? "agent"} · every minute, UTC</span>
        </div>
        <div className="trench-terminal__body" tabIndex={0}>
          {log.length === 0 ? (
            <p className="trench-terminal__line trench-terminal__line--dim">$ waiting for the first minute…</p>
          ) : (
            log.map((line, i) => (
              <p key={`${line.ts}-${i}`} className={`trench-terminal__line trench-terminal__line--${TONE[line.action] ?? "plain"}`}>
                <span className="trench-terminal__time">{clock(line.ts)}</span>
                <span className="trench-terminal__action">{line.action.padEnd(5, " ")}</span>
                {line.symbol ? <span className="trench-terminal__symbol">${line.symbol}</span> : null}
                <span>{line.reason}</span>
              </p>
            ))
          )}
        </div>
      </section>

      <section className="card trench-trades" aria-label="Trades">
        <h2 className="card__title">Trades</h2>
        {trades.length === 0 ? (
          <p className="muted">No trades yet. Every buy and sell shows here with its reason and a link to the transaction.</p>
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
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={`stat__value${tone ? ` ${tone}` : ""}`}>{value}</span>
    </div>
  );
}
