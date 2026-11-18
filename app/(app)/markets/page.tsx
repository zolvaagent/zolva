import type { Metadata } from "next";

import { Markets } from "@/components/app/Markets";
import { getMarketOverview } from "@/lib/data/markets";
import { getLongbowListings } from "@/lib/longbow";
import { db } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Markets",
  description: "Hourly prices of the tokenized US stocks and crypto on Robinhood Chain that Zolva agents can trade.",
};
export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const client = db();
  // Longbow is cached and optional: no answer just leaves the Longbow marks and tab out.
  const [{ rows, asOf, marketOpen: open }, longbow] = await Promise.all([getMarketOverview(client, { perps: true }), getLongbowListings()]);
  // Matched by token address, never by symbol (same-name clones exist).
  const borrowable = longbow.map((listing) => listing.collateral);
  return (
    <div className="container page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Markets</h1>
          <p className="page__lead">Every stock token, coin and perp on Robinhood Chain that Zolva agents trade, priced each hour: tokens from their USDG pools, perps from Lighter.</p>
        </div>
      </div>
      <Markets rows={rows} asOf={asOf} marketOpen={open} borrowable={borrowable} />
    </div>
  );
}
