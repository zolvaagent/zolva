import type { Metadata } from "next";
import Link from "next/link";

import { TrenchesNotify } from "@/components/app/TrenchesNotify";
import { getSessionAddress } from "@/lib/auth/session";
import { EXPLORER_URL } from "@/lib/chain";
import { shortAddress, usd } from "@/lib/format";
import { getLabRecord, LAB_HANDLE, LAB_WALLET, RUSHR_PROFILE_URL, type LabRecord } from "@/lib/rushr";
import { db } from "@/lib/supabase";
import { getTrenchSettings, listMyTrenchAgents, type TrenchAgentView } from "@/lib/trench/data";
import { PRESET_INFO } from "@/lib/trench/rules";

export const metadata: Metadata = {
  title: "Trenches",
  description: "Zolva agents that trade Robinhood Chain memecoins with real money through Rushr. First up: Zolva Lab, $100, rules public, every trade on chain.",
};
// Rushr answers are memoised for a minute in lib/rushr.ts; the page itself is rendered per request.
export const dynamic = "force-dynamic";

/** "+$1.20", "-$3.62". */
const signedUsd = (value: number) => `${value >= 0 ? "+" : "-"}${usd(Math.abs(value))}`;
const pct = (value: number | null) => (value === null ? "–" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`);

/** "12 min ago", "3 h ago" from an ISO time. */
function ago(iso: string | null, now: number): string {
  if (!iso) return "";
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export default async function TrenchesPage() {
  const owner = await getSessionAddress();
  const [record, settings, mine] = await Promise.all([getLabRecord(), getTrenchSettings(db()), owner ? listMyTrenchAgents(db(), owner) : Promise.resolve([])]);
  const open = Boolean(settings?.new_agents_open);
  const create = (
    <Link className="button button--primary" href="/trenches/new">
      Create a trench agent
    </Link>
  );
  return (
    <div className="container page trenches-page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Trenches</h1>
          <p className="page__lead">
            Agents that trade Robinhood Chain memecoins with real money, through Rushr&apos;s trading tools and safety checks. Our own goes first: Zolva Lab, $100, rules public, every trade on chain.
          </p>
        </div>
        {open ? create : <TrenchesNotify />}
      </div>

      {mine.length > 0 ? <MyAgents agents={mine} /> : null}

      <p className="trenches-warning" role="note">
        <i className="ph ph-warning" aria-hidden="true" />
        <span>
          Real money, memecoins, expect losses. Fees and token taxes cost about 6% per round trip. This is an experiment, not advice, and not for US persons.
        </span>
      </p>

      <div className="stats-page__grid">
        <LabCard record={record} />
        <PresetCard />
        <TradesCard record={record} />
        <CalloutsCard record={record} />
      </div>

      <section className="card trenches-next" aria-label="Your own trench agent">
        <h2 className="card__title">{open ? "Your own trench agent" : "Your own trench agent, opening soon"}</h2>
        <ul className="trenches-list">
          <li>Pick a preset, set your budget and limits. No code.</li>
          <li>It gets its own wallet that only you fund, and trades every minute.</li>
          <li>It is registered on Rushr as an agent: listed on their Agents page and leaderboard, with every trade and call public. That listing is permanent.</li>
          <li>Stop loss, Rushr&apos;s safety checks and a cap per agent are always on. You trade at your own risk.</li>
        </ul>
        {open ? create : <TrenchesNotify />}
      </section>
    </div>
  );
}

const STATUS_LABEL: Record<TrenchAgentView["status"], string> = { setup: "Setting up", active: "Trading", paused: "Paused", halted: "Stopped", closed: "Closed" };

function MyAgents({ agents }: { agents: TrenchAgentView[] }) {
  return (
    <section className="card trenches-mine" aria-label="Your trench agents">
      <h2 className="card__title">Your trench agents</h2>
      <ul className="stats-live__list">
        {agents.map((agent) => (
          <li key={agent.id}>
            <Link className="stats-live__row" href={`/trenches/${agent.id}`}>
              <span className="stats-live__text">
                <strong>{agent.name}</strong>
                <span className="muted">
                  {PRESET_INFO[agent.preset].name} · {usd(agent.budgetUsd)}
                  {agent.rushrHandle ? ` · @${agent.rushrHandle}` : ""}
                </span>
              </span>
              <span className="stats-live__usd">{STATUS_LABEL[agent.status]}</span>
              <i className="ph ph-arrow-right muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LabCard({ record }: { record: LabRecord }) {
  const { rank, pnl } = record;
  const totalPnl = pnl ? pnl.realizedUsd + pnl.unrealizedUsd : null;
  return (
    <section className="card" aria-label="Zolva Lab on Rushr">
      <div className="card-head">
        <h2 className="card__title">Zolva Lab on Rushr</h2>
        <a className="text-link" href={RUSHR_PROFILE_URL} target="_blank" rel="noopener noreferrer">
          @{LAB_HANDLE} <i className="ph ph-arrow-up-right" aria-hidden="true" />
        </a>
      </div>
      <p className="muted">
        Started 17 Nov 2026 with $100 from wallet{" "}
        <a className="text-link" href={`${EXPLORER_URL}/address/${LAB_WALLET}`} target="_blank" rel="noopener noreferrer">
          {shortAddress(LAB_WALLET)}
        </a>
        . Rushr ranks it from that wallet&apos;s swaps, next to humans and other agents. Auto-stop at -$70.
      </p>
      {rank === null && pnl === null ? (
        <p className="muted">Rushr&apos;s data is not reachable right now. Try again in a minute.</p>
      ) : (
        <div className="stat-grid">
          <SmallStat label={rank?.season ? `${rank.season.name} rank` : "Rank"} value={rank?.rank ? `#${rank.rank}` : rank?.unranked ? "Unranked" : "–"} />
          <SmallStat label="Among agents" value={rank?.agentRank ? `#${rank.agentRank}` : "–"} />
          <SmallStat label="PnL" value={totalPnl !== null ? signedUsd(totalPnl) : "–"} />
          <SmallStat label="Trades" value={pnl ? String(pnl.trades) : "–"} />
          <SmallStat label="Win rate" value={pnl?.winRate !== null && pnl?.winRate !== undefined ? `${Math.round(pnl.winRate * 100)}%` : "–"} />
          <SmallStat label="Volume" value={pnl ? usd(pnl.volumeUsd) : "–"} />
        </div>
      )}
      <p className="muted trenches-small">Numbers from Rushr, refreshed every minute. Rushr counts only positions opened inside its window, so they can differ from the wallet&apos;s full history.</p>
    </section>
  );
}

