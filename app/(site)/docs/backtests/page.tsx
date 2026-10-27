import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("backtests");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

export default function Backtests() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="what-it-does">What a backtest does</H2>
      <p>
        Every time you change something in the <Link href="/studio">Studio</Link>, the agent is replayed over the <strong>last 30 days</strong> of real hourly prices, ending at the newest hour. It starts in
        cash with the capital you chose and makes the exact decisions it would have made live, with the same strategy, limits and 0.5% cost per trade.
      </p>
      <p>
        It is not a separate simulation. Backtests and live agents run the same engine on the same cleaned prices, so a backtest shows what your settings would really have done over that month.
      </p>

      <H2 id="reading-the-numbers">Reading the numbers</H2>
      <ul>
        <li>
          <strong>Return</strong>: where the capital ended after 30 days.
        </li>
        <li>
          <strong>Holding instead</strong>: what you would have if you had split the capital equally across the same tokens on day one and done nothing. The chart draws it as a dashed line next to your
          agent.
        </li>
        <li>
          <strong>Worst drop</strong>: the largest fall from a previous high during the month.
        </li>
        <li>
          <strong>Trades</strong>: how many buys and sells it made. Each one paid 0.5%.
        </li>
        <li>
          <strong>Winning sells</strong>: the share of sells that closed above what the agent paid.
        </li>
      </ul>
      <p>Below the chart, one sentence sums it up, for example whether the agent beat holding or only lost less than holding did.</p>

      <H2 id="what-good-looks-like">What a good result looks like</H2>
      <ul>
        <li>
          <strong>It beats holding.</strong> Making 2% while holding made 5% is a worse result than doing nothing.
        </li>
        <li>
          <strong>It trades a sensible amount.</strong> Dozens of trades a month usually means the costs are eating the edge.
        </li>
        <li>
          <strong>The worst drop is one you could sit through.</strong>
        </li>
        <li>
          <strong>It still looks fine with slightly different settings.</strong> If moving one slider a little turns a gain into a loss, the result was probably luck.
        </li>
      </ul>

      <H2 id="limits">Limits of a backtest</H2>
      <ul>
        <li>
          <strong>One month is a small sample.</strong> A strategy that suits a rising market can look brilliant in one month and poor in the next.
        </li>
        <li>
          <strong>Hourly closes only.</strong> Moves inside an hour are not seen, so a real stop loss could fill at a worse price than the backtest shows.
        </li>
        <li>
          <strong>The AI co-pilot is not included.</strong> The backtest shows your rules alone; the co-pilot only reviews live trades.
        </li>
        <li>
          <strong>New tokens need history.</strong> A token is only offered once it has enough prices for the 30 days plus the strategy&apos;s look back period.
        </li>
      </ul>
      <Callout kind="warn">Past results, including backtests, do not predict future ones. That is why every launched agent also builds a live record on the leaderboard.</Callout>
    </DocsArticle>
  );
}
