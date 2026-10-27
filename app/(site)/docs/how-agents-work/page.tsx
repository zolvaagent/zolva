import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2, Steps } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("how-agents-work");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

export default function HowAgentsWork() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="every-hour">Every hour</H2>
      <p>
        A few minutes after each hour ends, Zolva reads the closing price of every market from Robinhood Chain: the price in its USDG pool at the last block of that hour. Then every running agent takes one
        turn with those prices.
      </p>
      <p>For each token it holds or watches, the agent goes through the same checks in the same order:</p>
      <Steps>
        <li>
          <strong>Stop loss.</strong> If the price is at or below the stop loss distance from where it bought, it sells everything in that token. Nothing can skip this check.
        </li>
        <li>
          <strong>Exits that do not need indicators</strong> (Custom rules only): a take profit target or a maximum holding time.
        </li>
        <li>
          <strong>The strategy.</strong> Momentum, Mean reversion or your own rules decide buy, sell or hold.
        </li>
        <li>
          <strong>The AI co-pilot</strong>, if you turned it on. When the strategy wants to trade, the AI reads the same numbers and approves or passes, with a reason. It can only say no: it never sizes
          trades, places its own or skips a stop loss.
        </li>
      </Steps>

      <H2 id="buying-and-selling">Buying and selling</H2>
      <ul>
        <li>
          <strong>A buy</strong> spends up to your <em>max per token</em> share of the agent&apos;s total value (cash plus holdings), or the cash left if that is less.
        </li>
        <li>
          <strong>A sell</strong> always sells the whole position in that token.
        </li>
        <li>An agent holds at most one position per token. It does not add to a position it already has.</li>
        <li>
          Every trade pays <strong>0.5%</strong> for fees and slippage, on the buy and again on the sell. The entry price includes that cost, so the stop loss and the results measure what was really paid.
        </li>
      </ul>
      <Callout kind="tip" title="Why most hours end in a hold">
        Each trade costs 0.5%, so a strategy that trades all the time loses to its own costs. The presets were tuned to trade a handful of times a month. Many quiet hours are normal.
      </Callout>

      <H2 id="decision-log">The decision log</H2>
      <p>
        Every hour, every token gets a decision with a reason in plain words, for example <em>&ldquo;Up +3.4% in 24h and +1.2% above the 48h average. Strong trend, buying.&rdquo;</em> You can read them on the
        agent&apos;s page, and every agent&apos;s trades appear in <Link href="/activity">Activity</Link>.
      </p>

      <H2 id="prices">Clean prices</H2>
      <p>Pools can be thin, so the prices pass two checks before an agent sees them. Live agents and backtests use exactly the same cleaned prices.</p>
      <ul>
        <li>
          <strong>Missing hours.</strong> If a token has no price for an hour, its last price is carried forward.
        </li>
        <li>
          <strong>Bad prints.</strong> A price more than 15% away from the middle of its previous 24 hours is ignored as a one off spike, unless the move holds for 3 hours in a row. Then it is treated as a
          real move.
        </li>
        <li>
          <strong>Crypto.</strong> ETH and BTC are also compared with Chainlink&apos;s price at the same block. If the pool is more than 2% away, that hour&apos;s pool price is not stored and the last good
          price is used instead.
        </li>
      </ul>

      <H2 id="missed-hours">If Zolva misses an hour</H2>
      <p>
        If the hourly run is delayed, the next run plays the missed hours in order, each with its own hour&apos;s prices, as if nothing had happened. It replays at most the last 7 days. The AI co-pilot only
        reviews the newest hour; replayed hours use the rules alone, so an outage never turns into a burst of paid AI calls.
      </p>

      <H2 id="results">How results are measured</H2>
      <ul>
        <li>
          <strong>Return</strong>: the agent&apos;s total value now against its starting capital.
        </li>
        <li>
          <strong>Versus holding</strong>: what you would have if you had split the same capital equally across the same tokens at launch and never touched it (one 0.5% cost included). This is the number
          to beat.
        </li>
        <li>
          <strong>Worst drop</strong>: the largest fall from a previous high, so you can see how rough the ride was.
        </li>
      </ul>
      <Callout title="New tokens need history">
        Every strategy looks back before it decides: 48 hours for the presets, or the longest period in your own rules. A token listed more recently than that, plus the 30 day backtest, is shown as too new
        to pick.
      </Callout>
    </DocsArticle>
  );
}
