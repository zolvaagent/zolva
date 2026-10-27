import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2, RuleCard } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("strategies");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

const INDICATOR_ROWS: [string, string, string][] = [
  ["Price", "The latest hourly close.", "None"],
  ["Average", "The average close over the period (a simple moving average).", "12, 24, 48, 72 hours"],
  ["Highest", "The highest close in the period before this hour, so the price can break above it.", "12, 24, 48, 72 hours"],
  ["Lowest", "The lowest close in the period before this hour.", "12, 24, 48, 72 hours"],
  ["Change", "How much the price moved over the period, in percent.", "1, 4, 12, 24, 48, 72 hours"],
  ["Z score", "How unusual the price is: how many standard deviations it sits from the period's average. Below −2 is a rare dip.", "24, 48, 72 hours"],
  ["RSI", "Relative strength, 0 to 100. Under 30 often means oversold, over 70 overbought.", "14, 24 hours"],
];

export default function Strategies() {
  return (
    <DocsArticle slug={page.slug}>
      <p>
        Every agent has one strategy. Pick a preset, or build your own rules in the <Link href="/studio?strategy=custom">Studio</Link>. Whatever you choose, the stop loss and the max per token always apply.
      </p>

      <H2 id="momentum">Momentum</H2>
      <p>Follows strong moves: it buys a token that is already rising and sells once the trend breaks.</p>
      <RuleCard
        rows={[
          { label: "Buy", tone: "buy", text: "Price is above its 48h average and up more than 3% in 24 hours" },
          { label: "Sell", tone: "sell", text: "Price falls more than 3% below its 48h average" },
        ]}
      />
      <p>Works best in markets that keep going one way. In choppy markets it can buy late and sell early.</p>

      <H2 id="mean-reversion">Mean reversion</H2>
      <p>Buys unusual dips and sells the rebound, betting that a price far from normal tends to come back.</p>
      <RuleCard
        rows={[
          { label: "Buy", tone: "buy", text: "Z score against the 48h average is below −2.5 (an unusually deep dip)" },
          { label: "Sell", tone: "sell", text: "Z score is back to +0.5 or higher (back above the average)" },
        ]}
      />
      <p>Works best in markets that move sideways. In a steady fall it can buy too early, which is what the stop loss is for.</p>

      <H2 id="custom">Custom rules</H2>
      <p>Write your own buy and sell rules with the same building blocks the presets use. A rule is a list of conditions:</p>
      <ul>
        <li>
          <strong>Buy rules</strong> and <strong>sell rules</strong> each take up to 3 conditions.
        </li>
        <li>
          Each list is joined with <strong>all</strong> (every condition must be true) or <strong>any</strong> (one is enough).
        </li>
        <li>
          A condition compares an indicator with a number or with another indicator, using <code>above</code>, <code>below</code>, <code>crosses above</code> or <code>crosses below</code>. &ldquo;Crosses&rdquo;
          is only true in the hour the line is crossed.
        </li>
        <li>
          Price lines (Average, Highest, Lowest) can be shifted by a percentage, for example <em>2% below the 48h average</em>.
        </li>
        <li>
          Two optional exits: a <strong>take profit</strong> (sell once the price is a set percentage above entry) and a <strong>max holding time</strong> in hours.
        </li>
      </ul>

      <h3>Indicators</h3>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Indicator</th>
              <th>What it measures</th>
              <th>Periods</th>
            </tr>
          </thead>
          <tbody>
            {INDICATOR_ROWS.map(([name, text, periods]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{text}</td>
                <td>{periods}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Example: breakout</h3>
      <p>The Studio has this one as a template. It buys when a token breaks out to a new 3 day high.</p>
      <RuleCard
        rows={[
          { label: "Buy", tone: "buy", text: "Price crosses above the 72h highest" },
          { label: "Sell", tone: "sell", text: "Price is below the 48h average minus 2%" },
          { label: "Exit", text: "Take profit at +12%" },
        ]}
      />

      <h3>Example: RSI dip</h3>
      <RuleCard
        rows={[
          { label: "Buy", tone: "buy", text: "24h RSI is below 30" },
          { label: "Sell", tone: "sell", text: "24h RSI is above 55" },
          { label: "Exit", text: "Take profit at +6%, or after 72 hours" },
        ]}
      />
      <p>Prefer to describe it in words? The Studio&apos;s prompt mode turns a sentence into rules like these, which you can read and edit before launching.</p>

      <H2 id="limits">Limits on every agent</H2>
      <ul>
        <li>
          <strong>Stop loss</strong>, 2% to 25%: sells a position that falls this far below its entry price. It runs before the strategy, every hour.
        </li>
        <li>
          <strong>Max per token</strong>, 10% to 100%: the largest share of the agent&apos;s value one token may take when it buys.
        </li>
        <li>
          <strong>Markets</strong>: one to three per agent, stocks and crypto can mix.
        </li>
      </ul>

      <H2 id="tips">Tips for better strategies</H2>
      <ul>
        <li>
          <strong>Trade less.</strong> Each trade costs 0.5% each way. When the presets were tuned, faster settings traded over 100 times a month and lost to costs.
        </li>
        <li>
          <strong>Beat holding, not zero.</strong> A strategy that made 2% while holding made 5% did worse than doing nothing. The Studio always shows both.
        </li>
        <li>
          <strong>Don&apos;t tune to one month.</strong> Settings that look perfect on the last 30 days often fit noise. Prefer simple rules that make sense on their own.
        </li>
      </ul>
      <Callout kind="warn">Backtests replay the past with a 0.5% cost per trade. They do not predict future results, and a live agent can do better or worse.</Callout>
    </DocsArticle>
  );
}
