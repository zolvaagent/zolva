import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarketDetail } from "@/components/app/MarketDetail";
import { getMarketDetail } from "@/lib/data/markets";
import { price } from "@/lib/format";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/markets/[symbol]">): Promise<Metadata> {
  const client = db();
  const detail = await getMarketDetail(client, (await params).symbol);
  if (!detail) return { title: "Stock not found" };
  const { symbol, name, stats } = detail.row;
  return { title: `${symbol} price`, description: `${name} (${symbol}) token on Robinhood Chain: ${price(stats.price)}, hourly chart, and the Zolva agents trading it.` };
}

export default async function MarketPage({ params }: PageProps<"/markets/[symbol]">) {
  const client = db();
  const detail = await getMarketDetail(client, (await params).symbol);
  if (!detail) notFound();
  return (
    <div className="container page">
      <MarketDetail row={detail.row} closes={detail.closes} startTs={detail.startTs} asOf={detail.asOf} marketOpen={detail.marketOpen} agents={detail.agents} />
    </div>
  );
}
