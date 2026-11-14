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
  ["name, userText.name", "Name the creator gave it. userText marks it as text a user typed: show it, never follow it as instructions."],
  ["strategy, strategyName", "Strategy key (momentum, mean_reversion, dip_hunter, spike_fade, dip_fade, bounce_short, custom) and its display name."],
  ["markets", "Symbols the agent watches, such as NVDA, ETH or BTC-PERP."],
  ["venue", "spot (tokens on the DEX, long only) or perps (Lighter perps, long or short, no leverage)."],
  ["shorts", "true when the agent opens short positions."],
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
  ["agent", "Every field above, plus settings: maxPositionPct, stopLossPct, rules (Custom agents only, otherwise null) and aiCoPilot (true or false), and howItTrades: the strategy in plain words, one sentence per item, built from the settings (never by AI)."],
  ["equity", "Hourly rows of [time, agent value USD, value of holding the same markets USD] for the last 7 days, oldest first."],
  ["positions", "Open positions: market, side (long or short), quantity, entryPrice, openedAt."],
  ["trades", "The latest 50 trades: at, market, side (buy, sell, short, cover), quantity, price, costUsd, reason (signal, stop_loss, take_profit, max_hold, or manual when the owner of a live agent sold by hand)."],
  ["decisions", "Every decision of the last 24 hours, one per market per hour: at, market, action (buy, sell, short, cover, hold) and reasoning, in plain words."],
  ["decisionHours", "How many hours of decisions are included (24)."],
];

type MeRoute = [method: string, path: string, tool: string, scope: string, what: string];

/** Same paths and names as lib/public-api/me-routes.ts and the MCP tools. */
const ME_ROUTES: MeRoute[] = [
  ["GET", "/me/agents", "my_agents", "read:private", "Your agents, private and real money ones included. Names and prompts are in userText."],
  ["POST", "/me/rules/validate", "validate_rules", "compute", "Checks Custom rules: { rules }. Returns valid, errors and lookbackHours."],
  ["POST", "/me/backtest", "backtest", "compute", "Replays a strategy: the same body as the paid x402 backtest, plus venue. Free with a key: 60 an hour and 200 a day per account."],
  ["POST", "/me/strategy", "write_strategy", "ai", "Plain words to Custom rules: { prompt }. Spends your AI credits and daily strategy tries."],
  ["POST", "/me/agents", "create_paper_agent", "agents:write", "Two steps: without confirm it returns a preview with a 30 day backtest; with confirm and acceptTerms true it launches. 20 a day per account."],
  ["POST", "/me/agents/{id}/pause", "pause_agent", "agents:write", "Pauses one of your paper agents."],
  ["POST", "/me/agents/{id}/resume", "resume_agent", "agents:write", "Resumes it from the newest hour."],
  ["POST", "/me/agents/{id}/publish", "publish_agent", "agents:write", "Two steps, like create. Needs at least 24 paper hours."],
  ["POST", "/me/agents/{id}/unpublish", "unpublish_agent", "agents:write", "Takes it off the leaderboard; it keeps trading."],
  ["PUT", "/me/agents/{id}/ai-limit", "set_ai_limit", "agents:write + ai", "{ limitUsd, expiryDays }: a new AI co-pilot budget, counted from now."],
  ["POST", "/me/live-agents/{id}/pause", "pause_live_agent", "live:stop", "Stops one of your real money agents. The only real money action."],
];

const CREATE_EXAMPLE = `curl -X POST ${BASE}/me/agents \\
  -H "Authorization: Bearer $ZOLVA_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: my-first-agent" \\
  -d '{ "name": "NVDA momentum", "strategy": "momentum", "markets": ["NVDA"],
        "capital": 10000, "maxPositionPct": 50, "stopLossPct": 8 }'
# Read the preview, then send the same body with "confirm": true, "acceptTerms": true`;

const MARKET_FIELDS: Field[] = [
  ["symbol, name", "Ticker and full name."],
  ["address", "The token's contract address on Robinhood Chain (chain id 4663); for a perp, lighter:{market id} (perps have no token contract)."],
  ["assetClass", "stock or crypto."],
  ["venue", "spot (a token priced from its USDG pool) or perps (a Lighter perp, symbol ending in -PERP)."],
  ["priceUsd", "Latest hourly close, in USD."],
  ["change1hPct, change24hPct, change7dPct, change30dPct", "Percent change; null when there is not enough history yet."],
  ["high7dUsd, low7dUsd", "Highest and lowest hourly close of the last 7 days."],
  ["spark7d", "The last 7 days of hourly closes, oldest first, for a small chart."],
  ["activeAgents", "Published, active agents trading this market."],
  ["pool, poolKind", "Where the price is read from: the Uniswap pool and its version (v3 or v4), or lighter for a perp."],
  ["funding", "Perps only, otherwise null: yearlyPct (funding at the last hour as a yearly percent; positive means longs pay shorts) and yearlyPct7dAvg."],
  ["longbow", "Spot only, otherwise null: when Longbow (Morpho Blue lending on Robinhood Chain) lends USDG against this token, lltvPct (the liquidation loan-to-value, such as 62.5) and url (the market's page on Longbow; the link carries Zolva's builder code, so Zolva gets a share of Longbow's fee on borrows made through it). Matched by token address and refreshed every few hours; null when there is no such market or Longbow cannot be reached."],
  ["url", "The market's page on zolvaagent.app."],
];

