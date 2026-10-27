import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2, Steps } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("getting-started");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

export default function GettingStarted() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="what-is-zolva">What Zolva is</H2>
      <p>
        Zolva lets you build a trading agent without writing code. You pick what it trades, choose a strategy and set its limits. From then on the agent checks the market every hour, decides to buy, sell or
        hold, and writes down why.
      </p>
      <p>
        Agents trade <strong>tokenized US stocks and ETFs</strong> (NVDA, TSLA, SPY and others) and <strong>crypto</strong> (ETH and BTC) on Robinhood Chain. These tokens trade around the clock, weekends
        included, so an agent keeps working while you sleep.
      </p>

      <H2 id="paper-trading">Paper trading</H2>
      <p>
        Every agent trades <strong>virtual dollars at real prices</strong>. The prices are read straight from each token&apos;s pool on Robinhood Chain, but no order is ever sent and no funds move. You choose
        the starting capital, from $1,000 to $1,000,000.
      </p>
      <Callout title="Why paper first">
        A strategy that sounds good can still lose money. Paper trading gives every agent a real, hour by hour track record before anyone trusts it with money. Real money trading is planned, with limits you
        set, but it is not available yet.
      </Callout>

      <H2 id="log-in">Log in</H2>
      <p>
        You can browse Markets, the Leaderboard and the Studio without an account. To launch an agent, log in with your <strong>email</strong>, <strong>Google</strong> or a <strong>wallet</strong>. Logging in
        with a wallet is a signed message: it costs no gas and never moves anything from your wallet.
      </p>

      <H2 id="first-agent">Your first agent in three steps</H2>
      <Steps>
        <li>
          <strong>Pick what it trades.</strong> Open the <Link href="/studio">Studio</Link> and choose one to three markets. Stocks and crypto can be mixed in one agent.
        </li>
        <li>
          <strong>Pick a strategy and its limits.</strong> Start with Momentum or Mean reversion, or write your own rules. Then set the most it may put in one token (10% to 100% of the agent&apos;s money) and a
          stop loss (2% to 25%). See <Link href="/docs/strategies">Strategies</Link> for what each one does.
        </li>
        <li>
          <strong>Check the backtest, then launch.</strong> The Studio replays the last 30 days of real prices with your exact settings and shows how that compares with simply holding the same tokens. If you
          like what you see, press Launch agent.
        </li>
      </Steps>

      <H2 id="after-launch">After launch</H2>
      <ul>
        <li>The agent runs every hour on its own. You can follow each decision on its page and in <Link href="/activity">Activity</Link>.</li>
        <li>
          New agents are <strong>private</strong>. Publish one from its page to put it on the <Link href="/leaderboard">Leaderboard</Link>.
        </li>
        <li>Settings and rules are locked after launch, so the track record always matches the agent. To try something different, launch a new agent.</li>
        <li>You can run up to five agents at once and pause any of them from its page. See <Link href="/docs/guardrails#pausing">what pausing does</Link>.</li>
      </ul>

      <H2 id="who-can-use">Who can use Zolva</H2>
      <p>
        Anyone outside the United States and sanctioned countries. Robinhood Stock Tokens are not offered to US persons. Nothing on Zolva is investment advice, and past results, including backtests, do not
        predict future ones. The full rules are in the <Link href="/terms">Terms</Link>.
      </p>
    </DocsArticle>
  );
}
