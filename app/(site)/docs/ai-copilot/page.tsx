import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { AI_MODELS, monthlyEstimateUsd, TIER_LABELS } from "@/lib/ai/models";
import { docPage } from "@/lib/docs";

const page = docPage("ai-copilot");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

const monthly = (usd: number) => (usd < 0.01 ? "under $0.01" : `about $${usd.toFixed(2)}`);

export default function AiCopilot() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="what-it-does">What it does</H2>
      <p>
        The AI co-pilot is an optional second opinion. Your rules still decide when to trade. Whenever they want to <strong>buy or sell</strong>, the co-pilot reads the same situation and either{" "}
        <strong>approves</strong> the trade or <strong>passes</strong>, with a one or two sentence reason that appears in the decision log.
      </p>
      <p>For each proposed trade the AI sees the strategy, the signal and its numbers, the token&apos;s recent hourly prices, its position if it holds one, and any notes from prompt mode.</p>

      <H2 id="what-it-cannot-do">What it cannot do</H2>
      <ul>
        <li>It cannot start a trade your rules did not ask for.</li>
        <li>It cannot change how much is bought or the price.</li>
        <li>
          It cannot block a <strong>stop loss</strong>, a take profit or a max holding time. Those exits run before the AI is asked.
        </li>
        <li>It is told to overrule the rules only with a concrete reason, such as a spike that is already fading or a dip that is still accelerating.</li>
      </ul>
      <Callout title="If the AI is unavailable">
        When the co-pilot cannot run (no credits left, the agent&apos;s limit or end date reached, or the AI service fails), the agent simply follows its rules for that hour. It never stops trading because
        of the AI.
      </Callout>

      <H2 id="when-it-runs">When it runs</H2>
      <ul>
        <li>Only in hours when the rules want to trade. Most strategies do that a handful to 30 times a month, so most hours cost nothing.</li>
        <li>Only on live hours. If Zolva replays missed hours after a delay, those hours use the rules alone, and backtests never include the AI.</li>
      </ul>

      <H2 id="models">Models</H2>
      <p>
        Pick a model when you build the agent in the <Link href="/studio">Studio</Link>. Estimates assume about 30 reviews a month; the real charge per call is what the model provider reports.
      </p>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Tier</th>
              <th>Typical month</th>
            </tr>
          </thead>
          <tbody>
            {AI_MODELS.map((model) => (
              <tr key={model.id}>
                <td>{model.label}</td>
                <td>{TIER_LABELS[model.tier]}</td>
                <td>{monthly(monthlyEstimateUsd(model))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="credits">Credits</H2>
      <ul>
        <li>
          Every new account gets <strong>$0.50</strong> of free AI credits, once. Free credits pay for <strong>Lite</strong> models and for prompt mode.
        </li>
        <li>Standard, Pro and Max models need paid credits. Buying credits is not available yet.</li>
        <li>Each review is charged when it happens, at what the call really cost. A failed call costs nothing.</li>
      </ul>

      <H2 id="limits">Spending limit and end date</H2>
      <p>Every agent with a co-pilot has its own budget, so one agent can never spend all your credits:</p>
      <ul>
        <li>
          <strong>Limit</strong>: the most this agent&apos;s co-pilot may spend in total, from $0.01 to $1,000. The Studio suggests about three months of typical use.
        </li>
        <li>
          <strong>End date</strong>: 7, 30, 90 or 365 days from when you set it (30 by default).
        </li>
        <li>
          The limit is a cap, not a reservation: it can be higher than your balance. Whichever runs out first, the limit, the date or your credits, turns the co-pilot off and the agent carries on with its
          rules.
        </li>
        <li>You can see what the agent has spent on its page, and change its limit and end date there.</li>
      </ul>
    </DocsArticle>
  );
}
