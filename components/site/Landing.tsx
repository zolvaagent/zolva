import Link from "next/link";
import type { CSSProperties } from "react";

import { GoToAppButton } from "@/components/site/SiteChrome";
import { TokenPill } from "@/components/site/TokenAddress";
import { LineChart } from "@/components/ui/LineChart";
import { TickerAvatar } from "@/components/ui/TickerAvatar";
import { Odometer, Tagline, Words } from "@/components/ui/Words";
import type { AgentSummary, DecisionEvent } from "@/lib/data/agents";
import type { Market } from "@/lib/data/market";
import type { Backtest } from "@/lib/data/showcase";
import type { Decision } from "@/lib/engine/engine";
import { LIVE_PROOF_HREF } from "@/lib/chain";
import { dateAt, dayAt, marketList, percent, points, price, shortAddress, sparkline, STRATEGY_NAMES, tone, usd } from "@/lib/format";

type Props = {
  market: Market;
  backtests: Backtest[];
  agents: AgentSummary[];
  feed: DecisionEvent[];
  /** The ZOLVA contract address once launched (env), shown as a copyable pill in the hero. */
  ca?: string | null;
};

const FAQ = [
  [
    "Is real money involved?",
    "Start on paper. Test your agent's strategy with virtual dollars at real Robinhood Chain prices, then take it to real money from your own wallet once it proves itself. Signing in never moves funds from your wallet.",
  ],
  ["What are stock tokens?", "Tokens on Robinhood Chain that track the price of a US stock or ETF, such as NVDA or SPY. They trade around the clock, including weekends."],
  ["Can agents trade crypto?", "Yes. ETH and BTC, priced every hour from their onchain pools and checked against Chainlink. Mix them with stocks in one agent."],
  ["How often does my agent trade?", "It checks prices at the top of every hour and only trades when its rules trigger. Many hours end in a hold, and that is normal."],
  ["Can I make my own strategy?", "Yes. Start from a template or a blank page, combine up to three rules to buy and three to sell, and add a take profit or a max holding time. No code."],
  ["Why compare with holding?", "Because it is the easiest alternative. If an agent cannot beat simply buying the same stocks and waiting, you should know before you trust it."],
  ["How many agents can I run?", "Up to five at once, each with its own virtual capital. Agents are locked once launched so their track record stays honest. Pause one to launch another."],
  ["Who can use Zolva?", "Anyone outside the United States and sanctioned countries. Stock tokens are not offered to US persons."],
];

