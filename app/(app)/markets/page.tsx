import type { Metadata } from "next";

import { Markets } from "@/components/app/Markets";
import { getMarketOverview } from "@/lib/data/markets";
import { dateAt } from "@/lib/format";

export const metadata: Metadata = {
  title: "Markets",
  description: "Hourly prices of the tokenized US stocks on Robinhood Chain that Zolva agents can trade.",
};
export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const { rows, asOf, marketOpen: open } = await getMarketOverview();
  return (
    <div className="container page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Markets</h1>
          <p className="page__lead">Every stock token your agents can trade, priced each hour from its USDG pool on Robinhood Chain.</p>
        </div>
      </div>
      <p className="market-status">
        <span className={`pill ${open ? "pill--running" : "pill--paused"}`}>{open ? "US market open" : "US market closed"}</span>
        <span className="muted">
          Prices as of {dateAt(asOf)}. {open ? "" : "While Nasdaq is closed, prices come from onchain trading only. "}These are token prices, not live exchange quotes.
        </span>
      </p>
      <Markets rows={rows} />
    </div>
  );
}
