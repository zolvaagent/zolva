import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";
import { PREMIUM_ENDPOINTS } from "@/lib/x402/catalog";
import { X402_ASSET } from "@/lib/x402/protocol";

const page = docPage("premium-api");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

const BASE = "https://zolvaagent.app/api/x402/v1";

const BACKTEST_BODY = `{
  "strategy": "mean_reversion",
  "markets": ["NVDA", "ETH"],
  "days": 30,
  "capital": 10000,
  "maxPositionPct": 33,
  "stopLossPct": 8
}`;

const PAYMENT_HEADER = `{
  "x402Version": 1,
  "scheme": "exact",
  "network": "robinhood",
  "payload": {
    "signature": "0x…",
    "authorization": { "from": "0xYou", "to": "<payTo>", "value": "20000",
      "validAfter": "…", "validBefore": "…", "nonce": "0x<32 random bytes>" }
  }
}`;

/** The paid endpoints over x402, with USDG on Robinhood Chain. */
export default function PremiumApi() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="overview">Overview</H2>
      <p>
        The premium API sells fresh analysis per call, paid in USDG on Robinhood Chain with{" "}
        <a href="https://www.x402.org" target="_blank" rel="noopener noreferrer">
          x402
        </a>
        . No account and no key: a person or an AI agent pays for each call with one signature, and Zolva pays the gas. Everything that proves how agents trade stays free in the{" "}
        <Link href="/docs/public-api">Public API</Link>.
      </p>
      <ul>
        {Object.values(PREMIUM_ENDPOINTS).map((endpoint) => (
          <li key={endpoint.path}>
            <code>
              {endpoint.method} {endpoint.path}
            </code>
            : <strong>{endpoint.price} USDG</strong>. {endpoint.description}
          </li>
        ))}
      </ul>
      <p>
        <code>GET {BASE}</code> is free and says whether the premium API is open, the prices and Zolva&apos;s receiving address.
      </p>
      <Callout kind="note" title="Open since November 6, 2026">
        Payments settle on Robinhood Chain in about a second. Every payment goes straight from your wallet to Zolva&apos;s address, so each one is on Blockscout.
      </Callout>

      <H2 id="paying">How paying works</H2>
      <ol>
        <li>
          Call the endpoint. Without payment it answers <code>402 Payment Required</code> with <code>accepts</code>: the price in USDG base units (<code>maxAmountRequired</code>, 6
          decimals), <code>payTo</code>, the asset and the network.
        </li>
        <li>
          Sign an EIP-3009 <code>TransferWithAuthorization</code> for exactly that amount to <code>payTo</code>, valid for at most 5 minutes, with a random 32 byte nonce. The EIP-712 domain is
          name <code>Global Dollar</code>, version <code>1</code>, chain id <code>4663</code>, verifying contract USDG (<code className="mono">{X402_ASSET}</code>).
        </li>
        <li>
          Call again with the payment, base64 encoded, in the <code>X-PAYMENT</code> header.
        </li>
        <li>
          Zolva checks the payment, does the work, sends your transfer on chain and only then answers. The <code>X-PAYMENT-RESPONSE</code> header (base64 JSON) holds the transaction hash.
        </li>
      </ol>
      <pre className="docs-code">
        <code>{PAYMENT_HEADER}</code>
      </pre>
      <ul>
        <li>
          <strong>Network:</strong> <code>robinhood</code> (Robinhood Chain, chain id 4663); <code>eip155:4663</code> is accepted too. The large x402 facilitators do not support Robinhood Chain yet,
          so Zolva settles payments itself.
        </li>
        <li>
          <strong>Wallets:</strong> regular wallets (65 byte signatures). Smart contract wallets are not supported yet.
        </li>
        <li>
          <strong>You only pay for an answer.</strong> A bad request is refused with <code>400</code> before any payment is asked for. If the work fails on our side, the payment is not sent.
        </li>
        <li>
          Each signed payment works once. Reusing it returns <code>402</code> with &ldquo;already used&rdquo;.
        </li>
      </ul>

      <H2 id="scan">GET /scan</H2>
      <p>
        Every market at the latest hourly close, deepest dip first: <code>symbol</code>, <code>name</code>, <code>address</code>, <code>assetClass</code>, <code>price</code>,{" "}
        <code>change1hPct</code>, <code>change24hPct</code>, <code>zscore48h</code> (distance from the 48 hour average in standard deviations; Lab · Dip Hunter buys below −2.5),{" "}
        <code>rsi14h</code> and <code>trend24h</code> (above or below the 24 hour average). <code>asOf</code> is the hour the closes are from. New closes arrive a few minutes past each hour.
      </p>

      <H2 id="backtest">POST /backtest</H2>
      <p>
        Replays a strategy with Zolva&apos;s engine, the same one the agents and the <Link href="/studio">Studio</Link> use, on the last 1 to 30 days of hourly closes. Body:
      </p>
      <pre className="docs-code">
        <code>{BACKTEST_BODY}</code>
      </pre>
      <ul>
        <li>
          <code>strategy</code>: <code>momentum</code>, <code>mean_reversion</code> or <code>custom</code>. For <code>custom</code>, add <code>rules</code> in the same shape the Studio uses; see{" "}
          <Link href="/docs/strategies">Strategies</Link>.
        </li>
        <li>
          <code>markets</code>: 1 to 3 symbols or token addresses from <Link href="/markets">Markets</Link>. Only Zolva&apos;s allowlisted tokens are accepted, never a lookalike.
        </li>
        <li>
          Optional, with defaults: <code>days</code> (30), <code>capital</code> (10000), <code>maxPositionPct</code> (33), <code>stopLossPct</code> (8).
        </li>
      </ul>
      <p>
        The answer has <code>result</code> (<code>returnPct</code>, <code>holdReturnPct</code>, <code>edgePts</code>, <code>maxDrawdownPct</code>, <code>winRatePct</code>,{" "}
        <code>roundTrips</code>), every trade with the engine&apos;s reasoning, and the equity curve every 4 hours next to holding. Every trade pays 0.5% for fees and slippage.
      </p>
      <Callout kind="warn" title="Backtests are not predictions">
        A backtest replays the past with paper money. Past results do not predict future ones, and nothing here is investment advice.
      </Callout>
    </DocsArticle>
  );
}
