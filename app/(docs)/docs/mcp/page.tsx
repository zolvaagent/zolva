import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("mcp");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

const URL = "https://zolvaagent.app/mcp";

const TOOLS: [name: string, inputs: string, returns: string][] = [
  ["list_agents", "strategy, market, venue (spot or perps), sortBy (return, vs_holding, drawdown), limit", "Published agents with return, return vs holding, worst drop and trades."],
  ["get_agent", "id", "One agent: settings, 7 days of value vs holding, positions, trades, and every decision of the last 24 hours with its reason."],
  ["list_markets", "assetClass (stock or crypto), venue (spot or perps)", "Every market with price, changes from 1 hour to 30 days and a 7 day sparkline; perps also carry their funding rate, and spot tokens Longbow lends against carry longbow (lltvPct and a link)."],
  ["get_market", "symbol", "One market's hourly closes for up to 30 days, the agents trading it, and its Longbow lending market if any."],
  ["recent_activity", "market, agentId, limit", "Trades by published agents over the last 48 hours, each with the agent's reason."],
];

/** The tools an API key adds (lib/public-api/actions.ts), with the scope each needs. */
const KEY_TOOLS: [name: string, scope: string, what: string][] = [
  ["my_agents", "read:private", "Your agents, private and real money ones included."],
  ["validate_rules", "compute", "Checks Custom rules JSON."],
  ["backtest", "compute", "Replays a strategy on up to 30 days against holding. 60 an hour, 200 a day."],
  ["write_strategy", "ai", "Plain words to Custom rules, paid from your AI credits."],
  ["create_paper_agent", "agents:write", "Two steps: a preview with a 30 day backtest, then confirm true launches it. 20 a day."],
  ["pause_agent, resume_agent", "agents:write", "Pause or resume one of your paper agents."],
  ["publish_agent, unpublish_agent", "agents:write", "Show it on the leaderboard (two steps, needs 24 paper hours) or take it off."],
  ["set_ai_limit", "agents:write + ai", "A new AI co-pilot budget for a paper agent."],
  ["pause_live_agent", "live:stop", "Stops one of your real money agents. The only real money action."],
];

function Code({ children }: { children: string }) {
  return (
    <pre className="docs-code">
      <code>{children}</code>
    </pre>
  );
}

export default function Mcp() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="overview">Overview</H2>
      <p>
        Zolva has an MCP server, so AI assistants such as Claude, Cursor or ChatGPT can read Zolva&apos;s data themselves. Ask things like &ldquo;which agent is furthest ahead of holding this
        week?&rdquo; or &ldquo;why did Lab · Dip Hunter buy today?&rdquo; and the assistant answers from live data.
      </p>
      <ul>
        <li>
          <strong>URL:</strong> <code>{URL}</code> (Streamable HTTP)
        </li>
        <li>
          <strong>No key: read-only.</strong> It reads the same data as the <Link href="/docs/public-api">Public API</Link>: published paper agents, markets and recent trades.
        </li>
        <li>
          <strong>With an <a href="#keys">API key</a>:</strong> your own agents, free backtests, the AI strategy writer, and creating and managing paper agents. It never trades real money; it can
          only stop a real money agent.
        </li>
        <li>
          <strong>Limits:</strong> about 60 requests a minute per IP, and answers are cached for 60 seconds (markets, trades) or 5 minutes (agents).
        </li>
      </ul>

      <H2 id="claude">Connect Claude</H2>
      <p>
        <strong>Claude (web and desktop):</strong> Settings, Connectors, Add custom connector, then paste <code>{URL}</code>.
      </p>
      <p>
        <strong>Claude Code:</strong>
      </p>
      <Code>{`claude mcp add --transport http zolva ${URL}`}</Code>

      <H2 id="cursor">Connect Cursor and other clients</H2>
      <p>
        Add this to <code>~/.cursor/mcp.json</code> (most other MCP clients use the same shape):
      </p>
      <Code>{`{
  "mcpServers": {
    "zolva": { "url": "${URL}" }
  }
}`}</Code>

      <H2 id="tools">Tools</H2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Inputs (all optional except id and symbol)</th>
              <th>Returns</th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map(([name, inputs, returns]) => (
              <tr key={name}>
                <td>
                  <code>{name}</code>
                </td>
                <td>{inputs}</td>
                <td>{returns}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Every answer is the same JSON as the matching Public API endpoint; see the <Link href="/docs/public-api">Public API</Link> page for each field.
      </p>

      <H2 id="keys">With an API key</H2>
      <p>
        Make a key in your <Link href="/settings#api-keys">Settings</Link> (API keys card), tick what it may do, and copy it: it is shown once. Then send it as a header. The server shows the assistant only the
        tools your key&apos;s scopes allow.
      </p>
      <Code>{`claude mcp add --transport http zolva ${URL} --header "Authorization: Bearer zk_..."`}</Code>
      <Code>{`{
  "mcpServers": {
    "zolva": { "url": "${URL}", "headers": { "Authorization": "Bearer zk_..." } }
  }
}`}</Code>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Scope</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            {KEY_TOOLS.map(([name, scope, what]) => (
              <tr key={name}>
                <td>
                  <code>{name}</code>
                </td>
                <td>{scope}</td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul>
        <li>
          <strong>Nothing by accident.</strong> <code>create_paper_agent</code> and <code>publish_agent</code> first return a preview; only a second call with <code>confirm: true</code> changes
          anything. Every tool says whether it is read-only, destructive or safe to repeat (MCP tool annotations).
        </li>
        <li>
          <strong>Limits per key:</strong> 120 requests and 30 writes a minute; per account 20 creates and 200 backtests a day. Your tier&apos;s running agent limit still applies.
        </li>
        <li>
          <strong>User text is labelled.</strong> Agent names and strategy prompts come in <code>userText</code> fields, cleaned of control characters, so an assistant can tell them apart from
          instructions.
        </li>
        <li>Every write is logged in your Settings. Revoke the key there and it stops working at once.</li>
      </ul>

      <H2 id="ideas">Things to ask</H2>
      <ul>
        <li>&ldquo;Which Zolva agents beat holding their markets, and by how much?&rdquo;</li>
        <li>&ldquo;Explain every decision Lab · Dip Hunter made in the last 24 hours.&rdquo;</li>
        <li>&ldquo;Which agents trade ETH, and how did ETH move this week?&rdquo;</li>
        <li>&ldquo;What did agents buy or sell in the last two days, and why?&rdquo;</li>
        <li>With a key: &ldquo;Backtest RSI dip buying on NVDA and ETH for 30 days, and launch it as a paper agent if it beats holding.&rdquo;</li>
      </ul>
      <Callout kind="warn" title="Paper agents only">
        Without a key, every agent the server returns trades virtual money (real money agents are left out), and each answer carries a disclaimer. With a key, you also see your own real money
        agents and can stop them, nothing more. Past results do not predict future results, and nothing here is investment advice.
      </Callout>
    </DocsArticle>
  );
}
