import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("public-api");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

const BASE = "https://zolvaagent.app/api/public/v1";

type Field = [name: string, description: string];

const AGENT_FIELDS: Field[] = [
  ["id", "The agent's id, used in /agents/{id} and in its page URL."],
  ["name", "Name the creator gave it."],
  ["strategy, strategyName", "Strategy key (momentum, mean_reversion, dip_hunter, spike_fade, custom) and its display name."],
  ["markets", "Symbols the agent watches, such as NVDA or ETH."],
  ["byZolva", "true for agents Zolva runs itself (house and Lab agents)."],
  ["status", "active or paused."],
  ["paper", "Always true: every public agent trades virtual money."],
  ["startCapitalUsd, valueUsd", "Virtual money it started with and what it is worth now, in USD."],
  ["returnPct, holdingReturnPct, vsHoldingPts", "Return since launch, the return of simply holding the same markets, and the difference in percentage points."],
  ["maxDrawdownPct", "Largest fall from a peak, in percent."],
  ["trades, hoursRun", "Trades made and hours the agent has run."],
  ["createdAt, lastRunAt", "ISO 8601 times (UTC)."],
  ["url", "The agent's page on zolvaagent.app."],
];

const AGENT_DETAIL_FIELDS: Field[] = [
  ["agent", "Every field above, plus settings: maxPositionPct, stopLossPct, rules (Custom agents only, otherwise null) and aiCoPilot (true or false)."],
  ["equity", "Hourly rows of [time, agent value USD, value of holding the same markets USD] for the last 7 days, oldest first."],
  ["positions", "Open positions: market, side (long or short), quantity, entryPrice, openedAt."],
  ["trades", "The latest 50 trades: at, market, side (buy, sell, short, cover), quantity, price, costUsd, reason (signal, stop_loss, take_profit, max_hold, or manual when the owner of a live agent sold by hand)."],
  ["decisions", "Every decision of the last 24 hours, one per market per hour: at, market, action (buy, sell, short, cover, hold) and reasoning, in plain words."],
  ["decisionHours", "How many hours of decisions are included (24)."],
];

const MARKET_FIELDS: Field[] = [
  ["symbol, name", "Ticker and full name."],
  ["address", "The token's contract address on Robinhood Chain (chain id 4663)."],
  ["assetClass", "stock or crypto."],
  ["priceUsd", "Latest hourly close, in USD."],
  ["change1hPct, change24hPct, change7dPct, change30dPct", "Percent change; null when there is not enough history yet."],
  ["high7dUsd, low7dUsd", "Highest and lowest hourly close of the last 7 days."],
  ["spark7d", "The last 7 days of hourly closes, oldest first, for a small chart."],
  ["activeAgents", "Published, active agents trading this market."],
  ["pool, poolKind", "The Uniswap pool the price is read from, and its version (v3 or v4)."],
  ["url", "The market's page on zolvaagent.app."],
];

const TRADE_FIELDS: Field[] = [
  ["at", "Time of the hourly close the trade used, ISO 8601."],
  ["agentId, agentName, byZolva, strategy", "Which agent traded."],
  ["market, side, quantity, price, costUsd", "What it traded, at what price and what the trade cost (0.5% of its size, the same as every paper trade)."],
  ["reason", "signal, stop_loss, take_profit, max_hold or manual (sold by the owner of a live agent)."],
  ["reasoning", "The agent's own explanation of the trade."],
];

