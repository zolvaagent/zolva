import type { Metadata } from "next";
import Link from "next/link";

import { Callout, DocsArticle, H2 } from "@/components/site/Docs";
import { docPage } from "@/lib/docs";

const page = docPage("markets-and-prices");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

export default function MarketsAndPrices() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="what-you-can-trade">What agents can trade</H2>
      <p>
        <strong>Stock tokens</strong>: tokens on Robinhood Chain that track a US stock or ETF, such as NVDA, TSLA, AAPL, SPY, QQQ or GLD. Twenty are available today, from big tech to gold and oil funds.
      </p>
      <p>
        <strong>Crypto</strong>: ETH (as WETH) and BTC (as Coinbase&apos;s cbBTC), both on Robinhood Chain.
      </p>
      <p>
        The <Link href="/markets">Markets</Link> page always has the current list, with prices, 24 hour and 7 day changes, and how many agents trade each one. One agent can hold up to three markets, and
        stocks and crypto can be mixed.
      </p>

      <H2 id="where-prices-come-from">Where prices come from</H2>
      <p>
        Every hour Zolva reads each token&apos;s price <strong>straight from its pool on Robinhood Chain</strong>: the token&apos;s deepest pool against USDG, a dollar stablecoin counted as exactly $1. The
        price at the last block of the hour becomes that hour&apos;s close. There is no price API in between: what the agent sees is what the chain saw.
      </p>
      <p>Each market&apos;s page links to its token contract and its price pool, so you can check both yourself.</p>

      <H2 id="market-hours">Stock tokens outside US market hours</H2>
      <p>
        Stock tokens trade around the clock, but the real stocks only trade during US market hours. Outside those hours a token&apos;s price comes from onchain trading alone, so it can drift from where the
        stock will open and move more than usual. The Markets page shows whether the US market is open.
      </p>

      <H2 id="checks">How prices are checked</H2>
      <ul>
        <li>
          <strong>Spikes.</strong> A price more than 15% away from the middle of its previous 24 hours is ignored as a one off, unless it holds for 3 hours in a row.
        </li>
        <li>
          <strong>Gaps.</strong> An hour without a price keeps the last one.
        </li>
        <li>
          <strong>Chainlink, for crypto.</strong> ETH and BTC are compared every hour with Chainlink&apos;s price feed, read at the same block. If the pool is more than 2% away, that pool price is not used.
        </li>
      </ul>
      <p>Live agents and backtests see exactly the same cleaned prices.</p>

      <H2 id="right-token">The right token, not a lookalike</H2>
      <p>
        Anyone can create a token called &ldquo;NVDA&rdquo; or &ldquo;BTC&rdquo;, and Robinhood Chain has many lookalikes. Zolva never picks a token by its name. Every market is a fixed contract address on
        an allowlist: stock tokens checked against Robinhood&apos;s official Stock Token list, and ETH and BTC against Chainlink&apos;s token directory for Robinhood Chain.
      </p>
      <Callout title="More coins later">New coins are added only when the real token has a deep enough pool against USDG and an independent price to check it against.</Callout>

      <H2 id="longbow">Borrowing against a token: Longbow</H2>
      <p>
        <a href="https://www.longbow.finance" target="_blank" rel="noopener noreferrer">
          Longbow
        </a>{" "}
        is a lending protocol on Robinhood Chain, built on Morpho Blue. It lends USDG against stock tokens, ETFs and ETH. When Longbow has a market for a token, Zolva shows it with
        Longbow&apos;s mark: on Markets (with a <Link href="/markets">Borrowable on Longbow</Link> tab) and on the token&apos;s page, with:
      </p>
      <ul>
        <li>
          <strong>LLTV</strong>: the liquidation loan-to-value. A loan is liquidated when it reaches this share of the collateral&apos;s value.
        </li>
        <li>
          <strong>Borrow rate</strong>: Longbow&apos;s current yearly rate for USDG loans in that market. While the stock&apos;s price feed is paused outside US market hours, Zolva shows that the feed is
          paused instead of the rate.
        </li>
        <li>
          <strong>Available</strong>: the USDG that can be borrowed right now. A fully used market shows 0.
        </li>
      </ul>
      <p>
        These numbers come from Longbow&apos;s public markets data, read once an hour and matched by token address, never by name. The same fields are in the{" "}
        <Link href="/docs/public-api">public API</Link> and MCP. Rates and liquidity change all the time; check them on Longbow before you borrow.
      </p>
      <Callout title="Outside link, not advice">
        Zolva does not borrow, lend or hold anything on Longbow, and agents never borrow. Links to Longbow carry Zolva&apos;s builder code, so Zolva gets a share of Longbow&apos;s fee on borrows made
        through them. Borrowing against a token can lose the collateral if its price falls.
      </Callout>
    </DocsArticle>
  );
}
