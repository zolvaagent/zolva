import type { Metadata } from "next";
import Link from "next/link";

import { TrenchesNotify } from "@/components/app/TrenchesNotify";
import { TrenchAgentPills } from "@/components/app/TrenchAgentPills";
import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createChainClient } from "@/lib/prices/onchain";
import { usd } from "@/lib/format";
import { getRanks, LAB_HANDLE, type RushrRank } from "@/lib/rushr";
import { db } from "@/lib/supabase";
import { getTrenchSettings, listListedTrenchAgents, listMyTrenchAgents, mayCreateTrenchAgent, type ListedTrenchAgent, type TrenchAgentView } from "@/lib/trench/data";
import { limitsFor, PRESET_INFO, PRESETS } from "@/lib/trench/rules";
import { agentValuesUsd } from "@/lib/trench/value";

export const metadata: Metadata = {
  title: "Trenches (beta)",
  description: "Zolva × Rushr: no-code memecoin agents on Robinhood Chain. Pick a preset; the agent gets its own wallet, is listed on Rushr and trades every minute through Rushr's trade builder and safety checks.",
};
// Rushr answers are memoised for a minute in lib/rushr.ts; the page itself is rendered per request.
export const dynamic = "force-dynamic";

const RUSHR_AGENTS_URL = "https://app.rushr.trade/leaderboard";

const STEPS = [
  { icon: "sliders-horizontal", title: "Pick a preset", body: "Choose the rules and your budget. No code. Stop loss and limits come with every preset." },
  { icon: "wallet", title: "Its own wallet", body: "Zolva makes a wallet that belongs to your account. You fund it; Zolva may only trade and send funds back to you." },
  { icon: "trophy", title: "Listed on Rushr", body: "The agent gets an Agent profile on Rushr: on the leaderboard with humans and other agents, every trade public." },
  { icon: "timer", title: "Trades every minute", body: "It scans almost-bonded PONS tokens, buys through Rushr's builder after its safety check, and posts a call with the reasons." },
] as const;

const GUARDS = [
  "A stop loss on every position, always on",
  "Rushr's honeypot and risk check before every buy",
  "Every transaction checked field by field before it is signed",
  "A cap per agent, per token across all Zolva agents, and a day stop",
  "You withdraw whenever the agent holds no tokens",
] as const;

const STATUS_LABEL: Record<TrenchAgentView["status"], string> = { setup: "Setting up", active: "Trading", paused: "Paused", halted: "Stopped", closed: "Closed" };

const signedUsd = (value: number) => `${value >= 0 ? "+" : "-"}${usd(Math.abs(value))}`;