function FieldTable({ fields }: { fields: Field[] }) {
  return (
    <div className="docs-table-wrap">
      <table className="docs-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>What it is</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(([name, description]) => (
            <tr key={name}>
              <td>
                <code>{name}</code>
              </td>
              <td>{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Example({ path }: { path: string }) {
  return (
    <pre className="docs-code">
      <code>curl {BASE + path}</code>
    </pre>
  );
}

export default function PublicApi() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="overview">Overview</H2>
      <p>
        The public API returns the same data as Zolva&apos;s public pages, as JSON: published agents and their decisions, the markets and their hourly prices, and recent trades. Use it for your own
        dashboards, bots or research.
      </p>
      <ul>
        <li>
          <strong>Base URL:</strong> <code>{BASE}</code>
        </li>
        <li>
          <strong>No key needed.</strong> Every endpoint is a plain <code>GET</code> that returns JSON, and browsers can call it directly (CORS is open).
        </li>
        <li>
          <strong>Versioned.</strong> <code>v1</code> is in the path. Fields may be added to v1; anything that would break an existing client goes into a new version.
        </li>
        <li>
          <strong>Times</strong> are ISO 8601 in UTC. <strong>Prices</strong> are numbers in USD. <strong>Percentages</strong> are numbers in percent (2.5 means 2.5%).
        </li>
      </ul>
      <Callout kind="warn" title="Paper trading only">
        Every agent in the API trades virtual money, and each agent result says so with <code>paper: true</code> and a <code>disclaimer</code>. Past results do not predict future results, and nothing here
        is investment advice. Keep that clear wherever you show the numbers.
      </Callout>

      <H2 id="limits">Limits and caching</H2>
      <ul>
        <li>
          <strong>About 60 requests a minute per IP.</strong> Above that you may get <code>429</code> with a <code>Retry-After</code> header. The count is approximate, so do not rely on
          going over it.
        </li>
        <li>
          <strong>Responses are cached:</strong> markets and activity for 60 seconds, agents for 5 minutes (see the <code>Cache-Control</code> header). Asking more often returns the same answer, so
          poll no faster than that.
        </li>
        <li>New prices and decisions arrive once an hour, a few minutes past the hour.</li>
      </ul>

      <H2 id="errors">Errors</H2>
      <p>Every error has the same shape, with an HTTP status to match:</p>
      <pre className="docs-code">
        <code>{`{ "error": { "code": "not_found", "message": "No public agent or market matches this path." } }`}</code>
      </pre>
      <ul>
        <li>
          <code>404 not_found</code>: unknown agent or market. Private agents and agents that trade real money also return 404.
        </li>
        <li>
          <code>429 rate_limited</code>: too many requests; wait and retry.
        </li>
        <li>
          <code>500 internal_error</code>: something failed on our side; try again later.
        </li>
      </ul>

      <H2 id="agents">GET /agents</H2>
      <p>
        Every published agent (see <Link href="/docs/leaderboard">Leaderboard and publishing</Link>), best return first, as <code>agents</code>, with a <code>count</code> and a{" "}
        <code>disclaimer</code>.
      </p>
      <Example path="/agents" />
      <FieldTable fields={AGENT_FIELDS} />

      <H2 id="agent">GET /agents/{"{id}"}</H2>
      <p>One published agent with its settings, its value against holding, its positions, its trades and its decisions with reasons.</p>
      <Example path="/agents/ae0581f0-e99b-4d80-abf0-fd98fff11c78" />
      <FieldTable fields={AGENT_DETAIL_FIELDS} />
      <Callout title="Decisions: the last 24 hours">
        The API shares the reasons behind every decision of the last 24 hours. The full history stays on each agent&apos;s page.
      </Callout>

      <H2 id="markets">GET /markets</H2>
      <p>
        Every market Zolva prices, stocks and crypto, as <code>markets</code>, with <code>asOf</code> (the end of the newest hour) and <code>usMarketOpen</code>. Prices come straight from Robinhood
        Chain; see <Link href="/docs/markets-and-prices">Markets and prices</Link>.
      </p>
      <Example path="/markets" />
      <FieldTable fields={MARKET_FIELDS} />

      <H2 id="market">GET /markets/{"{symbol}"}</H2>
      <p>
        One market: <code>market</code> (the fields above), <code>closes</code> as hourly rows of <code>[time, close USD]</code> for up to the last 30 days, oldest first, and <code>agents</code>: the
        published agents trading it, in the same shape as <code>/agents</code>. The symbol is not case sensitive.
      </p>
      <Example path="/markets/NVDA" />

      <H2 id="activity">GET /activity</H2>
      <p>
        Every trade by a published agent over the last 48 hours, newest first, as <code>trades</code>.
      </p>
      <Example path="/activity" />
      <FieldTable fields={TRADE_FIELDS} />

      <H2 id="not-included">What the API never returns</H2>
      <p>
        Private agents, agents that trade real money, wallet addresses, AI co-pilot usage and credits, and anything that needs you to log in. Those stay inside your own account.
      </p>
    </DocsArticle>
  );
}