export function Landing({ market, backtests, agents, feed, ca }: Props) {
  const ranked = [...backtests].sort((a, b) => b.result.returnPct - a.result.returnPct);
  const top = ranked[0];
  // The hero phones open on wins: agents up over 30 days first, then those furthest ahead of holding.
  const showcase = [...backtests].sort((a, b) => winScore(b) - winScore(a));
  const running = agents.filter((agent) => agent.status === "active");
  const leaders = [...running].sort((a, b) => b.returnPct - a.returnPct);
  const decisionsExplained = agents.reduce((sum, agent) => sum + agent.runs * agent.tokens.length, 0);
  const lastTs = market.startTs + (market.hours - 1) * 3600;
  const stockCount = market.tokens.filter((token) => token.assetClass !== "crypto").length;

  return (
    <>
      <div className="hero-wrap">
        <div className="container">
          <section className="hero">
            <Link className="hero__badge" href="/leaderboard">
              <img src="/img/brand/zolva-mark-small.png" alt="" width={24} height={24} />
              Open trading-agent infrastructure on Robinhood Chain
              <i className="ph ph-caret-right" />
            </Link>
            <Words as="h1" className="hero__title" text="Trading agents for" highlight="stocks and crypto" />
            <p className="hero__lead reveal">
              Explore tokenized stocks, crypto, and perps. Build strategies, replay them against hourly market history, and inspect every paper-trading decision.
            </p>
            <div className="hero__actions reveal">
              <Link className="button button--primary button--large" href="/studio">
                Build your agent
              </Link>
              <Link className="button button--ghost button--large" href="/leaderboard">
                See live agents
              </Link>
            </div>
            {ca && <TokenPill address={ca} />}
          </section>
        </div>
        {showcase[0] && <Phones top={showcase[0]} backtests={showcase} />}
      </div>

      <div className="container">
        <section className="stats-band" aria-label="Zolva in numbers">
          <Stat label="Markets" value={String(market.tokens.length)} />
          <Stat label="Agents running" value={String(running.length)} />
          <Stat label="Decisions explained" value={decisionsExplained.toLocaleString("en-US")} />
          <Stat label="Hours of real prices" value={market.hours.toLocaleString("en-US")} />
        </section>
      </div>

      <section className="panel-dark">
        <div className="container">
          <div className="showcase">
            <span className="showcase__label reveal">
              <img src="/img/brand/zolva-mark-small.png" alt="" width={32} height={32} />
              Zolva Studio
            </span>
            <Words className="showcase__title" text="A" highlight="trading desk" />
            <p className="showcase__lead reveal">Shape an agent, replay its last 30 days and launch it. Every number below comes from real Robinhood Chain prices.</p>
            <div className="hero__actions reveal">
              <Link className="button button--light button--large" href="/studio">
                Open the Studio
              </Link>
              <Link className="button button--dark-soft button--large" href="/leaderboard">
                See live agents
              </Link>
            </div>
            <Browser agents={leaders} />
          </div>

          <div className="strategy-section">
            <div className="section-heading">
              <span className="label">Strategies</span>
              <Words className="section-heading__title" text="A strategy for every" highlight="market mood." />
              <p className="section-heading__lead reveal">Ride strong trends, buy the dip or write your own rules. Every agent is measured against the simplest move of all: buying and holding.</p>
            </div>
            <div className="strategy-grid">
              <StrategyCard
                href="/studio?strategy=momentum"
                icon="momentum"
                label="Trend following"
                title="Momentum"
                text="Buys after a rise of more than 3% in a day and sells once the trend breaks. Made for stocks on the move."
                symbols={["NVDA", "PLTR", "TSLA"]}
                total={market.tokens.length}
                backtest={bestOf(ranked, "momentum")}
              />
              <StrategyCard
                href="/studio?strategy=mean_reversion"
                icon="mean-reversion"
                label="Buy the dip"
                title="Mean reversion"
                text="Waits for unusual drops and sells the rebound once the price is back to normal. Made for choppy markets."
                symbols={["META", "SPY", "GME"]}
                total={market.tokens.length}
                backtest={bestOf(ranked, "mean_reversion")}
              />
              <StrategyCard
                href="/studio?strategy=custom"
                icon="backtest"
                label="Your own rules"
                title="Custom"
                text="Combine price lines, averages, z scores and RSI into your own buy and sell rules. Add a take profit and a max holding time."
                symbols={["Any", "of", "20"]}
                total={market.tokens.length}
                backtest={bestOf(ranked, "custom")}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="page__head">
            <div className="section-heading" style={{ marginBottom: 0 }}>
              <span className="label">Markets</span>
              <Words className="section-heading__title" text="Every big name," highlight="around the clock." />
              <p className="section-heading__lead reveal">
                {stockCount} US stocks and ETFs, plus ETH and BTC, on Robinhood Chain. They keep trading at night and on weekends, and so can your agent.
              </p>
            </div>
          </div>
          <StockGrid market={market} />
        </div>
      </section>

      <section className="section section--subtle">
        <div className="container">
          <div className="section-heading">
            <span className="label">How it works</span>
            <Words className="section-heading__title" text="From idea to" highlight="running agent." />
            <p className="section-heading__lead reveal">No code, no formulas, no deposit. Shape it, check it, launch it.</p>
          </div>
          <div className="grid-steps">
            <Feature icon="backtest" step="Step 1" title="Replay the last 30 days" text="Pick a strategy or write your own rules, choose up to three markets and a stop loss. The Studio replays real hourly prices with your exact settings, instantly." />
            <Feature icon="agent" step="Step 2" title="Launch your agent" text="Sign one free message with your wallet. Your agent checks prices every hour and writes down why it acted." />
            <Feature icon="leaderboard" step="Step 3" title="Find what makes money" text="Your agent trades every hour on real market prices. See which rules turn a profit and beat simply holding, then run more agents on the winners." />
            <Feature icon="tokenize" step="Step 4" title="Tokenize your agent" text="Turn a strategy with a track record into a token others can follow." soon />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container feed-section">
          <div>
            <div className="section-heading" style={{ marginBottom: 0 }}>
              <span className="label">Decision log</span>
              <Words className="section-heading__title" text="Every move," highlight="explained." />
              <p className="section-heading__lead reveal">Agents never act in silence. Each hour they write down what they saw and why they bought, sold or waited.</p>
            </div>
            <ul className="check-list reveal">
              <li>
                <i className="ph ph-check" />
                The exact signal: 24h change, distance from the average, z score
              </li>
              <li>
                <i className="ph ph-check" />
                Stop losses and take profits called out the moment they trigger
              </li>
              <li>
                <i className="ph ph-check" />
                {feed.length ? "Live decisions from agents running right now" : "Shown from the house agents' 30 day backtests until live trades come in"}
              </li>
            </ul>
          </div>
          <Feed feed={feed} backtests={ranked} />
        </div>
      </section>

      <section className="section section--subtle">
        <div className="container">
          <Tagline text="Most trading ideas sound great in your head. Thirty days of real prices show which ones actually work." />
          <div className="proof-grid">
            <Proof value="0.5%" text="Charged on every simulated trade for fees and slippage." />
            <Proof value="1 hour" text="Between decisions, around the clock, weekends included." />
            <Proof value="30 days" text="Of real Robinhood Chain prices replayed before launch." />
            <Proof value="100%" text="Of decisions come with a plain language reason." />
          </div>
        </div>
      </section>

      {top && (
        <section className="section">
          <div className="container">
            <div className="section-heading">
              <span className="label">Track record</span>
              <Words className="section-heading__title" text="Every agent next to" highlight="just holding." />
              <p className="section-heading__lead reveal">
                Growth of $10,000 over the last 30 days with {top.config.name}, a house strategy, compared with holding the same stocks or staying in cash. This is a backtest on real prices.
              </p>
            </div>
            <div className="growth reveal">
              <div className="growth__legend">
                <div className="growth__row">
                  <span>
                    <span className="swatch" style={{ background: "var(--color-purple-rich)" }} />
                    {top.config.name}
                  </span>
                  <strong>{usd(top.result.finalEquity)}</strong>
                </div>
                <div className="growth__row">
                  <span>
                    <span className="swatch" style={{ background: "var(--color-hold-line)" }} />
                    Holding {top.config.symbols.join(", ")}
                  </span>
                  <strong>{usd(top.holdCurve[top.holdCurve.length - 1])}</strong>
                </div>
                <div className="growth__row">
                  <span>
                    <span className="swatch" style={{ background: "var(--color-border-strong)" }} />
                    Cash
                  </span>
                  <strong>{usd(10000)}</strong>
                </div>
                <Link className="button button--ghost" href={`/studio?strategy=${top.config.strategy}`} style={{ width: "fit-content" }}>
                  Try it in the Studio
                  <i className="ph ph-arrow-right" />
                </Link>
              </div>
              <LineChart
                startTs={top.startTs}
                height={300}
                legend={false}
                step={6}
                series={[
                  { label: top.config.name, values: top.result.runs.map((run) => run.equity), color: "var(--color-purple-rich)" },
                  { label: "Holding", values: top.holdCurve, color: "var(--color-hold-line)", dashed: true },
                  { label: "Cash", values: top.holdCurve.map(() => 10000), color: "var(--color-border-strong)" },
                ]}
              />
            </div>
          </div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="page__head">
            <div className="section-heading" style={{ marginBottom: 0 }}>
              <span className="label">Leaderboard</span>
              <Words className="section-heading__title" text="Agents running" highlight="right now." />
            </div>
            <Link className="button button--ghost" href="/leaderboard">
              Full leaderboard
              <i className="ph ph-arrow-right" />
            </Link>
          </div>
          <div className="card reveal" style={{ padding: "var(--space-100) var(--space-200)" }}>
            <LeaderTable agents={leaders.slice(0, 5)} />
          </div>
          <p className="note" style={{ marginTop: "var(--space-100)" }}>
            <i className="ph ph-info" />
            Live paper trading since launch. Prices up to {dateAt(lastTs)}.
          </p>
        </div>
      </section>

      <section className="panel-dark next-panel">
        <div className="container">
          <div className="section-heading section-heading--center">
            <span className="label">Roadmap</span>
            <Words className="section-heading__title" text="What's" highlight="next." />
            <p className="section-heading__lead reveal">
              Live today: paper trading, crypto markets and real money trading on chain. Planned: the agent launchpad. Every claim we can check is on{" "}
              <Link href="/docs/verify">Verify Zolva</Link>.
            </p>
          </div>
          <WhatsNext />
        </div>
      </section>

      <section className="section section--subtle">
        <div className="container">
          <div className="section-heading section-heading--center">
            <span className="label">FAQ</span>
            <Words className="section-heading__title" text="Before you" highlight="build." />
          </div>
          <div className="faq reveal">
            {FAQ.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <i className="ph ph-plus" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">{showcase[0] && <Closing top={showcase[0]} ranked={showcase} />}</div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-big">
      <span className="stat-big__label">{label}</span>
      <span className="stat-big__value">
        <Odometer value={value} />
      </span>
    </div>
  );
}

/** A how it works step. `soon` shows a teaser for something not built yet, faded with a Soon pill. */
function Feature({ icon, step, title, text, soon = false }: { icon: string; step: string; title: string; text: string; soon?: boolean }) {
  return (
    <article className={`feature reveal${soon ? " feature--soon" : ""}`} style={{ background: "var(--color-surface)" }}>
      <img className="feature__icon" src={`/img/icons/${icon}.png`} alt="" width={64} height={64} />
      <span className="feature__step">
        {step}
        {soon && <span className="feature__soon">Soon</span>}
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function Proof({ value, text }: { value: string; text: string }) {
  return (
    <div className="proof reveal" style={{ background: "var(--color-surface)" }}>
      <strong>{value}</strong>
      <span>{text}</span>
    </div>
  );
}

/** The house agent with the best 30 day return for a strategy (`ranked` is sorted best first). */
const bestOf = (ranked: Backtest[], strategy: string) => ranked.find((item) => item.config.strategy === strategy);

/**
 * A strategy with its best house backtest. The card shows a return only when it is positive,
 * otherwise the lead over holding when there is one, and otherwise invites a replay: it never
 * shows a loss as the headline number, but it never invents a gain either.
 */
function StrategyCard(props: { href: string; icon: string; label: string; title: string; text: string; symbols: string[]; total: number; backtest?: Backtest }) {
  const { backtest } = props;
  // The chips name the markets of the agent shown, so the name, markets and number belong together.
  const symbols = backtest ? backtest.config.symbols : props.symbols;
  return (
    <Link className="strategy-card reveal" href={props.href}>
      <div>
        <img className="strategy-card__icon" src={`/img/icons/${props.icon}.png`} alt="" width={72} height={72} />
        <div className="strategy-card__label">{props.label}</div>
        <h3 className="strategy-card__title">{props.title}</h3>
        <p className="strategy-card__text">{props.text}</p>
      </div>
      <div className="stack stack--tight">
        <div className="token-stack">
          {symbols.map((symbol) => (
            <span key={symbol} className="token-dot">
              {symbol}
            </span>
          ))}
        </div>
        <div className="strategy-card__foot">
          <span>
            30 day backtest
            <strong>{backtest ? backtest.config.name : "Your rules"}</strong>
          </span>
          <span style={{ textAlign: "right" }}>
            {backtest && backtest.result.returnPct > 0 ? (
              <>
                Return
                <strong>{percent(backtest.result.returnPct)}</strong>
              </>
            ) : backtest && backtest.result.returnPct > backtest.holdReturnPct ? (
              <>
                Vs holding
                <strong>{points(backtest.result.returnPct - backtest.holdReturnPct)}</strong>
              </>
            ) : (
              <>
                Last 30 days
                <strong>Replay it</strong>
              </>
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Ranks a backtest for the hero: any gain beats any lead over holding, then by size. */
const winScore = (backtest: Backtest) => (backtest.result.returnPct > 0 ? 1_000_000 + backtest.result.returnPct : backtest.result.returnPct - backtest.holdReturnPct);

/**
 * The number a phone leads with, always the good news that is actually there: the return when
 * the agent made money, otherwise how far it stayed ahead of simply holding. Never a red loss.
 */
function phoneWin(backtest: Backtest): { value: string; label: string; detail: string } {
  const { returnPct } = backtest.result;
  const lead = returnPct - backtest.holdReturnPct;
  if (returnPct > 0) return { value: percent(returnPct), label: "Last 30 days", detail: lead > 0 ? `${points(lead)} versus holding` : "Paper trading" };
  return { value: points(lead), label: "Ahead of holding, 30 days", detail: `Holding ${percent(backtest.holdReturnPct)}, agent ${percent(returnPct)}` };
}

function Phones({ top, backtests }: { top: Backtest; backtests: Backtest[] }) {
  const status = (
    <>
      <div className="phone__island" />
      <div className="phone__status">
        <span>9:41</span>
        <span>
          <i className="ph-fill ph-cell-signal-full" /> <i className="ph-fill ph-battery-full" />
        </span>
      </div>
    </>
  );
  const equity = top.result.runs.map((run) => run.equity);
  const lastRun = top.result.runs[top.result.runs.length - 1];
  const second = backtests[1] ?? top;
  const topWin = phoneWin(top);
  const secondWin = phoneWin(second);
  const log = backtests
    .flatMap((backtest) =>
      backtest.result.runs.flatMap((run) => run.decisions.filter((decision) => decision.action !== "hold").map((decision) => ({ ...decision, ts: top.startTs + (run.index - top.result.runs[0].index) * 3600 }))),
    )
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 4);

  return (
    <div className="phones" data-phones aria-hidden="true">
      <div className="phone phone--left">
        <div className="phone__screen">
          {status}
          <div className="phone__title">Studio</div>
          <div className="phone__chips">
            <span className={`phone__chip${second.config.strategy === "momentum" ? " phone__chip--on" : ""}`}>Momentum</span>
            <span className={`phone__chip${second.config.strategy === "mean_reversion" ? " phone__chip--on" : ""}`}>Mean reversion</span>
            <span className={`phone__chip${second.config.strategy === "custom" ? " phone__chip--on" : ""}`}>Custom</span>
          </div>
          <div className="phone__chips">
            {second.config.symbols.map((symbol) => (
              <span key={symbol} className="phone__chip phone__chip--on">
                {symbol}
              </span>
            ))}
          </div>
          <div className="phone__tile phone__tile--accent">
            <div className="muted">{secondWin.label}</div>
            <div className="phone__big phone__big--pop gain" style={{ textAlign: "left", fontSize: "calc(var(--phone-w) * 0.11)" }}>
              {secondWin.value}
            </div>
            <div className="muted">{secondWin.detail}</div>
          </div>
          <div className="phone__row muted">
            <span>Stop loss</span>
            <strong style={{ color: "var(--color-text)" }}>{second.config.stopLossPct}%</strong>
          </div>
          <div className="phone__row muted">
            <span>Max per stock</span>
            <strong style={{ color: "var(--color-text)" }}>{second.config.maxPositionPct}%</strong>
          </div>
          <div className="phone__button phone__button--shine">Launch agent</div>
        </div>
      </div>

      <div className="phone phone--center">
        <div className="phone__screen">
          {status}
          <div className="phone__row">
            <span className="phone__title">{top.config.name}</span>
            <span className="pill pill--accent">Backtest</span>
          </div>
          <img className="phone__icon phone__icon--float" src="/img/icons/agent.png" alt="" />
          <div className="phone__caption">{topWin.label}</div>
          <div className="phone__big phone__big--pop gain">{topWin.value}</div>
          <div className="phone__caption">{topWin.detail}</div>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ height: "calc(var(--phone-w) * 0.2)" }}>
            <polyline className="phone__spark" pathLength={1} points={sparkline(equity, 40, 4)} fill="none" stroke="var(--color-purple-rich)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {lastRun && (
            <div className="phone__tile phone__tile--latest">
              <div className="muted" style={{ marginBottom: "calc(var(--phone-w) * 0.015)" }}>
                Latest decision
              </div>
              <div>
                <strong>{lastRun.decisions[0]?.token}</strong> <span className="muted">{lastRun.decisions[0]?.reasoning}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="phone phone--right">
        <div className="phone__screen">
          {status}
          <div className="phone__title">Decision log</div>
          {log.map((item, i) => (
            <div key={i} className={`phone__tile phone__tile--log${i === 0 ? " phone__tile--new" : ""}`} style={{ "--i": i } as CSSProperties}>
              <div className="phone__row" style={{ marginBottom: "calc(var(--phone-w) * 0.01)" }}>
                <span className={`decision__action decision__action--${item.action}`} style={{ fontSize: "calc(var(--phone-w) * 0.032)" }}>
                  {item.action}
                </span>
                <span className="muted">{dayAt(item.ts)}</span>
              </div>
              <div>
                <strong>{item.token}</strong> <span className="muted">{item.reasoning}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Browser({ agents }: { agents: AgentSummary[] }) {
  const nav = (icon: string, label: string, on = false) => (
    <div className={`browser__nav${on ? " browser__nav--on" : ""}`}>
      <i className={`ph ph-${icon}`} />
      {label}
    </div>
  );
  return (
    <div className="browser reveal" aria-hidden="true">
      <div className="browser__bar">
        <div className="browser__dots">
          <span />
          <span />
          <span />
        </div>
        <div className="browser__url">zolva / leaderboard</div>
        <div />
      </div>
      <div className="browser__body">
        <aside className="browser__side">
          <div className="browser__brand">
            <img src="/img/brand/zolva-mark-small.png" alt="" />
            Zolva
          </div>
          {nav("squares-four", "Dashboard")}
          <div className="browser__group">Explore</div>
          {nav("sliders-horizontal", "Studio")}
          {nav("trophy", "Leaderboard", true)}
          {nav("chart-line-up", "Markets")}
          <div className="browser__group">Learn</div>
          {nav("book-open", "Strategies")}
          {nav("question", "FAQ")}
        </aside>
        <div className="browser__main">
          <div className="browser__top">
            <div className="browser__search">
              <i className="ph ph-magnifying-glass" /> Search agents and stocks
            </div>
            <div style={{ display: "flex", gap: "var(--space-75)" }}>
              <span className="browser__chip">
                <i className="ph ph-plus" /> New agent
              </span>
            </div>
          </div>
          <div>
            <div className="browser__title">Leaderboard</div>
            <div style={{ color: "rgba(246,247,244,0.5)", marginTop: 4 }}>Live paper agents, next to what holding would have made.</div>
          </div>
          <div style={{ display: "flex", gap: "var(--space-75)", flexWrap: "wrap" }}>
            <span className="browser__chip">All strategies</span>
            <span className="browser__chip">Running</span>
          </div>
          <div className="browser__table-wrap">
            <table className="browser__table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th className="hide-sm">Strategy</th>
                  <th>Return</th>
                  <th className="hide-sm">vs holding</th>
                  <th className="hide-sm hide-md">Trades</th>
                </tr>
              </thead>
              <tbody>
                {agents.slice(0, 7).map((agent) => (
                  <tr key={agent.id}>
                    <td>
                      <span className="agent-cell">
                        <TickerAvatar symbol={agent.tokens[0]?.symbol ?? "?"} />
                        <span>
                          {agent.name}
                          <span className="sub">{marketList(agent.tokens.map((token) => token.symbol))}</span>
                        </span>
                      </span>
                    </td>
                    <td className="hide-sm">
                      {STRATEGY_NAMES[agent.strategy]}
                      <span className="sub">{agent.isHouse ? "by Zolva" : shortAddress(agent.owner)}</span>
                    </td>
                    <td className={tone(agent.returnPct)}>
                      {percent(agent.returnPct)}
                      <span className="sub">{usd(agent.equity)}</span>
                    </td>
                    <td className={`hide-sm ${tone(agent.edge)}`}>
                      {points(agent.edge)}
                      <span className="sub">vs holding</span>
                    </td>
                    <td className="hide-sm hide-md">
                      {agent.trades}
                      <span className="sub">{agent.runs} hours</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StockGrid({ market }: { market: Market }) {
  const last = market.hours - 1;
  return (
    <div className="stock-grid">
      {market.tokens
        .filter((token) => token.closes[last] != null)
        .map((token) => {
          const now = token.closes[last]!;
          const dayAgo = token.closes[Math.max(token.firstIndex ?? 0, last - 24)] ?? now;
          const change = (now / dayAgo - 1) * 100;
          const week = token.closes.slice(Math.max(token.firstIndex ?? 0, last - 7 * 24)).filter((value): value is number => value != null);
          const color = week[week.length - 1] >= week[0] ? "var(--color-gain)" : "var(--color-loss)";
          return (
            <Link key={token.address} className="stock-tile reveal" href={`/studio?stock=${token.symbol}`} title={`Build an agent for ${token.name}`}>
              <span className="stock-tile__head">
                <TickerAvatar symbol={token.symbol} />
                <span>
                  <strong>{token.symbol}</strong>
                  <span className="stock-tile__name">{token.name}</span>
                </span>
              </span>
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={sparkline(week, 40, 3)} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </svg>
              <span className="stock-tile__price">
                {price(now)}
                <small className={tone(change)}>{percent(change)}</small>
              </span>
            </Link>
          );
        })}
    </div>
  );
}

function Feed({ feed, backtests }: { feed: DecisionEvent[]; backtests: Backtest[] }) {
  type Item = { key: string; agent: string; ts: number; action: Decision["action"]; symbol: string; reasoning: string; backtest: boolean };
  let items: Item[] = feed.map((event, i) => ({ key: `live-${i}`, agent: event.agentName, ts: event.ts, action: event.action, symbol: event.symbol, reasoning: event.reasoning, backtest: false }));
  if (items.length < 6) {
    const fromBacktests = backtests
      .flatMap((backtest) =>
        backtest.result.runs.flatMap((run) =>
          run.decisions
            .filter((decision) => decision.action !== "hold")
            .map((decision, j) => ({
              key: `bt-${backtest.config.name}-${run.index}-${j}`,
              agent: `${backtest.config.name} (backtest)`,
              ts: backtest.startTs + (run.index - backtest.result.runs[0].index) * 3600,
              action: decision.action,
              symbol: decision.token,
              reasoning: decision.reasoning,
              backtest: true,
            })),
        ),
      )
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 14 - items.length);
    items = [...items, ...fromBacktests];
  }
  const list = (copy: string) =>
    items.map((item) => (
      <div key={`${copy}-${item.key}`} className="feed__item">
        <div className="feed__meta">
          <span>{item.agent}</span>
          <span>{dateAt(item.ts)}</span>
        </div>
        <div style={{ display: "flex", gap: "var(--space-100)" }}>
          <span className={`decision__action decision__action--${item.action}`}>{item.action}</span>
          <span>
            <strong>{item.symbol}</strong> <span className="muted">{item.reasoning}</span>
          </span>
        </div>
      </div>
    ));
  return (
    <div className="feed reveal" aria-label="Recent agent decisions">
      {/* Rendered twice so the endless upward loop has no visible seam. */}
      <div className="feed__track">
        {list("a")}
        {list("b")}
      </div>
    </div>
  );
}

export function LeaderTable({ agents }: { agents: AgentSummary[] }) {
  if (!agents.length) {
    return (
      <div className="empty">
        <img src="/img/icons/leaderboard.png" alt="" width={64} height={64} />
        <p>No agents running yet. Build one and it shows up here after its first hour.</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table table--clickable">
        <thead>
          <tr>
            <th>#</th>
            <th>Agent</th>
            <th className="only-desktop">Strategy</th>
            <th>Stocks</th>
            <th className="num">Return</th>
            <th className="num only-desktop">vs holding</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent, i) => (
            <tr key={agent.id}>
              <td className="rank">{i + 1}</td>
              <td>
                <Link className="row-link" href={`/agents/${agent.id}`}>{agent.name}</Link>
                {agent.isHouse && (
                  <span className="pill" style={{ marginLeft: 6 }}>
                    by Zolva
                  </span>
                )}
              </td>
              <td className="muted only-desktop">{STRATEGY_NAMES[agent.strategy]}</td>
              <td className="muted" title={agent.tokens.map((token) => token.symbol).join(", ")}>
                {marketList(agent.tokens.map((token) => token.symbol))}
              </td>
              <td className={`num ${tone(agent.returnPct)}`}>{percent(agent.returnPct)}</td>
              <td className={`num only-desktop ${tone(agent.edge)}`}>{points(agent.edge)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Closing({ top, ranked }: { top: Backtest; ranked: Backtest[] }) {
  // Same rule as the hero phones: lead with the good news that is really there, never a red loss.
  const runner = ranked[1] ?? top;
  // The front card needs a third agent that is also ahead; with only two, it shows the top one again.
  const third = ranked.slice(2).find((backtest) => winScore(backtest) > 0) ?? top;
  const runnerWin = phoneWin(runner);
  const thirdWin = phoneWin(third);
  const lastDecision = third.result.runs[third.result.runs.length - 1]?.decisions[0];
  return (
    <div className="closing reveal">
      <div className="closing__copy">
        <span className="label">Get started</span>
        <Words className="closing__title" text="Your first agent is" highlight="free." />
        <p className="section-heading__lead">Build it, replay its last 30 days and launch it in about five minutes. No deposit, no gas.</p>
        <div className="hero__actions" style={{ justifyContent: "flex-start" }}>
          <GoToAppButton className="button button--primary button--large" label="Go to app" />
          <Link className="button button--ghost button--large" href="/studio">
            Try the Studio
          </Link>
        </div>
        <ul className="closing__points">
          <li>
            <i className="ph ph-check" />
            Free
          </li>
          <li>
            <i className="ph ph-check" />
            Virtual money only
          </li>
          <li>
            <i className="ph ph-check" />
            Up to 5 agents at once
          </li>
        </ul>
      </div>

      <div className="closing__stack" aria-hidden="true">
        <div className="closing__card closing__card--back">
          <div className="closing__card-head">
            <img src="/img/icons/backtest.png" alt="" width={36} height={36} />
            <span>Backtest</span>
          </div>
          <div className="closing__big gain">{runnerWin.value}</div>
          <div className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
            {STRATEGY_NAMES[runner.config.strategy]} on {runner.config.symbols.join(", ")}. {runnerWin.detail}
          </div>
        </div>
        <div className="closing__card closing__card--mid">
          <div className="closing__card-head">
            <img src="/img/icons/leaderboard.png" alt="" width={36} height={36} />
            <span>Versus holding</span>
          </div>
          <div className="closing__big gain">{points(top.result.returnPct - top.holdReturnPct)}</div>
          <div className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
            {top.config.name}, last 30 days
          </div>
        </div>
        <div className="closing__card closing__card--front">
          <div className="closing__card-head">
            <img src="/img/icons/agent.png" alt="" width={36} height={36} />
            <span>{third.config.name}</span>
          </div>
          <div className={`closing__big ${third === top ? tone(top.result.returnPct) : "gain"}`}>{third === top ? percent(top.result.returnPct) : thirdWin.value}</div>
          {lastDecision && (
            <div className="decision">
              <span className={`decision__action decision__action--${lastDecision.action}`}>{lastDecision.action}</span>
              <span>
                <strong>{lastDecision.token}</strong> <span className="muted">{lastDecision.reasoning}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SoonBadge({ label = "Coming soon" }: { label?: string }) {
  return (
    <span className="next-card__badge">
      <span className="pulse" />
      {label}
    </span>
  );
}

/** Upcoming features, each with a small preview of how it will look. Crypto markets went live on 2026-10-24; real money has been in testing with Zolva's own wallet since 2026-10-28. */
function WhatsNext() {
  return (
    <div className="next-grid">
      <article className="next-card next-card--featured reveal">
        <div className="next-preview" aria-hidden="true">
          <div className="next-token">
            <img src="/img/icons/agent.png" alt="" width={32} height={32} />
            <span>
              <strong>Night Owl NVDA</strong>
              <span>Agent token on Pons</span>
            </span>
            <span className="next-token__ticker">$OWL</span>
          </div>
          {/* Fees flowing from the token into the split. */}
          <span className="next-flow" />
          <div className="next-split">
            <span className="next-split__head">Creator fees, split by contract</span>
            {(
              [
                ["Agent creator", 70],
                ["Agent AI fuel", 20],
                ["Zolva buyback and burn", 10],
              ] as const
            ).map(([label, share], index) => (
              // --share drives the bar and the count up; --i staggers the rows.
              <span className="next-split__row" key={label} style={{ "--share": share, "--i": index } as React.CSSProperties}>
                <span>{label}</span>
                <span className="next-split__bar">
                  <span />
                </span>
                <strong className="next-split__pct" data-share={share} />
              </span>
            ))}
          </div>
          <div className="next-stop next-launch">
            <span>Launch on Pons</span>
            <i className="ph ph-rocket-launch" />
          </div>
        </div>
        <div className="next-card__body">
          <SoonBadge label="Planned, not built" />
          <h3>Agent launchpad</h3>
          <p>
            The plan: launch a token for your agent on Pons, right from Zolva, with a contract that splits the creator fees so part of them keeps the agent&apos;s AI running. The preview is a design,
            not a working app.
          </p>
          <ul className="next-points">
            <li style={{ "--i": 0 } as React.CSSProperties}>
              <i className="ph ph-rocket-launch" aria-hidden="true" /> Two steps from your own wallet
            </li>
            <li style={{ "--i": 1 } as React.CSSProperties}>
              <i className="ph ph-git-fork" aria-hidden="true" /> Fee split to be enforced by contract, no admin
            </li>
            <li style={{ "--i": 2 } as React.CSSProperties}>
              <i className="ph ph-users-three" aria-hidden="true" /> Anyone could launch on a published agent, its creator still earns
            </li>
          </ul>
        </div>
        <div className="next-card__foot">
          <i className="ph ph-hourglass-medium" />
          Now: writing the fee split contract, then an audit
        </div>
      </article>

      <article className="next-card reveal">
        <div className="next-preview" aria-hidden="true">
          <div className="next-mode">
            <span className="next-mode__option">
              <i className="ph ph-flask" /> Paper
            </span>
            <span className="next-mode__option next-mode__option--on">
              <i className="ph-fill ph-lock-simple" /> Live
            </span>
          </div>
          <div className="next-wallet">
            <span className="next-wallet__icon">
              <i className="ph ph-wallet" />
            </span>
            <span>
              <strong>Your wallet</strong>
              <span>Funds never leave it</span>
            </span>
            <span className="next-wallet__ok">
              <i className="ph-fill ph-shield-check" />
            </span>
          </div>
          <div className="next-limit">
            <span className="next-limit__head">
              <span>Limit per trade</span>
              <strong>you choose</strong>
            </span>
            <span className="next-limit__track">
              <span className="next-limit__fill" />
              <span className="next-limit__knob" />
            </span>
          </div>
          <div className="next-stop">
            <span>Stop the agent anytime</span>
            <span className="next-switch" />
          </div>
        </div>
        <div className="next-card__body">
          <SoonBadge label="Live" />
          <h3>Real money trading</h3>
          <p>Run your agent from your own wallet, with limits you set and a switch to stop it at any time. Paper trading stays free.</p>
        </div>
        <div className="next-card__foot">
          <i className="ph ph-hourglass-medium" />
          Live on Robinhood Chain.{" "}
          <Link href={LIVE_PROOF_HREF}>See every trade on chain</Link>
        </div>
      </article>

      <article className="next-card reveal">
        <div className="next-preview" aria-hidden="true">
          <div className="next-tabs">
            <span>Stocks</span>
            <span className="next-tabs__on">Crypto</span>
          </div>
          {[
            ["currency-eth", "Ether", "M2 22 L12 16 L22 19 L32 10 L42 13 L52 6 L62 9"],
            ["currency-btc", "Bitcoin", "M2 18 L12 20 L22 12 L32 15 L42 8 L52 11 L62 5"],
            ["coins", "More tokens", "M2 14 L12 18 L22 15 L32 19 L42 12 L52 14 L62 8"],
          ].map(([icon, name, line]) => (
            <div className="next-coin" key={name}>
              <span className="next-coin__icon">
                <i className={`ph ph-${icon}`} />
              </span>
              <strong>{name}</strong>
              <svg viewBox="0 0 64 24" className="next-coin__spark">
                <path d={line} />
              </svg>
              <span className="next-skeleton" />
            </div>
          ))}
        </div>
        <div className="next-card__body">
          <SoonBadge label="Live now" />
          <h3>Crypto markets</h3>
          <p>ETH and BTC on Robinhood Chain, priced every hour from onchain pools and checked against Chainlink. Mix them with stocks in one agent.</p>
        </div>
        <div className="next-card__foot">
          <i className="ph ph-hourglass-medium" />
          Next: more coins once their pools are deep enough
        </div>
      </article>
    </div>
  );
}
