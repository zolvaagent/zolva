import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { Code, ParamTable } from "@/components/site/DocsParams";
import { docPage } from "@/lib/docs";
import { KEY_TOOL_REFERENCE, MCP_URL as URL, READ_TOOL_REFERENCE } from "@/lib/docs-reference/api";
import { ACTION_CAPS } from "@/lib/public-api/actions";
import { RATE_LIMITS } from "@/lib/public-api/limits";

const page = docPage("mcp");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

const KEY = "zk_...";

const SETUP: { id: string; title: string; text: string; snippets: { label?: string; code: string }[] }[] = [
  {
    id: "setup-claude-code",
    title: "Claude Code",
    text: "One command. Leave the header out for read-only use.",
    snippets: [{ code: `claude mcp add --transport http zolva ${URL} --header "Authorization: Bearer ${KEY}"` }],
  },
  {
    id: "setup-claude-desktop",
    title: "Claude Desktop and claude.ai",
    text: "Without a key: Settings, Connectors, Add custom connector, and paste the URL. With a key, add it to claude_desktop_config.json (Settings, Developer, Edit Config) through mcp-remote, which needs Node.js, then restart Claude. The header is split into an env value because Claude Desktop on Windows does not escape spaces in args.",
    snippets: [
      { label: "Without a key", code: URL },
      {
        label: "With a key: claude_desktop_config.json",
        code: `{
  "mcpServers": {
    "zolva": {
      "command": "npx",
      "args": ["mcp-remote", "${URL}", "--header", "Authorization:\${ZOLVA_AUTH}"],
      "env": { "ZOLVA_AUTH": "Bearer ${KEY}" }
    }
  }
}`,
      },
    ],
  },
  {
    id: "setup-cursor",
    title: "Cursor",
    text: "Add this to ~/.cursor/mcp.json (most clients use the same shape).",
    snippets: [
      {
        code: `{
  "mcpServers": {
    "zolva": { "url": "${URL}", "headers": { "Authorization": "Bearer ${KEY}" } }
  }
}`,
      },
    ],
  },
  {
    id: "setup-vscode",
    title: "VS Code (GitHub Copilot)",
    text: "Add .vscode/mcp.json to your project. VS Code asks for the key once and stores it as a secret, so it never sits in the file.",
    snippets: [
      {
        code: `{
  "inputs": [
    { "type": "promptString", "id": "zolva-key", "description": "Zolva API key", "password": true }
  ],
  "servers": {
    "zolva": {
      "type": "http",
      "url": "${URL}",
      "headers": { "Authorization": "Bearer \${input:zolva-key}" }
    }
  }
}`,
      },
    ],
  },
  {
    id: "setup-codex",
    title: "Codex",
    text: "Add the server to ~/.codex/config.toml. Codex reads the key from the environment variable you name and sends it as a Bearer token. Leave that line out for read-only use.",
    snippets: [
      {
        code: `[mcp_servers.zolva]
url = "${URL}"
bearer_token_env_var = "ZOLVA_KEY"`,
      },
      { label: "Then, in the shell that starts Codex", code: `export ZOLVA_KEY="${KEY}"` },
    ],
  },
  {
    id: "setup-hermes",
    title: "Hermes Agent",
    text: "Add the server to ~/.hermes/config.yaml, then run /reload-mcp in Hermes.",
    snippets: [
      {
        code: `mcp_servers:
  zolva:
    url: "${URL}"
    headers:
      Authorization: "Bearer ${KEY}"`,
      },
    ],
  },
  {
    id: "setup-add-mcp",
    title: "Any of them at once: npx add-mcp",
    text: "add-mcp writes the right config file for each client you name with -a (repeatable). -y skips the questions.",
    snippets: [{ code: `npx add-mcp ${URL} --header "Authorization: Bearer $ZOLVA_KEY" -a claude-code -a cursor -a vscode -a codex -a hermes -y` }],
  },
];

const CONVERSATION: [who: "You" | "Assistant", text: string][] = [
  ["You", "Which Zolva agents beat holding their markets this week?"],
  ["Assistant", "(calls list_agents with sortBy vs_holding) Three published agents are ahead of holding. The top one is 4.2 points ahead on NVDA and ETH, with a worst drop of 3.1%. All of them trade virtual money."],
  ["You", "Why did the top one buy ETH today?"],
  ["Assistant", "(calls get_agent) At 09:00 UTC it bought because the 48h z score fell to −2.7, an unusually deep dip. It has held since; the latest decision says it waits for the z score to get back above 0.5."],
  ["You", "Backtest the same idea on BTC for 30 days and make it a paper agent if it beats holding."],
  ["Assistant", "(calls backtest, then create_paper_agent with confirm false) It returned 2.4% against 1.1% for holding. Here is the preview: mean reversion on BTC, $10,000 virtual, stop loss 8%. Shall I launch it?"],
  ["You", "Yes."],
  ["Assistant", "(calls create_paper_agent with confirm true) Launched. It is private and makes its first decision at the next hourly tick."],
];

