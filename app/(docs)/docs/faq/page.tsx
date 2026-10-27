import type { Metadata } from "next";

import { DocsArticle, H2 } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("faq");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

const FAQ: [string, string][] = [
  ["Is real money involved?", "No. Every agent trades virtual dollars at real Robinhood Chain prices. Logging in costs no gas and never moves funds from your wallet."],
  ["What are stock tokens?", "Tokens on Robinhood Chain that track the price of a US stock or ETF, such as NVDA or SPY. They trade around the clock, including weekends."],
  ["Can agents trade crypto?", "Yes, ETH and BTC, and one agent can mix them with stock tokens. Their prices are also checked against Chainlink every hour."],
  ["How often does my agent trade?", "It checks prices once an hour and only trades when its rules trigger. Many hours end in a hold, and that is normal: every trade costs 0.5%."],
  ["Can I make my own strategy?", "Yes. Combine up to three conditions to buy and three to sell, add a take profit or a max holding time, or describe the idea in words with prompt mode. No code."],
  ["Can I change an agent after launch?", "No. Settings are locked so the track record always matches the agent. You can pause it, publish or unpublish it, and change its AI budget. To try new settings, launch a new agent."],
  ["Why compare with holding?", "Because it is the easiest alternative. If an agent cannot beat simply buying the same tokens and waiting, you should know before you trust it."],
  ["How many agents can I run?", "Up to five at once, each with its own virtual capital. Pause one to launch another."],
  ["Who can see my agents?", "Only you, until you publish one. Published agents appear on the leaderboard with their settings, decisions and trades."],
  ["What does the AI co-pilot cost?", "New accounts get $0.50 of free credits for Lite models. A typical Lite model costs cents a month, and every agent has its own spending limit and end date."],
  ["Who can use Zolva?", "Anyone outside the United States and sanctioned countries. Stock tokens are not offered to US persons."],
];

const GLOSSARY: [string, string][] = [
  ["Agent", "A strategy plus its markets and limits, running on its own every hour."],
  ["Backtest", "A replay of the last 30 days with your exact settings, before you launch."],
  ["Close", "The price at the end of an hour. Agents decide on hourly closes."],
  ["Drawdown (worst drop)", "The largest fall from a previous high, in percent."],
  ["Holding", "Buying the same tokens in equal parts at the start and never trading. The benchmark every agent is measured against."],
  ["Max per token", "The largest share of an agent's value it puts into one token when it buys."],
  ["Paper trading", "Trading with virtual money at real prices. Nothing is bought or sold for real."],
  ["Pool", "The onchain market where a token trades against USDG. Zolva reads prices from it."],
  ["RSI", "Relative strength index, 0 to 100: how much of the recent movement was up. Low values suggest oversold."],
  ["Slippage", "The gap between the price you see and the price you get. Included in the 0.5% cost per trade."],
  ["Stop loss", "An automatic sell when a position falls a set percentage below its entry price."],
  ["Stock token", "A token on Robinhood Chain that tracks a US stock or ETF."],
  ["Take profit", "An automatic sell when a position rises a set percentage above its entry price."],
  ["USDG", "A dollar stablecoin on Robinhood Chain. Prices are quoted in it and counted as $1."],
  ["Z score", "How far the price sits from its recent average, in standard deviations. −2 or lower is an unusual dip."],
];

/** FAQ structured data, so search engines can show the answers directly. */
const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
};

export default function Faq() {
  return (
    <DocsArticle slug={page.slug}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
      <H2 id="faq">Questions</H2>
      <div className="docs-faq">
        {FAQ.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>

      <H2 id="glossary">Glossary</H2>
      <dl className="docs-glossary">
        {GLOSSARY.map(([term, meaning]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
    </DocsArticle>
  );
}
