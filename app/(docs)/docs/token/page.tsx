import type { Metadata } from "next";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";
import { usd } from "@/lib/format";
import { GRACE_DAYS, TIERS } from "@/lib/tiers";

const page = docPage("token");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

const ROWS: [string, (key: keyof typeof TIERS) => string][] = [
  ["Holds", (key) => (TIERS[key].minUsd ? `ZOLVA worth ${usd(TIERS[key].minUsd)}+` : "No ZOLVA needed")],
  ["Agents with free hourly AI reviews", (key) => (TIERS[key].freeAiAgents ? `${TIERS[key].freeAiAgents} (Lite models)` : "None (welcome credits only)")],
  ["Running agents at once", (key) => String(TIERS[key].activeAgents)],
  ["Strategy writer tries a day", (key) => String(TIERS[key].writerPerDay)],
];

export default function Token() {
  return (
    <DocsArticle slug={page.slug}>
      <Callout kind="note">The ZOLVA token has not launched yet. Everything below starts when it does; until then every account is on Free.</Callout>

      <H2 id="tiers">What holding ZOLVA does</H2>
      <p>
        ZOLVA is fuel for agents. Holding it raises your account&apos;s limits: some of your agents get their AI co-pilot reviews for free, and you can run
        more agents at once. Nothing is staked, locked or sent anywhere: Zolva only reads your balance.
      </p>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th />
              <th>{TIERS.free.label}</th>
              <th>{TIERS.holder.label}</th>
              <th>{TIERS.pro.label}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([name, value]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{value("free")}</td>
                <td>{value("holder")}</td>
                <td>{value("pro")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Free AI reviews go to your oldest running agents that use a Lite model. They still count toward Zolva&apos;s daily AI budget, so on a very busy day
        a review can be skipped; the agent then trades on its rules, as it always does without the co-pilot.
      </p>

      <H2 id="how">How your tier is worked out</H2>
      <ul>
        <li>
          <strong>Your wallets.</strong> Your login wallet always counts. On the Dashboard you can add more wallets: each one signs a short message, which
          is free and sends no transaction. One wallet can count for one Zolva account.
        </li>
        <li>
          <strong>In dollars.</strong> Your ZOLVA is valued at its average price over the last 7 days, so one jumpy day does not change your tier.
        </li>
        <li>
          <strong>Fresh enough.</strong> Balances are read from Robinhood Chain at most every 10 minutes, or when you press Refresh.
        </li>
        <li>
          <strong>A grace period.</strong> Moving up is instant. If your holdings drop below your tier, you keep it for {GRACE_DAYS} days first.
        </li>
        <li>
          <strong>If the chain cannot be read,</strong> your last tier stays; a new account starts on Free.
        </li>
      </ul>

      <H2 id="burn">Coming later</H2>
      <ul>
        <li>Paying for AI credits with ZOLVA, with the ZOLVA paid sent to a burn address.</li>
        <li>Agent tokens: part of every agent token&apos;s trading fees buys ZOLVA and burns it, enforced by a contract.</li>
        <li>Higher Public API limits for holders.</li>
      </ul>

      <H2 id="not">What ZOLVA is not</H2>
      <p>
        ZOLVA is a utility token. It gives no ownership of Zolva, no dividends and no claim on its revenue, and it is never linked to how any agent trades.
        Agents never trade ZOLVA, and it is never part of their results.
      </p>
      <Callout kind="warn">Crypto tokens are volatile and can lose all their value. ZOLVA is not available to US persons. Nothing here is investment advice.</Callout>
    </DocsArticle>
  );
}
