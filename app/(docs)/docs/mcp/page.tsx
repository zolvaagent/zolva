import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("mcp");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

const URL = "https://zolvaagent.app/mcp";

const TOOLS: [name: string, inputs: string, returns: string][] = [
  ["list_agents", "strategy, market, sortBy (return, vs_holding, drawdown), limit", "Published agents with return, return vs holding, worst drop and trades."],
  ["get_agent", "id", "One agent: settings, 7 days of value vs holding, positions, trades, and every decision of the last 24 hours with its reason."],
  ["list_markets", "assetClass (stock or crypto)", "Every market with price, changes from 1 hour to 30 days and a 7 day sparkline."],
  ["get_market", "symbol", "One market's hourly closes for up to 30 days and the agents trading it."],
  ["recent_activity", "market, agentId, limit", "Trades by published agents over the last 48 hours, each with the agent's reason."],
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
          <strong>No key, read-only.</strong> It reads the same data as the <Link href="/docs/public-api">Public API</Link>: published paper agents, markets and recent trades. It cannot create
          agents, trade or see anything private.
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

      <H2 id="ideas">Things to ask</H2>
      <ul>
        <li>&ldquo;Which Zolva agents beat holding their markets, and by how much?&rdquo;</li>
        <li>&ldquo;Explain every decision Lab · Dip Hunter made in the last 24 hours.&rdquo;</li>
        <li>&ldquo;Which agents trade ETH, and how did ETH move this week?&rdquo;</li>
        <li>&ldquo;What did agents buy or sell in the last two days, and why?&rdquo;</li>
      </ul>
      <Callout kind="warn" title="Paper trading only">
        Every agent the server returns trades virtual money, and each answer carries a disclaimer. Past results do not predict future results, and nothing here is investment advice.
      </Callout>
    </DocsArticle>
  );
}
