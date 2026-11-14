import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";
import { rulesLookback } from "@/lib/engine/rules";
import { AGENT_SETTING_ROWS, ERROR_ROWS, EXAMPLE_NOTES, EXAMPLE_RULES, INDICATOR_ROWS, LIMIT_ROWS, OPERATOR_ROWS, RULE_FIELD_ROWS } from "@/lib/docs-reference/rules";

const page = docPage("rules");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

const VALIDATE_EXAMPLE = `curl -X POST https://zolvaagent.app/api/public/v1/me/rules/validate \\
  -H "Authorization: Bearer $ZOLVA_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "rules": ${JSON.stringify(EXAMPLE_RULES)} }'`;

const SHAPE = `{
  "entry": { "join": "all" | "any", "conditions": [ condition, ... ] },
  "exit":  { "join": "all" | "any", "conditions": [ condition, ... ] },
  "takeProfitPct": number | null,
  "maxHoldHours": number | null
}

condition = { "left": indicator, "op": operator, "right": indicator | value }
indicator = { "kind": "sma", "hours": 48, "offsetPct": -2 }
value     = { "kind": "value", "value": 30 }`;

export default function RulesSpec() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="overview">Overview</H2>
      <p>
        A Custom strategy is a small JSON object: a group of buy conditions, a group of sell conditions, and two optional exits. The Studio builds it for you; this page is for writing it by
        hand, from the <Link href="/docs/public-api">Public API</Link> or the <Link href="/docs/mcp">MCP server</Link>. The same check runs everywhere, so rules that pass here pass in the
        Studio too.
      </p>
      <p>Every hour, for each market, the agent checks one group:</p>
      <ul>
        <li>
          <strong>No position:</strong> the <code>entry</code> group. If it is met, the agent buys.
        </li>
        <li>
          <strong>Holding a position:</strong> the <code>exit</code> group. If it is met, the agent sells. The stop loss, the take profit and the max holding time are checked as well, whatever
          the group says.
        </li>
      </ul>
      <pre className="docs-code">
        <code>{SHAPE}</code>
      </pre>

      <H2 id="example">Full example</H2>
      <p>RSI dip buying with a trend filter. It passes the check as it is, so you can paste it into a validate call.</p>
      <pre className="docs-code">
        <code>{JSON.stringify(EXAMPLE_RULES, null, 2)}</code>
      </pre>
      <ol>
        {EXAMPLE_NOTES.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ol>
      <pre className="docs-code">
        <code>{VALIDATE_EXAMPLE}</code>
      </pre>
      <p>
        The answer is <code>{`{ "valid": true, "rules": {...}, "lookbackHours": ${rulesLookback(EXAMPLE_RULES)}, "errors": [] }`}</code>, or <code>valid: false</code> with the list of errors below.{" "}
        <code>lookbackHours</code> is how much history the rules need before the first decision.
      </p>

      <H2 id="fields">Fields</H2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            {RULE_FIELD_ROWS.map((row) => (
              <tr key={row.path}>
                <td>
                  <code>{row.path}</code>
                </td>
                <td>{row.type}</td>
                <td>{row.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="indicators">Indicators</H2>
      <p>
        The <code>kind</code> of a side. Price lines (unit USD) can only be compared with other price lines; everything else is compared with a <code>value</code>.
      </p>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>kind</th>
              <th>What it measures</th>
              <th>hours</th>
              <th>Unit</th>
              <th>Compare with</th>
            </tr>
          </thead>
          <tbody>
            {INDICATOR_ROWS.map((row) => (
              <tr key={row.kind}>
                <td>
                  <code>{row.kind}</code>
                  <br />
                  {row.label}
                </td>
                <td>{row.text}</td>
                <td>{row.periods}</td>
                <td>{row.unit}</td>
                <td>{row.comparesWith}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="operators">Operators</H2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>op</th>
              <th>Studio label</th>
              <th>True when</th>
            </tr>
          </thead>
          <tbody>
            {OPERATOR_ROWS.map((row) => (
              <tr key={row.op}>
                <td>
                  <code>{row.op}</code>
                </td>
                <td>{row.label}</td>
                <td>{row.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Callout kind="tip" title="above or crossesAbove?">
        <code>above</code> stays true for as long as the condition holds, so an exit with it fires at once. <code>crossesAbove</code> fires in one hour only, which suits entries: it buys the
        breakout, not every hour after it.
      </Callout>

      <H2 id="agent-settings">Agent settings next to the rules</H2>
      <p>
        Markets, venue, stop loss and position size are not part of the rules object. They are set when the agent is made (<code>POST /me/agents</code> or{" "}
        <code>create_paper_agent</code>) and in a backtest.
      </p>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            {AGENT_SETTING_ROWS.map((row) => (
              <tr key={row.name}>
                <td>
                  <code>{row.name}</code>
                </td>
                <td>{row.type}</td>
                <td>{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        The stop loss always applies: a position that falls this far below its entry price is sold that hour. See <Link href="/docs/guardrails">Guardrails</Link> for every other limit.
      </p>

      <H2 id="limits">Limits</H2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Limit</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {LIMIT_ROWS.map(([limit, value]) => (
              <tr key={limit}>
                <td>{limit}</td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="errors">Error messages</H2>
      <p>
        The check returns every problem at once, in plain words. These are all of them. Through the API they come back in <code>errors</code> (validate) or in the{" "}
        <code>400 invalid_input</code> message (backtest, create).
      </p>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Message</th>
              <th>Cause</th>
              <th>Fix</th>
            </tr>
          </thead>
          <tbody>
            {ERROR_ROWS.map((row) => (
              <tr key={row.key}>
                <td className="docs-table__wrap">
                  {row.messages.map((message) => (
                    <code key={message} className="docs-message">
                      {message}
                    </code>
                  ))}
                </td>
                <td>{row.cause}</td>
                <td>{row.fix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Callout kind="warn" title="Rules are not advice">
        Passing the check means the rules can run, not that they make money. Backtest them against holding first; see <Link href="/docs/backtests">Backtests</Link>.
      </Callout>
    </DocsArticle>
  );
}
