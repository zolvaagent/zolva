import Link from "next/link";

import { GoToAppButton } from "@/components/site/SiteChrome";
import { LineChart } from "@/components/ui/LineChart";
import { TickerAvatar } from "@/components/ui/TickerAvatar";
import { Odometer, Tagline, Words } from "@/components/ui/Words";
import type { AgentSummary, DecisionEvent } from "@/lib/data/agents";
import type { Market } from "@/lib/data/market";
import type { Backtest } from "@/lib/data/showcase";
import type { Decision } from "@/lib/engine/engine";
import { dateAt, dayAt, percent, points, price, shortAddress, sparkline, STRATEGY_NAMES, tone, usd } from "@/lib/format";

type Props = {
  market: Market;
  backtests: Backtest[];
  agents: AgentSummary[];
  feed: DecisionEvent[];
};

const FAQ = [
  ["Is real money involved?", "No. Every agent trades virtual dollars at real Robinhood Chain prices. Signing in costs no gas and never moves funds from your wallet."],
  ["What are stock tokens?", "Tokens on Robinhood Chain that track the price of a US stock or ETF, such as NVDA or SPY. They trade around the clock, including weekends."],
  ["How often does my agent trade?", "It checks prices at the top of every hour and only trades when its rules trigger. Many hours end in a hold, and that is normal."],
  ["Can I make my own strategy?", "Yes. Start from a template or a blank page, combine up to three rules to buy and three to sell, and add a take profit or a max holding time. No code."],
  ["Why compare with holding?", "Because it is the easiest alternative. If an agent cannot beat simply buying the same stocks and waiting, you should know before you trust it."],
  ["How many agents can I run?", "Up to five at once, each with its own virtual capital. Agents are locked once launched so their track record stays honest. Pause one to launch another."],
  ["Who can use Zolva?", "Anyone outside the United States and sanctioned countries. Stock tokens are not offered to US persons."],
];