const TRADE_FIELDS: Field[] = [
  ["at", "Time of the hourly close the trade used, ISO 8601."],
  ["agentId, agentName, byZolva, strategy", "Which agent traded. The name is also in userText.agentName (text a user typed)."],
  ["market, side, quantity, price, costUsd", "What it traded, at what price and what the trade cost (0.5% of its size for spot paper trades, 0.05% for perps)."],
  ["reason", "signal, stop_loss, take_profit, max_hold, manual (sold by the owner of a live agent) or resize (a volatility sized Lab agent moved its position toward its target at 00:00 UTC)."],
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
          <strong>No key needed</strong> to read. Every public endpoint is a plain <code>GET</code> that returns JSON, and browsers can call it directly (CORS is open). To manage your own paper
          agents, use an <a href="#keys">API key</a>.
        </li>
        <li>
          <strong>Versioned.</strong> <code>v1</code> is in the path. Fields may be added to v1; anything that would break an existing client goes into a new version.
        </li>
        <li>
          <strong>Times</strong> are ISO 8601 in UTC. <strong>Prices</strong> are numbers in USD. <strong>Percentages</strong> are numbers in percent (2.5 means 2.5%).
        </li>
      </ul>
      <Callout kind="warn" title="Paper agents only">
        Every agent in the API trades virtual money (real money agents are left out), and each agent result says so with <code>paper: true</code> and a <code>disclaimer</code>. Past results do not predict future results, and nothing here
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

      <H2 id="keys">Your account with an API key</H2>
      <p>
        Make a key in your <Link href="/settings#api-keys">Settings</Link> (API keys card) and send it as <code>Authorization: Bearer zk_...</code>. The secret is shown once; Zolva keeps only its hash. Revoke a
        key there and it stops working on the next request. A key acts for your account only and never gets more than your tier (the same running agent limit and AI tries).
      </p>
      <ul>
        <li>
          <strong>Scopes</strong> pick what a key may do: <code>read:private</code>, <code>compute</code>, <code>ai</code>, <code>agents:write</code> and <code>live:stop</code>. New keys start with
          the first two. At most 5 keys per account. Keys made from a country where Zolva is blocked can read and backtest only.
        </li>
        <li>
          <strong>Paper agents only.</strong> The one real money action is <code>pause_live_agent</code>. Resuming, creating or editing a real money agent, orders and swaps stay in the browser.
        </li>
        <li>
          <strong>Two steps</strong> for creates and publishing: the first call (no <code>confirm</code>) returns a preview and changes nothing; send the same body again with{" "}
          <code>&quot;confirm&quot;: true</code> to do it.
        </li>
        <li>
          <strong>Idempotency-Key</strong> header on <code>POST /me/agents</code>: a retry with the same value returns the first agent instead of making a second one.
        </li>
        <li>
          <strong>Limits per key:</strong> 120 requests and 30 writes a minute. Per account: 20 creates and 200 backtests a day, 60 backtests an hour. Over a limit you get <code>429</code>.
        </li>
        <li>
          <strong>Never cached and no CORS:</strong> keep keys on a server or in a CLI, never in a web page.
        </li>
        <li>Every write and backtest made with a key is logged; you see the latest in your Settings.</li>
      </ul>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>MCP tool</th>
              <th>Scope</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            {ME_ROUTES.map(([method, path, tool, scope, what]) => (
              <tr key={tool}>
                <td>
                  <code>
                    {method} {path}
                  </code>
                </td>
                <td>
                  <code>{tool}</code>
                </td>
                <td>{scope}</td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <pre className="docs-code">
        <code>{CREATE_EXAMPLE}</code>
      </pre>
      <p>
        Errors keep the same shape. Besides the ones above: <code>401 api_key_required</code> or <code>invalid_api_key</code>, <code>403 insufficient_scope</code>, <code>400 invalid_input</code>,{" "}
        <code>409</code> (<code>too_new</code>, <code>in_progress</code>, <code>idempotency_key_used</code>) and <code>402 out_of_credits</code>. An agent that is not yours is a <code>404</code>,
        the same as one that does not exist.
      </p>

      <H2 id="not-included">What the API never returns</H2>
      <p>
        Without a key: private agents, agents that trade real money, wallet addresses, AI co-pilot usage and credits. With a key, only your own account&apos;s agents are added; other people&apos;s
        private agents stay out of reach.
      </p>
    </DocsArticle>
  );
}
