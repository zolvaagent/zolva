import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2, RuleCard, Steps } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("prompt-mode");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

export default function PromptMode() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="how-it-works">How it works</H2>
      <p>
        Prompt mode is part of the Custom strategy in the <Link href="/studio?strategy=custom">Studio</Link>. Instead of building rules condition by condition, you describe the idea in a sentence or two.
        Zolva&apos;s strategy writer turns it into ordinary Custom rules, which you can read, change and backtest like any rules you built yourself.
      </p>
      <Steps>
        <li>
          <strong>Describe the idea.</strong> Say when to buy and when to sell, in any language, in 10 to 600 characters.
        </li>
        <li>
          <strong>Generate rules.</strong> The writer answers with buy rules, sell rules and, if you asked for them, a take profit or a max holding time.
        </li>
        <li>
          <strong>Check and edit.</strong> The rules appear in the editor below the prompt and the backtest updates at once. Change anything you like before you launch.
        </li>
      </Steps>

      <H2 id="example">An example</H2>
      <p>
        <em>&ldquo;Buy big tech after a sharp drop, when the price is unusually low for the last two days. Sell once it recovers to its average, or after 3 days.&rdquo;</em>
      </p>
      <p>could become:</p>
      <RuleCard
        rows={[
          { label: "Buy", tone: "buy", text: "48h z score is below −2" },
          { label: "Sell", tone: "sell", text: "Price is above the 48h average" },
          { label: "Exit", text: "After 72 hours at most" },
        ]}
      />
      <p>The exact rules can differ from run to run. What counts is the version you see in the editor, because that is what the agent will run.</p>

      <H2 id="writing-good-prompts">Writing a good prompt</H2>
      <ul>
        <li>
          <strong>Say both sides.</strong> When to buy and when to sell. If you only describe the buy, the writer has to guess the exit.
        </li>
        <li>
          <strong>Use numbers when you have them.</strong> &ldquo;Up more than 3% in a day&rdquo; is clearer than &ldquo;rising fast&rdquo;.
        </li>
        <li>
          <strong>Stay within hourly prices.</strong> Rules can only use the indicators listed in <Link href="/docs/strategies#custom">Strategies</Link>: price, averages, highs and lows, change, z score
          and RSI, over periods of a few hours to 3 days.
        </li>
        <li>
          <strong>Leave out sizing and stop losses.</strong> Which markets to trade, the max per token and the stop loss are set with their own controls in the Studio.
        </li>
      </ul>

      <H2 id="notes">Notes for the AI co-pilot</H2>
      <p>
        Some ideas cannot be written as price rules, such as &ldquo;avoid buying before earnings&rdquo; or &ldquo;be careful outside US market hours&rdquo;. The writer keeps those as <strong>notes</strong>.
        If the agent has the <Link href="/docs/ai-copilot">AI co-pilot</Link> turned on, the AI reads these notes every time it reviews a trade. Without the co-pilot, notes have no effect.
      </p>

      <H2 id="cost">Cost and limits</H2>
      <ul>
        <li>The writer uses Claude Haiku 5.5 and is paid from your AI credits. One generation usually costs well under a cent, and the welcome credits cover it.</li>
        <li>Each account can generate 10 times per 24 hours.</li>
        <li>If you are out of credits, you can still build the same rules by hand.</li>
      </ul>
      <Callout kind="tip">Treat the generated rules as a first draft. Read them, check the backtest against holding, and adjust before you launch.</Callout>
    </DocsArticle>
  );
}