export function Landing({ market, backtests, agents, feed }: Props) {
  const ranked = [...backtests].sort((a, b) => b.result.returnPct - a.result.returnPct);
  const top = ranked[0];
  const running = agents.filter((agent) => agent.status === "active");
  const leaders = [...running].sort((a, b) => b.returnPct - a.returnPct);
  const decisionsExplained = agents.reduce((sum, agent) => sum + agent.runs * agent.tokens.length, 0);
  const lastTs = market.startTs + (market.hours - 1) * 3600;

  return (
    <>
      <div className="hero-wrap">
        <div className="container">
          <section className="hero">
            <Link className="hero__badge" href="/leaderboard">
              <img src="/img/brand/zolva-mark.png" alt="" width={24} height={24} />
              Paper trading on Robinhood Chain
              <i className="ph ph-caret-right" />
            </Link>
            <Words as="h1" className="hero__title" text="Trading agents for" highlight="every stock" />
            <p className="hero__lead reveal">
              Build an agent for NVDA, Tesla or SPY in minutes. See how it would have traded the last 30 days before it touches a single virtual dollar.
            </p>
            <div className="hero__actions reveal">
              <Link className="button button--primary button--large" href="/studio">
                Build your agent
              </Link>
              <Link className="button button--ghost button--large" href="/leaderboard">
                See live agents
              </Link>
            </div>
          </section>
        </div>
        {top && <Phones top={top} backtests={ranked} />}
      </div>

      <div className="container">
        <section className="stats-band" aria-label="Zolva in numbers">
          <Stat label="Stock tokens" value={String(market.tokens.length)} />
          <Stat label="Agents running" value={String(running.length)} />
          <Stat label="Decisions explained" value={decisionsExplained.toLocaleString("en-US")} />
          <Stat label="Hours of real prices" value={market.hours.toLocaleString("en-US")} />
        </section>
      </div>

      <section className="panel-dark">
        <div className="container">
          <div className="showcase">
            <span className="showcase__label reveal">
              <img src="/img/brand/zolva-mark.png" alt="" width={32} height={32} />
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
                backtest={backtests.find((item) => item.config.strategy === "momentum")}
              />
              <StrategyCard
                href="/studio?strategy=mean_reversion"
                icon="mean-reversion"
                label="Buy the dip"
                title="Mean reversion"
                text="Waits for unusual drops and sells the rebound once the price is back to normal. Made for choppy markets."
                symbols={["META", "SPY", "GME"]}
                total={market.tokens.length}
                backtest={backtests.find((item) => item.config.strategy === "mean_reversion")}
              />
              <StrategyCard
                href="/studio?strategy=custom"
                icon="backtest"
                label="Your own rules"
                title="Custom"
                text="Combine price lines, averages, z scores and RSI into your own buy and sell rules. Add a take profit and a max holding time."
                symbols={["Any", "of", "20"]}
                total={market.tokens.length}
                backtest={backtests.find((item) => item.config.strategy === "custom")}
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
                {market.tokens.length} US stocks and ETFs as tokens on Robinhood Chain. They keep trading at night and on weekends, and so can your agent.
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
          <div className="grid-3">
            <Feature icon="backtest" step="Step 1" title="Replay the last 30 days" text="Pick a strategy or write your own rules, choose up to three stocks and a stop loss. The Studio replays real hourly prices with your exact settings, instantly." />
            <Feature icon="agent" step="Step 2" title="Launch your agent" text="Sign one free message with your wallet. Your agent checks prices every hour and writes down why it acted." />
            <Feature icon="leaderboard" step="Step 3" title="Climb the leaderboard" text="Every agent has a public page, ranked by return and by how far it beats holding. Run up to five at once." />
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
            <span className="label">Coming soon</span>
            <Words className="section-heading__title" text="What's" highlight="next." />
            <p className="section-heading__lead reveal">Paper trading is live today. Two things are on the way, built with the same honesty.</p>
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
        <div className="container">{top && <Closing top={top} ranked={ranked} />}</div>
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

function Feature({ icon, step, title, text }: { icon: string; step: string; title: string; text: string }) {
  return (
    <article className="feature reveal" style={{ background: "#fff" }}>
      <img className="feature__icon" src={`/img/icons/${icon}.png`} alt="" width={64} height={64} />
      <span className="feature__step">{step}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function Proof({ value, text }: { value: string; text: string }) {
  return (
    <div className="proof reveal" style={{ background: "#fff" }}>
      <strong>{value}</strong>
      <span>{text}</span>
    </div>
  );
}

function StrategyCard(props: { href: string; icon: string; label: string; title: string; text: string; symbols: string[]; total: number; backtest?: Backtest }) {
  const { backtest } = props;
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
          {props.symbols.map((symbol) => (
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
            Return
            <strong>{backtest ? percent(backtest.result.returnPct) : "Replay first"}</strong>
          </span>
        </div>
      </div>
    </Link>
  );
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
            <div className="muted">Last 30 days</div>
            <div className={`phone__big ${tone(second.result.returnPct)}`} style={{ textAlign: "left", fontSize: "calc(var(--phone-w) * 0.11)" }}>
              {percent(second.result.returnPct)}
            </div>
            <div className="muted">Holding {percent(second.holdReturnPct)}</div>
          </div>
          <div className="phone__row muted">
            <span>Stop loss</span>
            <strong style={{ color: "var(--color-text)" }}>{second.config.stopLossPct}%</strong>
          </div>
          <div className="phone__row muted">
            <span>Max per stock</span>
            <strong style={{ color: "var(--color-text)" }}>{second.config.maxPositionPct}%</strong>
          </div>
          <div className="phone__button">Launch agent</div>
        </div>
      </div>

      <div className="phone phone--center">
        <div className="phone__screen">
          {status}
          <div className="phone__row">
            <span className="phone__title">{top.config.name}</span>
            <span className="pill pill--accent">Backtest</span>
          </div>
          <img className="phone__icon" src="/img/icons/agent.png" alt="" />
          <div className="phone__caption">Last 30 days</div>
          <div className={`phone__big ${tone(top.result.returnPct)}`}>{percent(top.result.returnPct)}</div>
          <div className="phone__caption">{points(top.result.returnPct - top.holdReturnPct)} versus holding</div>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ height: "calc(var(--phone-w) * 0.2)" }}>
            <polyline points={sparkline(equity, 40, 4)} fill="none" stroke="var(--color-purple-rich)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {lastRun && (
            <div className="phone__tile">
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
            <div key={i} className="phone__tile">
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
            <img src="/img/brand/zolva-mark.png" alt="" />
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
                          <span className="sub">{agent.tokens.map((token) => token.symbol).join(", ")}</span>
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
                <Link href={`/agents/${agent.id}`}>{agent.name}</Link>
                {agent.isHouse && (
                  <span className="pill" style={{ marginLeft: 6 }}>
                    by Zolva
                  </span>
                )}
              </td>
              <td className="muted only-desktop">{STRATEGY_NAMES[agent.strategy]}</td>
              <td className="muted">{agent.tokens.map((token) => token.symbol).join(", ")}</td>
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
  const runner = ranked[1] ?? top;
  const lastDecision = top.result.runs[top.result.runs.length - 1]?.decisions[0];
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
          <div className={`closing__big ${tone(runner.result.returnPct)}`}>{percent(runner.result.returnPct)}</div>
          <div className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
            {STRATEGY_NAMES[runner.config.strategy]} on {runner.config.symbols.join(", ")}. Holding {percent(runner.holdReturnPct)}
          </div>
        </div>
        <div className="closing__card closing__card--mid">
          <div className="closing__card-head">
            <img src="/img/icons/leaderboard.png" alt="" width={36} height={36} />
            <span>Versus holding</span>
          </div>
          <div className={`closing__big ${tone(top.result.returnPct - top.holdReturnPct)}`}>{points(top.result.returnPct - top.holdReturnPct)}</div>
          <div className="muted" style={{ fontSize: 13, lineHeight: "18px" }}>
            {top.config.name}, last 30 days
          </div>
        </div>
        <div className="closing__card closing__card--front">
          <div className="closing__card-head">
            <img src="/img/icons/agent.png" alt="" width={36} height={36} />
            <span>{top.config.name}</span>
          </div>
          <div className={`closing__big ${tone(top.result.returnPct)}`}>{percent(top.result.returnPct)}</div>
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

function SoonBadge() {
  return (
    <span className="next-card__badge">
      <span className="pulse" />
      Coming soon
    </span>
  );
}

/** Two upcoming features, each with a small preview of how it will look. Nothing here is live. */
function WhatsNext() {
  return (
    <div className="next-grid">
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
          <SoonBadge />
          <h3>Real money trading</h3>
          <p>Run your agent from your own wallet, with limits you set and a switch to stop it at any time. Paper trading stays free.</p>
        </div>
        <div className="next-card__foot">
          <i className="ph ph-hourglass-medium" />
          Now: designing safety limits and a legal review
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
          <SoonBadge />
          <h3>Crypto markets</h3>
          <p>Crypto tokens on Robinhood Chain, priced every hour from onchain pools. Same strategies, same rules, same honest track record.</p>
        </div>
        <div className="next-card__foot">
          <i className="ph ph-hourglass-medium" />
          Now: picking tokens with deep onchain liquidity
        </div>
      </article>
    </div>
  );
}
