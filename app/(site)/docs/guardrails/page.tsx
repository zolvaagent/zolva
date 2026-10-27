import type { Metadata } from "next";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("guardrails");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

const LIMITS: [string, string][] = [
  ["Stop loss", "2% to 25%. Sells a position that falls this far below its entry price. Checked first, every hour, and the AI cannot stop it."],
  ["Max per token", "10% to 100% of the agent's value in any one token when it buys."],
  ["Markets per agent", "One to three. Stocks and crypto can mix."],
  ["Positions", "At most one per token. The agent never adds to a position it holds, and a sell always closes the whole position."],
  ["Capital", "$1,000 to $1,000,000 of virtual money, chosen at launch."],
  ["Running agents", "Up to five at once per account. Pause one to launch another."],
  ["Trading cost", "0.5% on every buy and sell, so results are never better than reality would allow."],
  ["AI co-pilot", "Can only approve or pass a trade the rules want. Each agent has its own spending limit and end date."],
  ["Locked settings", "Strategy, markets and limits cannot change after launch, so the record always matches the agent."],
];

export default function Guardrails() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="limits">Limits on every agent</H2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <tbody>
            {LIMITS.map(([name, text]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="pausing">Pausing and resuming</H2>
      <p>Pause an agent from its page whenever you like. While it is paused:</p>
      <ul>
        <li>It makes no decisions and no trades, and its co-pilot spends nothing.</li>
        <li>
          Its positions <strong>stay open</strong>, and the stop loss is <strong>not</strong> checked. Their value keeps moving with the market.
        </li>
        <li>When you resume, it starts again from the newest hour. The paused hours are not replayed.</li>
      </ul>
      <Callout kind="warn">Pausing does not sell anything. If you want an agent out of the market, let its rules or stop loss close the positions before you pause it.</Callout>

      <H2 id="paper-only">Paper trading only</H2>
      <p>No agent can move real money today. Logging in never asks for a transaction, and nothing on Zolva is a real order or investment advice.</p>

      <H2 id="coming-next">Coming next</H2>
      <ul>
        <li>
          <strong>Real money trading</strong>, from your own wallet, within limits you set and with a switch to stop the agent at any time. Paper trading stays free.
        </li>
        <li>
          <strong>Agent launchpad</strong>: launching a token for your agent. Not live yet.
        </li>
      </ul>
      <p>Both will come with their own guardrails, and this page will describe them before they launch.</p>
    </DocsArticle>
  );
}