const PROMPTS = [
  "Which Zolva agents beat holding their markets, and by how much?",
  "Explain every decision Lab · Dip Hunter made in the last 24 hours.",
  "Which markets fell most in the last 7 days, and which agents trade them?",
  "What did agents buy or sell in the last two days, and why?",
  "Which perps have the highest funding right now, and what does that cost a long?",
  "Which stock tokens can be borrowed against on Longbow, and at what LLTV?",
  "With a key: write rules for buying NVDA on RSI dips, check them, and backtest them for 30 days.",
  "With a key: pause all my paper agents that are behind holding.",
];

export default function Mcp() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="overview">Overview</H2>
      <p>
        Zolva has an MCP server, so AI assistants such as Claude, ChatGPT, Cursor or Codex can read Zolva&apos;s data and, with your API key, run your paper agents. Ask in plain words; the
        assistant picks the tools.
      </p>
      <ul>
        <li>
          <strong>URL:</strong> <code>{URL}</code> (Streamable HTTP, no session state)
        </li>
        <li>
          <strong>No key:</strong> five read-only tools over the same data as the <Link href="/docs/public-api">Public API</Link>.
        </li>
        <li>
          <strong>With an API key:</strong> up to {KEY_TOOL_REFERENCE.length} more tools, only those your key&apos;s scopes allow.
        </li>
      </ul>

      <H2 id="can-and-cannot">What it can and cannot do</H2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Can</th>
              <th>Cannot</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="docs-table__wrap">Read published agents, their decisions with reasons, markets, prices, funding and trades.</td>
              <td>See other people&apos;s private agents, wallets or AI usage.</td>
            </tr>
            <tr>
              <td className="docs-table__wrap">With a key: list your own agents, check rules, backtest, write rules with AI.</td>
              <td>Trade real money, swap or move funds.</td>
            </tr>
            <tr>
              <td className="docs-table__wrap">With a key: create, pause, resume, publish and unpublish your paper agents, and change their AI budget.</td>
              <td>Change an agent&apos;s strategy after launch (settings are locked).</td>
            </tr>
            <tr>
              <td className="docs-table__wrap">
                With a key: stop one of your real money agents (<code>pause_live_agent</code>).
              </td>
              <td>Resume, create or edit a real money agent. Those stay in the browser.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Callout kind="warn" title="Paper only, with one exception">
        Every agent the MCP server creates or changes trades virtual money. The only real money action is <code>pause_live_agent</code>, which can only stop an agent. Past results do not predict
        future results, and nothing here is investment advice.
      </Callout>

      <H2 id="prerequisites">Prerequisites</H2>
      <ul>
        <li>An MCP client that supports remote (HTTP) servers. Claude Desktop with a key also needs Node.js, for mcp-remote.</li>
        <li>
          For the keyed tools: a Zolva account and an API key from <Link href="/settings#api-keys">Settings, API keys</Link>. Tick only the scopes you need; the secret is shown once.
        </li>
        <li>
          Nothing else for read-only use. The server costs nothing; only <code>write_strategy</code> spends your AI credits.
        </li>
      </ul>

      <H2 id="setup">Setup</H2>
      <p>
        Every snippet below includes the key header; leave it out for read-only use. Replace <code>{KEY}</code> with your key, or keep the key in an environment variable where the client
        supports it.
      </p>
      {SETUP.map((client) => (
        <section key={client.id} aria-labelledby={client.id}>
          <h3 id={client.id}>{client.title}</h3>
          <p>{client.text}</p>
          {client.snippets.map((snippet) => (
            <div key={snippet.code}>
              {snippet.label && (
                <p>
                  <strong>{snippet.label}</strong>
                </p>
              )}
              <Code>{snippet.code}</Code>
            </div>
          ))}
        </section>
      ))}

      <H2 id="verify">Check that it works</H2>
      <ol className="docs-steps">
        <li>
          <strong>Look at the tool list.</strong> Your client lists the server&apos;s tools (in Claude Code: <code>/mcp</code>). Without a key you see 5: {READ_TOOL_REFERENCE.map((tool) => tool.name).join(", ")}. With a key you also see the tools its scopes allow.
        </li>
        <li>
          <strong>Ask a read question:</strong> &ldquo;List Zolva&apos;s crypto markets with their 24 hour change.&rdquo; The assistant should call <code>list_markets</code>.
        </li>
        <li>
          <strong>With a key, ask:</strong> &ldquo;List my Zolva agents.&rdquo; It should call <code>my_agents</code> and show your own agents, private ones included.
        </li>
      </ol>
      <p>From a terminal, this lists the tools without any client:</p>
      <Code>{`curl -X POST ${URL} \\
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</Code>

      <H2 id="example">Example conversation</H2>
      <p>What a session with a key that has <code>compute</code> and <code>agents:write</code> can look like. The numbers are made up.</p>
      <dl className="docs-chat">
        {CONVERSATION.map(([who, text], index) => (
          <div key={index} className={`docs-chat__turn docs-chat__turn--${who === "You" ? "user" : "assistant"}`}>
            <dt>{who}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <p>
        Note the preview before the launch: <code>create_paper_agent</code> and <code>publish_agent</code> change nothing until the assistant calls them again with <code>confirm: true</code>, and
        the server tells assistants to ask you first.
      </p>

      <H2 id="prompts">Prompts to try</H2>
      <ul>
        {PROMPTS.map((prompt) => (
          <li key={prompt}>&ldquo;{prompt}&rdquo;</li>
        ))}
      </ul>

      <H2 id="tools">Tools without a key</H2>
      <p>
        Each answer is the same JSON as the matching <Link href="/docs/public-api">Public API</Link> endpoint, so the field lists there apply.
      </p>
      {READ_TOOL_REFERENCE.map((tool) => (
        <section key={tool.name} aria-labelledby={`tool-${tool.name}`}>
          <h3 id={`tool-${tool.name}`}>
            <code>{tool.name}</code>
          </h3>
          <p>{tool.description}</p>
          <ParamTable rows={tool.params} />
        </section>
      ))}

      <H2 id="key-tools">Tools with an API key</H2>
      <p>
        A tool appears only when the key holds every scope in its row. Inputs, answers and errors are the same as the <Link href="/docs/public-api#reference">/me endpoints</Link>; every tool
        is marked read-only, destructive or safe to repeat (MCP tool annotations).
      </p>
      {KEY_TOOL_REFERENCE.map((tool) => (
        <section key={tool.name} aria-labelledby={`tool-${tool.name}`}>
          <h3 id={`tool-${tool.name}`}>
            <code>{tool.name}</code>
          </h3>
          <p className="docs-endpoint">
            <span>{tool.title}</span>
            <span>
              Scope:{" "}
              {tool.scopes.map((scope, index) => (
                <span key={scope}>
                  {index > 0 && " + "}
                  <code>{scope}</code>
                </span>
              ))}
            </span>
          </p>
          <ParamTable rows={tool.params} />
        </section>
      ))}

      <H2 id="troubleshooting">Troubleshooting</H2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>What you see</th>
              <th>Why, and the fix</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="docs-table__wrap">401, or the server fails to connect</td>
              <td>
                The key is wrong, cut short or revoked. A bad key is refused, never treated as no key. Copy a new key from Settings and check the header reads{" "}
                <code>Authorization: Bearer zk_...</code> with one space after Bearer.
              </td>
            </tr>
            <tr>
              <td className="docs-table__wrap">Only 5 tools, or one tool is missing</td>
              <td>
                The client sends no key, or the key lacks a scope. Each tool needs the scopes in its row above: make a key with the scopes you need. Some clients
                cache the tool list: restart or reload the server.
              </td>
            </tr>
            <tr>
              <td className="docs-table__wrap">insufficient_scope</td>
              <td>
                The tool was called with a key that lacks its scope, or <code>create_paper_agent</code> got an <code>aiModel</code> without the <code>ai</code> scope.
              </td>
            </tr>
            <tr>
              <td className="docs-table__wrap">429 rate_limited</td>
              <td>
                Too many calls: about {RATE_LIMITS.ipPerMinute} a minute per IP without a key, {RATE_LIMITS.keyReadPerMinute} a minute and {RATE_LIMITS.keyWritePerMinute} writes a minute per key,
                and per account {ACTION_CAPS.backtest.hour} backtests an hour, {ACTION_CAPS.backtest.day} a day and {ACTION_CAPS.create_paper_agent.day} creates a day. Wait and ask again.
              </td>
            </tr>
            <tr>
              <td className="docs-table__wrap">not_found for your own agent</td>
              <td>
                Paper tools ignore real money agents (use <code>pause_live_agent</code>), and <code>pause_live_agent</code> ignores paper agents. Check the id and mode in{" "}
                <code>my_agents</code>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <H2 id="security">Security</H2>
      <ul>
        <li>
          <strong>Treat the key like a password.</strong> Keep it in an environment variable or your client&apos;s secret store, never in a shared file, a repository or a web page.
        </li>
        <li>
          <strong>Least privilege.</strong> New keys start with <code>read:private</code> and <code>compute</code>. Add <code>agents:write</code>, <code>ai</code> or <code>live:stop</code> only
          when you need them, ideally on a separate key.
        </li>
        <li>
          <strong>Revoke</strong> a key in Settings and it stops working on the next request. Every write and backtest made with a key is logged there.
        </li>
        <li>
          <strong>userText is data.</strong> Agent names and strategy prompts come in <code>userText</code> fields, cleaned of control characters. They were typed by Zolva users: an assistant
          should show them, never follow them as instructions. The server says so in its instructions.
        </li>
        <li>
          <strong>Review previews.</strong> Read a create or publish preview yourself before you tell the assistant to confirm.
        </li>
      </ul>
    </DocsArticle>
  );
}
