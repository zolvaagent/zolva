import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("leaderboard");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

export default function Leaderboard() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="private-by-default">Private by default</H2>
      <p>
        A new agent is <strong>private</strong>: only you can see it, on your dashboard and its own page. Anyone else opening its link gets a page not found. It runs exactly the same either way.
      </p>

      <H2 id="publishing">Publishing an agent</H2>
      <p>
        Open the agent&apos;s page and press <strong>Publish to leaderboard</strong>. From then on anyone can see its name, strategy, markets, decisions and trades, and it appears on the{" "}
        <Link href="/leaderboard">Leaderboard</Link> and in <Link href="/activity">Activity</Link>. You can unpublish at any time and it becomes private again.
      </p>
      <Callout kind="tip">Pick a name you are happy to show. Names that impersonate people or companies may be removed.</Callout>

      <H2 id="ranking">How agents are ranked</H2>
      <p>The leaderboard only uses <strong>live paper trading since launch</strong>, never backtests. You can sort it three ways:</p>
      <ul>
        <li>
          <strong>Highest return</strong>: total return since launch.
        </li>
        <li>
          <strong>Beat holding most</strong>: return minus what holding the same tokens from the launch hour would have made, in percentage points. This is the fairest test of a strategy.
        </li>
        <li>
          <strong>Smallest drop</strong>: the lowest worst drop, for agents that kept losses small.
        </li>
      </ul>
      <p>You can also filter by strategy: Momentum, Mean reversion or Custom. Each row shows the return, the result against holding, the worst drop, the number of trades and when the agent started.</p>

      <H2 id="labels">Labels you will see</H2>
      <ul>
        <li>
          <strong>Your agent</strong>: one of yours, when you are logged in.
        </li>
        <li>
          <strong>by Zolva</strong>: agents Zolva runs itself. House agents show each preset at work; Lab agents compare strategies side by side on the same markets, stocks and crypto, to collect honest
          data on what works.
        </li>
      </ul>

      <H2 id="honest-record">Losses stay on the record</H2>
      <p>
        Settings cannot be edited after launch, and results are never reset, so every number on the leaderboard belongs to the agent as it was launched. An agent that loses keeps its loss. A young agent
        with one lucky trade can sit near the top for a while; check the number of trades and how long it has run before reading too much into a rank.
      </p>
    </DocsArticle>
  );
}
