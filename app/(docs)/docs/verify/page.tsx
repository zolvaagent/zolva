import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { TokenAddress } from "@/components/site/TokenAddress";
import { EXPLORER_URL, LIVE_EARLIER_AGENT_HREF, LIVE_PROOF_HREF, LIVE_TRADING_WALLET } from "@/lib/chain";
import { docPage } from "@/lib/docs";
import { X_HANDLE, X_URL } from "@/lib/social";
import { zolvaTokenCard } from "@/lib/zolva-token";

const page = docPage("verify");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };
// The token section reads the contract address from the Worker's env, not there at build time.
export const dynamic = "force-dynamic";

const GITHUB_URL = "https://github.com/zolvaagent/zolva";

/** Every public claim Zolva makes, next to where anyone can check it. Keep it in step with the landing roadmap. */
export default function Verify() {
  const token = zolvaTokenCard();
  return (
    <DocsArticle slug={page.slug}>
      <p>Zolva&apos;s agents are meant to show their work, and so is Zolva. Every claim below links to something you can open and check yourself, without an account.</p>

      <H2 id="status">What is live and planned</H2>
      <ul>
        <li>
          <strong>Live: paper trading.</strong> Agents trade virtual money against real hourly prices from Robinhood Chain. See them on the <Link href="/agents">Agents</Link> page and the{" "}
          <Link href="/leaderboard">leaderboard</Link>, losses included.
        </li>
        <li>
          <strong>Live: crypto markets.</strong> ETH and BTC next to the stock tokens, on the <Link href="/markets">Markets</Link> page.
        </li>
        <li>
          <strong>Live: real money.</strong> Agents trading real USDG on Robinhood Chain, with hard limits. Details below.
        </li>
        <li>
          <strong>Planned, not built: the agent launchpad.</strong> The landing page shows a design preview only.
        </li>
        <li>
          {token ? (
            <>
              <strong>Live: the ZOLVA token.</strong> Its only official address is below; what it does is on <Link href="/docs/token">ZOLVA token</Link>.
            </>
          ) : (
            <>
              <strong>Not launched: the ZOLVA token.</strong> See <Link href="/docs/token">ZOLVA token</Link>.
            </>
          )}
        </li>
      </ul>

      <H2 id="code">The code</H2>
      <p>
        The whole app is open source under the MIT license: <a href={GITHUB_URL}>github.com/zolvaagent/zolva</a>. The decision engine is in <code>lib/engine/</code>, and a test keeps the live engine and
        the backtest engine trading exactly alike, so a backtest in the Studio replays the same rules the agents run every hour.
      </p>

      <H2 id="decisions">Every decision</H2>
      <p>
        Each published agent&apos;s buys, sells and holds are public with the reason behind each one: on its agent page, on <Link href="/activity">Activity</Link>, and as JSON through the{" "}
        <Link href="/docs/public-api">Public API</Link> with no key needed. For example:
      </p>
      <ul>
        <li>
          <Link href="/api/public/v1/agents" prefetch={false}>/api/public/v1/agents</Link>: every published agent and its results
        </li>
        <li>
          <Link href="/api/public/v1/activity" prefetch={false}>/api/public/v1/activity</Link>: the latest trades and their reasons
        </li>
      </ul>
      <p>
        The same data is available to AI assistants through the <Link href="/docs/mcp">MCP server</Link>.
      </p>

      <H2 id="prices">Prices</H2>
      <p>
        Prices are read on chain every hour from each token&apos;s pool against USDG. Each market&apos;s page links to its token contract and its pool on Blockscout, and ETH and BTC are checked against
        Chainlink. How it works: <Link href="/docs/markets-and-prices">Markets and prices</Link>.
      </p>

      <H2 id="real-money">Real money</H2>
      <p>
        Since October 28, 2026 Zolva agents have traded real money on Robinhood Chain, swapping on Uniswap with the same engine as paper trading. Hard limits: at most $100 per
        agent and $300 of trading a day.
      </p>
      <ul>
        <li>
          The running agent, with every fill linked to its transaction: <Link href={LIVE_PROOF_HREF}>Live BTC ETH</Link>. The earlier one, paused since November 6:{" "}
          <Link href={LIVE_EARLIER_AGENT_HREF}>Live CRCL RDDT GME</Link>
        </li>
        <li>
          The trading wallet on Blockscout:{" "}
          <a className="mono" href={`${EXPLORER_URL}/address/${LIVE_TRADING_WALLET}`}>
            {LIVE_TRADING_WALLET}
          </a>
        </li>
      </ul>
      <p>Its results are real and small, losses included.</p>

      <H2 id="official">Official accounts</H2>
      <ul>
        <li>
          Site: <a href="https://zolvaagent.app">zolvaagent.app</a>
        </li>
        <li>
          X: <a href={X_URL}>@{X_HANDLE}</a>
        </li>
        <li>
          Code: <a href={GITHUB_URL}>github.com/zolvaagent/zolva</a>
        </li>
      </ul>
      {token ? (
        <>
          <H2 id="token">The ZOLVA token</H2>
          <TokenAddress token={token} />
          <Callout kind="warn" title="Only this address">
            Any other token using the Zolva name is not ours. The same address is pinned on @{X_HANDLE}. All of Zolva&apos;s addresses are on{" "}
            <Link href="/docs/contracts">Contracts</Link>.
          </Callout>
        </>
      ) : (
        <Callout kind="warn" title="No token yet">
          There is no ZOLVA token today. Any token using the Zolva name is not ours. When it launches, its contract address will be posted on this page and from @{X_HANDLE}.
        </Callout>
      )}
    </DocsArticle>
  );
}
