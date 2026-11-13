import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarketDetail } from "@/components/app/MarketDetail";
import { getMarketDetail } from "@/lib/data/markets";
import { fetchSession } from "@/lib/harmonic";
import { getLongbowListings, longbowListingFor } from "@/lib/longbow";
import { price } from "@/lib/format";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/markets/[symbol]">): Promise<Metadata> {
  const client = db();
  const detail = await getMarketDetail(client, (await params).symbol, { perps: true });
  if (!detail) return { title: "Stock not found" };
  const { symbol, name, stats } = detail.row;
  return { title: `${symbol} price`, description: `${name} (${symbol}) token on Robinhood Chain: ${price(stats.price)}, hourly chart, and the Zolva agents trading it.` };
}

export default async function MarketPage({ params }: PageProps<"/markets/[symbol]">) {
  const client = db();
  const detail = await getMarketDetail(client, (await params).symbol, { perps: true });
  if (!detail) notFound();
  // Stock Tokens only, and never slows the page by more than 2.5 s (null hides the status).
  const isStock = detail.row.assetClass !== "crypto" && detail.row.venue !== "lighter";
  // Longbow is cached for hours and optional: no listing (or no answer) hides the line.
  const [session, longbowListings] = await Promise.all([
    isStock ? fetchSession(detail.row.address, { timeoutMs: 2500 }) : null,
    detail.row.venue !== "lighter" ? getLongbowListings() : [],
  ]);
  const longbow = longbowListingFor(longbowListings, detail.row.address);
  return (
    <div className="container page">
      <MarketDetail row={detail.row} closes={detail.closes} startTs={detail.startTs} asOf={detail.asOf} marketOpen={detail.marketOpen} agents={detail.agents} session={session} longbow={longbow} />
    </div>
  );
}
