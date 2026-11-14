import type { Metadata } from "next";
import Link from "next/link";

import { DocsArticle, H2 } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("faq");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

const FAQ: [string, string][] = [
  ["Is real money involved?", "Start on paper. Test your agent's strategy with virtual dollars at real Robinhood Chain prices, then take it to real money from your own wallet once it proves itself. Signing in never moves funds from your wallet."],
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

      <p>
        Looking for a term? See the <Link href="/docs/glossary">Glossary</Link>.
      </p>
    </DocsArticle>
  );
}