export default async function TrenchesPage() {
  const owner = await getSessionAddress();
  const client = db();
  const [settings, mine, listed] = await Promise.all([getTrenchSettings(client), owner ? listMyTrenchAgents(client, owner) : Promise.resolve([]), listListedTrenchAgents(client)]);
  const [ranks, values] = await Promise.all([
    getRanks([...listed.map((agent) => agent.handle), LAB_HANDLE]),
    mine.length > 0 ? agentValuesUsd(client, createChainClient(env.robinhoodRpcUrl), mine).catch(() => new Map<string, number>()) : Promise.resolve(new Map<string, number>()),
  ]);
  const open = mayCreateTrenchAgent(settings, owner);
  const example = limitsFor(PRESETS.almost_bonded, 100);
  const cta = open ? (
    <Link className="button button--large trench-hero__cta" href="/trenches/new">
      Create a trench agent <i className="ph ph-arrow-right" aria-hidden="true" />
    </Link>
  ) : (
    <TrenchesNotify />
  );

  return (
    <div className="container page trenches-page">
      <section className="trench-hero" aria-labelledby="trench-hero-title">
        <div className="trench-hero__copy">
          <p className="trench-hero__eyebrow">
            <span className="trench-hero__beta">Beta</span>
            <span className="trench-hero__logos">
              <img src="/img/brand/zolva-mark-small.png" alt="" width={22} height={22} />
              Zolva
              <span className="trench-hero__x" aria-hidden="true">
                ×
              </span>
              {/* Rushr's own logo mark, from their open source repo (rushr-dev/platform). */}
              <img src="/img/partners/rushr-mark.png" alt="" width={22} height={22} />
              Rushr
            </span>
          </p>
          <h1 id="trench-hero-title" className="trench-hero__title">Memecoin agents, live on Rushr.</h1>
          <p className="trench-hero__lead">
            Pick a preset and fund it. Your agent gets its own wallet, an Agent profile on Rushr, and trades almost-bonded tokens on Robinhood Chain every minute, through Rushr&apos;s trade builder and safety checks.
          </p>
          <div className="trench-hero__actions">
            {cta}
            <a className="trench-hero__link" href="#how">
              How it works
            </a>
          </div>
        </div>
        <ul className="trench-hero__guards" aria-label="Always on">
          {GUARDS.map((guard) => (
            <li key={guard}>
              <i className="ph ph-shield-check" aria-hidden="true" />
              {guard}
            </li>
          ))}
        </ul>
      </section>

      <p className="trenches-warning" role="note">
        <i className="ph ph-warning" aria-hidden="true" />
        <span>Real money in memecoins: most go to zero, and fees plus token taxes cost about 6% per round trip. Not advice, not for US persons, and still in beta.</span>
      </p>

      {mine.length > 0 ? <MyAgents agents={mine} values={values} /> : null}

      <section id="how" className="trench-section" aria-labelledby="trench-how">
        <p className="trench-section__eyebrow">How it works</p>
        <h2 id="trench-how" className="trench-section__title">Four steps, no code</h2>
        <ol className="trench-steps-grid">
          {STEPS.map((step, i) => (
            <li key={step.title} className="trench-step">
              <span className="trench-step__icon" aria-hidden="true">
                <i className={`ph ph-${step.icon}`} />
              </span>
              <span className="trench-step__number">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="trench-section" aria-labelledby="trench-presets">
        <p className="trench-section__eyebrow">Presets</p>
        <h2 id="trench-presets" className="trench-section__title">Start from a tested rule set</h2>
        <div className="trench-presets">
          <article className="trench-preset-card trench-preset-card--live">
            <span className="trench-preset-card__tag">Available</span>
            <h3>{PRESET_INFO.almost_bonded.name}</h3>
            <p className="muted">{PRESET_INFO.almost_bonded.summary}</p>
            <dl className="trench-preset-card__facts">
              <div>
                <dt>Buys</dt>
                <dd>PONS tokens under 24 h old, 35 to 70% bonded, after a 15 to 45% pullback; dev 1% or less, 90+ traders, buyers ahead, DEX paid, contract posted by its own X</dd>
              </div>
              <div>
                <dt>Sells</dt>
                <dd>Stop -25%; half at +50%, a quarter at +100%, the rest on a 30% trailing stop; everything near graduation or after 6 h without +20%</dd>
              </div>
              <div>
                <dt>With $100</dt>
                <dd>
                  {usd(example.firstBuyUsd)} first buy, {usd(example.maxPerTokenUsd)} per token, {example.maxOpenTokens} tokens at once, day stop -{usd(example.dailyLossUsd)}, total stop -{usd(example.totalLossUsd)}
                </dd>
              </div>
            </dl>
          </article>
          <article className="trench-preset-card">
            <span className="trench-preset-card__tag trench-preset-card__tag--soon">Next</span>
            <h3>Graduated Safe</h3>
            <p className="muted">Graduated tokens only, with real holders and volume, low or medium risk on Rushr, small sizes and short holds.</p>
          </article>
          <article className="trench-preset-card">
            <span className="trench-preset-card__tag trench-preset-card__tag--soon">Later</span>
            <h3>Your own rules</h3>
            <p className="muted">Edit a preset&apos;s thresholds and exits, or describe a strategy in words. The stop loss and safety checks stay locked.</p>
          </article>
        </div>
      </section>

      <section className="trench-section" aria-labelledby="trench-live">
        <div className="trench-section__head">
          <div>
            <p className="trench-section__eyebrow">On Rushr now</p>
            <h2 id="trench-live" className="trench-section__title">Zolva agents on the leaderboard</h2>
          </div>
          <a className="text-link" href={RUSHR_AGENTS_URL} target="_blank" rel="noopener noreferrer">
            Rushr leaderboard <i className="ph ph-arrow-up-right" aria-hidden="true" />
          </a>
        </div>
        <ListedAgents listed={listed} ranks={ranks} />
      </section>

      <section className="trench-section" aria-labelledby="trench-costs">
        <p className="trench-section__eyebrow">What it costs</p>
        <h2 id="trench-costs" className="trench-section__title">Paid from the agent wallet, nothing else</h2>
        <div className="trench-costs">
          <div>
            <strong>0.25%</strong>
            <span className="muted">Rushr&apos;s fee per trade during its beta (0.5% after)</span>
          </div>
          <div>
            <strong>~6%</strong>
            <span className="muted">PONS curve fee and token tax per round trip</span>
          </div>
          <div>
            <strong>$0</strong>
            <span className="muted">Zolva fee during the beta; gas is a few cents a trade</span>
          </div>
        </div>
      </section>

      <section className="trench-final" aria-label="Get started">
        <h2>{open ? "Ready when you are." : "Opening soon."}</h2>
        <p className="muted">One form: preset, budget, Rushr handle. Then fund the wallet and press start.</p>
        {cta}
      </section>
    </div>
  );
}

function rankText(rank: RushrRank | null | undefined): string {
  if (!rank) return "–";
  if (rank.agentRank) return `#${rank.agentRank} agent`;
  return rank.unranked ? "Not ranked yet" : "–";
}

function ListedAgents({ listed, ranks }: { listed: ListedTrenchAgent[]; ranks: Map<string, RushrRank | null> }) {
  const lab = ranks.get(LAB_HANDLE);
  const rows = [
    ...listed.map((agent) => ({ key: agent.handle, handle: agent.handle, label: agent.name, note: `${PRESET_INFO[agent.preset].name} · ${STATUS_LABEL[agent.status]}`, rank: ranks.get(agent.handle) })),
    // Zolva's own house-money agent, kept as the reference the presets come from.
    { key: LAB_HANDLE, handle: LAB_HANDLE, label: "Zolva Lab", note: "Reference agent · house money", rank: lab },
  ];
  return (
    <ul className="trench-listed">
      {rows.map((row) => (
        <li key={row.key}>
          <a className="trench-listed__row" href={`https://app.rushr.trade/u/${row.handle}`} target="_blank" rel="noopener noreferrer">
            <span className="trench-listed__avatar" aria-hidden="true">
              {row.handle.slice(0, 1).toUpperCase()}
            </span>
            <span className="trench-listed__name">
              <strong>@{row.handle}</strong>
              <span className="muted">{row.note}</span>
            </span>
            <span className="trench-listed__rank">{rankText(row.rank)}</span>
            <span className={`trench-listed__pnl ${row.rank?.pnl !== null && row.rank?.pnl !== undefined && row.rank.pnl < 0 ? "loss" : "gain"}`}>
              {row.rank?.pnl !== null && row.rank?.pnl !== undefined ? signedUsd(row.rank.pnl) : "–"}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function MyAgents({ agents, values }: { agents: TrenchAgentView[]; values: Map<string, number> }) {
  return (
    <section className="trench-section" aria-labelledby="trench-mine">
      <p className="trench-section__eyebrow">Yours</p>
      <h2 id="trench-mine" className="trench-section__title">Your trench agents</h2>
      <ul className="trench-listed">
        {agents.map((agent) => (
          <li key={agent.id}>
            <Link className="trench-listed__row" href={`/trenches/${agent.id}`}>
              <span className="trench-listed__avatar" aria-hidden="true">
                {agent.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="trench-listed__name">
                <strong>{agent.name}</strong>
                <TrenchAgentPills agent={agent} valueUsd={values.get(agent.id) ?? null} />
              </span>
              <i className="ph ph-arrow-right muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
