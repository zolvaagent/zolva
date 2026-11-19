import Link from "next/link";

import { TickerAvatar } from "@/components/ui/TickerAvatar";
import { EXPLORER_URL } from "@/lib/chain";
import type { UnpricedListing } from "@/lib/data/markets";
import { shortAddress } from "@/lib/format";

const utcTime = (ms: number) => `${new Date(ms).toISOString().slice(11, 16)} UTC`;
const utcDay = (ms: number) => new Date(ms).toUTCString().slice(5, 11);

/**
 * /markets/<symbol> for a token that is on the allowlist but has no hourly close yet: what it is, its
 * contract, and when the first price lands. Replaces the 404 a brand new listing used to show.
 */
export function NewListing({ listing }: { listing: UnpricedListing }) {
  const expected = listing.firstCloseAtMs;
  return (
    <div className="stack">
      <div className="agent-head">
        <div>
          <Link className="eyebrow" href="/markets" style={{ textDecoration: "none" }}>
            <i className="ph ph-arrow-left" />
            Markets
          </Link>
          <div className="market-title">
            <TickerAvatar symbol={listing.symbol} size={44} />
            <div>
              <h1 className="page__title">{listing.symbol}</h1>
              <span className="muted">{listing.name}</span>
            </div>
          </div>
          <div className="agent-head__meta">
            <span className="pill pill--accent">New listing</span>
          </div>
        </div>
      </div>

      <div className="card stack">
        <h2 className="card__title">Listed. First price at about {utcTime(expected)}</h2>
        <p>
          {listing.symbol} is on Zolva&apos;s list of markets. Its price is read once an hour from its USDG pool on Robinhood Chain, so the first hourly price is stored at about{" "}
          <strong>
            {utcTime(expected)} on {utcDay(expected)}
          </strong>
          . The chart, the numbers and the agents trading it show from then on, and the Studio can use it as soon as it has prices.
        </p>
        <a className="text-link" href={`${EXPLORER_URL}/token/${listing.address}`} target="_blank" rel="noopener noreferrer">
          Token contract {shortAddress(listing.address)} <i className="ph ph-arrow-up-right" />
        </a>
        {listing.verifiedOfficial ? (
          <p className="note">
            <i className="ph ph-seal-check" aria-hidden="true" /> This address is an official Robinhood Stock Token, checked on chain.
          </p>
        ) : (
          <p className="note">This token address is not yet checked against Robinhood&apos;s official Stock Token list.</p>
        )}
      </div>
    </div>
  );
}