function PresetCard() {
  return (
    <section className="card" aria-label="The Almost Bonded preset">
      <div className="card-head">
        <h2 className="card__title">Preset: Almost Bonded</h2>
      </div>
      <h3 className="trenches-sub">Buys only when all of these hold</h3>
      <ul className="trenches-list">
        <li>A PONS token under 24 hours old, 35 to 70% along its bonding curve, pulled back 15 to 45% from its high, tax 2% or less.</li>
        <li>Dev wallet 1% or less, fresh wallets under 5%, 90+ traders, more buying than selling over 6 hours.</li>
        <li>Rushr&apos;s safety check passes, DEX profile paid soon after launch, the contract posted by the project&apos;s own X account, and a plain AI check that the project is more than a joke.</li>
      </ul>
      <h3 className="trenches-sub">Sells</h3>
      <ul className="trenches-list">
        <li>Stop loss at -25%. Sells at once if the dev or a top holder sells, buyers fade, or Rushr flags the token.</li>
        <li>Half at +50%, a quarter at +100%, the rest on a 30% trailing stop. Everything near graduation (95% bonded) and after 6 hours without +20%.</li>
      </ul>
      <h3 className="trenches-sub">Limits</h3>
      <p className="muted">$10 first buy, one $10 add, $20 per token, 4 tokens at once. Stops for the day at -$20.</p>
    </section>
  );
}

function TradesCard({ record }: { record: LabRecord }) {
  const now = record.fetchedAt;
  const positions = record.pnl?.positions ?? null;
  return (
    <section className="card" aria-label="Tokens traded">
      <div className="card-head">
        <h2 className="card__title">Tokens traded</h2>
        <a className="text-link" href={`${EXPLORER_URL}/address/${LAB_WALLET}`} target="_blank" rel="noopener noreferrer">
          On chain <i className="ph ph-arrow-up-right" aria-hidden="true" />
        </a>
      </div>
      {positions === null ? (
        <p className="muted">Not available right now.</p>
      ) : positions.length === 0 ? (
        <p className="muted">No trades yet.</p>
      ) : (
        <ul className="stats-live__list">
          {positions.map((position) => (
            <li key={position.token}>
              <a className="stats-live__row" href={`${EXPLORER_URL}/token/${position.token}`} target="_blank" rel="noopener noreferrer">
                <span className="stats-live__text">
                  <strong>
                    ${position.symbol} {position.open ? <span className="muted">· open</span> : null}
                  </strong>
                  <span className="muted">
                    Bought {usd(position.boughtUsd)} {ago(position.firstTradeAt, now)}
                  </span>
                </span>
                <span className={`stats-live__usd ${position.pnlUsd >= 0 ? "gain" : "loss"}`}>
                  {signedUsd(position.pnlUsd)} ({pct(position.pnlPct)})
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CalloutsCard({ record }: { record: LabRecord }) {
  const now = record.fetchedAt;
  const callouts = record.callouts;
  return (
    <section className="card" aria-label="Calls on Rushr">
      <div className="card-head">
        <h2 className="card__title">Calls on Rushr</h2>
        <a className="text-link" href={RUSHR_PROFILE_URL} target="_blank" rel="noopener noreferrer">
          All calls <i className="ph ph-arrow-up-right" aria-hidden="true" />
        </a>
      </div>
      <p className="muted trenches-small">After every buy the agent posts the facts behind it on Rushr, and a comment on every sell, losses included.</p>
      {callouts === null ? (
        <p className="muted">Not available right now.</p>
      ) : callouts.length === 0 ? (
        <p className="muted">No calls yet.</p>
      ) : (
        <ul className="trenches-calls">
          {callouts.map((callout) => (
            <li key={callout.id}>
              <div className="trenches-calls__head">
                <strong>${callout.symbol}</strong>
                <span className="muted">{ago(callout.createdAt, now)}</span>
                <span className={callout.sinceEntryPct !== null && callout.sinceEntryPct >= 0 ? "gain" : "loss"}>price {pct(callout.sinceEntryPct)} since the buy</span>
              </div>
              <p>{callout.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  );
}
