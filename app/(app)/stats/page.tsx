import type { Metadata } from "next";
import Link from "next/link";

import { TickerAvatar } from "@/components/ui/TickerAvatar";
import { Odometer } from "@/components/ui/Words";
import { EXPLORER_URL, LIVE_PROOF_HREF, LIVE_TRADING_WALLET } from "@/lib/chain";
import { getPublicStats, STATS_DAYS } from "@/lib/data/stats";
import { dayAt, shortAddress, STRATEGY_NAMES, usd } from "@/lib/format";
import { db } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Stats",
  description: "Everything Zolva's trading agents have done since launch: decisions, trades, real money on chain and the data behind them.",
};
export const dynamic = "force-dynamic";

const whole = (value: number) => Math.round(value).toLocaleString("en-US");

/** $1.35M, $482K: compact dollars for the headline numbers. */
const compactUsd = (value: number) => `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)}`;

/** "12 min ago", "3 h ago" from unix seconds. */
function ago(ts: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - ts) / 60));
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} days ago`;
}

export default async function StatsPage() {
  const stats = await getPublicStats(db());
  const { totals } = stats;
  const now = stats.builtAt;

  // Uptime: hours the engine ran out of every hour since its first run (both ends included).
  const hoursSinceStart = totals.firstRun !== null && totals.lastTick !== null ? Math.floor((totals.lastTick - totals.firstRun) / 3600) + 1 : 0;
  const uptime = hoursSinceStart > 0 ? Math.min(100, (totals.engineHours / hoursSinceStart) * 100) : null;
  const priceDays = totals.firstCandle !== null ? Math.floor((now - totals.firstCandle) / 86_400) : 0;

  const busiestDay = Math.max(1, ...stats.daily.map((day) => day.decisions));
  const topTrades = Math.max(1, ...stats.topTokens.map((token) => token.trades));
  const strategyAgents = stats.strategies.reduce((sum, row) => sum + row.agents, 0) || 1;

  return (
    <div className="container page stats-page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Stats</h1>
          <p className="page__lead">
            Everything Zolva&apos;s agents have done since {totals.firstRun !== null ? dayAt(totals.firstRun) : "launch"}, counted straight from the database every time this page loads.
          </p>
        </div>
        <Link className="button button--primary" href="/studio">
          Build your agent
        </Link>
      </div>

      <section className="stats-band stats-page__band" aria-label="Zolva in numbers">
        <BigStat label="Trading decisions, each explained" value={whole(totals.decisions)} />
        <BigStat label="Hours of autonomous trading" value={whole(totals.agentHours)} />
        <BigStat label="Simulated volume traded" value={compactUsd(totals.paperVolume)} />
        <BigStat label="Real money trades on chain" value={whole(totals.liveTrades)} />
      </section>

      <div className="stats-page__grid">
        <section className="card stats-live" aria-label="Real money proof">
          <div className="card-head">
            <h2 className="card__title">Real money, on chain</h2>
            <span className="stats-live__pulse">
              <span className="stats-live__dot" aria-hidden="true" />
              {totals.lastTick !== null ? `Last tick ${ago(totals.lastTick, now)}` : "Waiting for the first tick"}
            </span>
          </div>
          <p className="muted stats-live__lead">
            Zolva&apos;s own agent trades real USDG from wallet{" "}
            <a className="text-link" href={`${EXPLORER_URL}/address/${LIVE_TRADING_WALLET}`} target="_blank" rel="noopener noreferrer">
              {shortAddress(LIVE_TRADING_WALLET)}
            </a>
            . Every trade below is a transaction anyone can open.
          </p>
          {stats.live.length === 0 ? (
            <p className="muted">No confirmed real money trades yet.</p>
          ) : (
            <ul className="stats-live__list">
              {stats.live.map((trade) => (
                <li key={trade.txHash}>
                  <a className="stats-live__row" href={`${EXPLORER_URL}/tx/${trade.txHash}`} target="_blank" rel="noopener noreferrer">
                    <TickerAvatar symbol={trade.symbol} size={28} />
                    <span className="stats-live__text">
                      <strong>
                        {trade.side === "sell" ? "Sold" : "Bought"} {trade.symbol}
                      </strong>
                      <span className="muted">{ago(trade.ts, now)}</span>
                    </span>
                    <span className="stats-live__usd">{trade.usd !== null ? usd(trade.usd) : "–"}</span>
                    <i className="ph ph-arrow-up-right muted" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <Link className="text-link" href={LIVE_PROOF_HREF}>
            See the live agent <i className="ph ph-arrow-right" aria-hidden="true" />
          </Link>
        </section>

        <section className="card stats-activity" aria-label="Decisions per day">
          <div className="card-head">
            <h2 className="card__title">Decisions per day</h2>
            <span className="muted stats-activity__range">Last {Math.min(STATS_DAYS, stats.daily.length)} days</span>
          </div>
          <div className="stats-bars" role="img" aria-label={`Daily decisions over the last ${stats.daily.length} days, peaking at ${whole(busiestDay)}`}>
            {stats.daily.map((day, i) => (
              <span
                key={day.ts}
                className={`stats-bars__bar${i === stats.daily.length - 1 ? " stats-bars__bar--today" : ""}`}
                style={{ height: `${Math.max(4, (day.decisions / busiestDay) * 100)}%` }}
                title={`${dayAt(day.ts)}: ${whole(day.decisions)} decisions, ${whole(day.trades)} trades`}
              />
            ))}
          </div>
          <div className="stats-bars__axis muted">
            <span>{stats.daily.length > 0 ? dayAt(stats.daily[0].ts) : ""}</span>
            <span>Today, so far</span>
          </div>
          <div className="stat-grid stats-activity__grid">
            <SmallStat label="Agents running" value={whole(totals.agentsActive)} />
            <SmallStat label="Paper trades" value={whole(totals.paperTrades)} />
            <SmallStat label="Engine uptime" value={uptime !== null ? `${uptime.toFixed(1)}%` : "–"} />
            <SmallStat label="Hours ticked" value={whole(totals.engineHours)} />
          </div>
        </section>

        <section className="card" aria-label="Most traded markets">
          <div className="card-head">
            <h2 className="card__title">Most traded markets</h2>
            <Link className="text-link" href="/markets">
              All {totals.markets} markets <i className="ph ph-arrow-right" aria-hidden="true" />
            </Link>
          </div>
          <ul className="stats-ranks">
            {stats.topTokens.map((token) => (
              <li key={token.symbol}>
                <Link className="stats-ranks__row" href={`/markets/${token.symbol}`}>
                  <TickerAvatar symbol={token.symbol} size={28} />
                  <strong>{token.symbol}</strong>
                  <span className="stats-ranks__track" aria-hidden="true">
                    <span style={{ width: `${(token.trades / topTrades) * 100}%` }} />
                  </span>
                  <span className="stats-ranks__value">{whole(token.trades)} trades</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-label="Strategies running">
          <div className="card-head">
            <h2 className="card__title">Strategies running</h2>
            <Link className="text-link" href="/agents">
              Browse agents <i className="ph ph-arrow-right" aria-hidden="true" />
            </Link>
          </div>
          <ul className="stats-ranks">
            {stats.strategies.map((row) => (
              <li key={row.strategy} className="stats-ranks__row">
                <strong className="stats-ranks__name">{STRATEGY_NAMES[row.strategy] ?? row.strategy}</strong>
                <span className="stats-ranks__track" aria-hidden="true">
                  <span style={{ width: `${(row.agents / strategyAgents) * 100}%` }} />
                </span>
                <span className="stats-ranks__value">
                  {row.agents} {row.agents === 1 ? "agent" : "agents"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="stats-infra" aria-label="What runs under the hood">
        <h2 className="stats-infra__title">Built, not promised</h2>
        <div className="stats-infra__grid">
          <Infra icon="chart-line" value={whole(totals.candles)} label={`hourly prices read on chain over ${priceDays} days`} />
          <Infra icon="shield-check" value="Chainlink" label="cross check on every ETH and BTC price" />
          <Infra icon="brain" value={whole(totals.aiReviews + totals.aiStrategies)} label="AI reviews and strategies written" />
          <Infra icon="plugs-connected" value="API + MCP" label="public data, paid x402 endpoints and an MCP server" href="/docs/premium-api" />
        </div>
        <p className="muted stats-infra__note">
          Paper agents trade simulated money at real prices from the chain. Real money trades are Zolva&apos;s own. <Link className="text-link" href="/docs/verify">How to verify any of this</Link>
        </p>
      </section>
    </div>
  );
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-big">
      <span className="stat-big__label">{label}</span>
      <span className="stat-big__value">
        <Odometer value={value} />
      </span>
    </div>
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

function Infra({ icon, value, label, href }: { icon: string; value: string; label: string; href?: string }) {
  const body = (
    <>
      <i className={`ph ph-${icon}`} aria-hidden="true" />
      <strong>{value}</strong>
      <span className="muted">{label}</span>
    </>
  );
  return href ? (
    <Link className="stats-infra__item stats-infra__item--link" href={href}>
      {body}
    </Link>
  ) : (
    <div className="stats-infra__item">{body}</div>
  );
}
