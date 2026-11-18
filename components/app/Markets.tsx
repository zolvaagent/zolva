"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { LighterBadge } from "@/components/ui/LighterBadge";
import { TickerAvatar } from "@/components/ui/TickerAvatar";
import type { MarketRow } from "@/lib/data/markets";
import { dateAt, fundingYearly, percent, price, sparkline, tone } from "@/lib/format";
import { LongbowMark } from "@/components/ui/LongbowMark";
import { hoursText } from "@/lib/studio/history";

const VIEWS = [
  ["all", "All"],
  ["gainers", "Top gainers"],
  ["losers", "Top losers"],
  ["longbow", "Borrowable on Longbow"],
] as const;

const LONGBOW_TITLE = "Borrowable on Longbow: Longbow (Morpho Blue lending on Robinhood Chain) lends USDG against this token";

type View = (typeof VIEWS)[number][0];

/** A new listing: "New · 6 hours of prices", until it has 30 days. */
function NewPill({ hours }: { hours: number | null }) {
  if (hours === null) return null;
  return (
    <span className="pill pill--accent market-new" title="Listed recently. Rule strategies need more history; DCA can use it now.">
      New · {hoursText(hours)} of prices
    </span>
  );
}

/** Signed percent, or a dash while a stock is too new to compare. */
function Change({ value }: { value: number | null }) {
  return value === null ? <span className="muted">–</span> : <span className={tone(value)}>{percent(value)}</span>;
}

export function Spark({ values, height = 32 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null;
  const color = values[values.length - 1] >= values[0] ? "var(--color-gain)" : "var(--color-loss)";
  return (
    <svg className="spark" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={sparkline(values, height, 3)} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Market groups on the page, each with its own wording. Crypto holds the coins on the DEX
 * and the Lighter perps (paper, Lab agents only), which all have assetClass crypto.
 */
const ASSETS = {
  stock: { label: "Stocks", noun: "stock", column: "Stock", placeholder: "Search NVDA, Tesla…", example: "a ticker like NVDA or a name like Tesla" },
  crypto: { label: "Crypto", noun: "coin", column: "Coin", placeholder: "Search ETH, Bitcoin, SOL-PERP…", example: "ETH, Bitcoin or SOL-PERP" },
} as const;

const inGroup = (row: MarketRow, asset: Asset) => row.assetClass === asset;


type Asset = keyof typeof ASSETS;

/**
 * The line above the table. US market hours only matter to stocks: while Nasdaq is closed their
 * prices come from onchain trading only. Coins and perps trade around the clock.
 */
function MarketStatus({ asset, asOf, marketOpen }: { asset: Asset; asOf: number; marketOpen: boolean }) {
  if (asset === "crypto")
    return (
      <p className="market-status">
        <span className="pill pill--running">Trades 24/7</span>
        <span className="muted">Prices as of {dateAt(asOf)}. Coins and perps trade around the clock. These are token and perp prices, not live exchange quotes.</span>
      </p>
    );
  return (
    <p className="market-status">
      <span className={`pill ${marketOpen ? "pill--running" : "pill--paused"}`}>{marketOpen ? "US market open" : "US market closed"}</span>
      {!marketOpen && <span className="pill">Onchain prices only</span>}
      <span className="muted">
        Prices as of {dateAt(asOf)}. {marketOpen ? "" : "While Nasdaq is closed, stock token prices come from onchain trading only and can drift from the real stock. "}These are token prices, not live exchange quotes.
      </span>
    </p>
  );
}

/** borrowable: lowercase token addresses Longbow lends USDG against (lib/longbow.ts); empty hides the Longbow tab. */
export function Markets({ rows, asOf, marketOpen, borrowable = [] }: { rows: MarketRow[]; asOf: number; marketOpen: boolean; borrowable?: string[] }) {
  const [asset, setAsset] = useState<Asset>("stock");
  // Sits in the same row as the filters, so the page has one toolbar.
  const assetTabs = (
    <div className="tabs asset-tabs" role="tablist" aria-label="Market">
      {(Object.keys(ASSETS) as Asset[]).map((key) => (
        <button key={key} className="tab" role="tab" type="button" aria-selected={asset === key} onClick={() => setAsset(key)}>
          {ASSETS[key].label}
        </button>
      ))}
    </div>
  );
  // key resets the filters and search when switching between stocks and crypto.
  return (
    <>
      <MarketStatus asset={asset} asOf={asOf} marketOpen={marketOpen} />
      <MarketList key={asset} asset={asset} rows={rows.filter((row) => inGroup(row, asset))} leading={assetTabs} borrowable={borrowable} />
    </>
  );
}

function MarketList({ asset, rows, leading, borrowable }: { asset: Asset; rows: MarketRow[]; leading: ReactNode; borrowable: string[] }) {
  const words = ASSETS[asset];
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  // Perps are never Longbow collateral (only spot tokens are).
  const onLongbow = useMemo(() => {
    const set = new Set(borrowable);
    return (row: MarketRow) => row.venue !== "lighter" && set.has(row.address.toLowerCase());
  }, [borrowable]);
  const views = rows.some(onLongbow) ? VIEWS : VIEWS.filter(([key]) => key !== "longbow");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => !needle || row.symbol.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle));
    const day = (row: MarketRow) => row.stats.change24h ?? 0;
    if (view === "gainers") return list.filter((row) => day(row) > 0).sort((a, b) => day(b) - day(a));
    if (view === "losers") return list.filter((row) => day(row) < 0).sort((a, b) => day(a) - day(b));
    if (view === "longbow") return list.filter(onLongbow).sort((a, b) => a.symbol.localeCompare(b.symbol));
    return list.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [rows, view, query, onLongbow]);

  return (
    <>
      <div className="filter-row">
        <div className="filter-group">
          {leading}
          <div className="tabs" role="tablist" aria-label="Show">
            {views.map(([key, label]) => (
              <button key={key} className="tab" role="tab" type="button" aria-selected={view === key} onClick={() => setView(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="market-search">
          <i className="ph ph-magnifying-glass" aria-hidden="true" />
          <span className="sr-only">Search {words.label.toLowerCase()}</span>
          <input className="input" type="search" placeholder={words.placeholder} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      {!visible.length ? (
        <div className="card">
          <div className="empty">
            <h2 className="card__title">
              {query
                ? `No ${words.noun} matches "${query.trim()}"`
                : view === "gainers"
                  ? "Nothing is up in the last 24 hours"
                  : view === "longbow"
                    ? `Longbow lends against none of these ${words.label.toLowerCase()} right now`
                    : "Nothing is down in the last 24 hours"}
            </h2>
            <p>{query ? `Try ${words.example}.` : `Check All to see every ${words.noun}.`}</p>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => {
                setQuery("");
                setView("all");
              }}
            >
              Show all {words.label.toLowerCase()}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card only-desktop">
            <div className="table-wrap">
              <table className="table table--clickable markets-table">
                <thead>
                  <tr>
                    <th>{words.column}</th>
                    <th className="num">Price</th>
                    <th className="num col-wide">1h</th>
                    <th className="num">24h</th>
                    <th className="num">7d</th>
                    <th>Last 7 days</th>
                    {asset === "crypto" && (
                      <th className="num" title="Funding at the last hour, as a yearly rate. Positive: longs pay shorts.">
                        Funding
                      </th>
                    )}
                    <th className="num">Agents</th>
                    <th className="col-wide">
                      <span className="sr-only">Build</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.address}>
                      <td>
                        <Link className="agent-cell row-link" href={`/markets/${row.symbol}`}>
                          <TickerAvatar symbol={row.symbol} />
                          <span>
                            <strong>{row.symbol}</strong> <NewPill hours={row.stats.newHours} />
                            {onLongbow(row) && <>{" "}<LongbowMark title={LONGBOW_TITLE} /></>}
                            <span className="market-name">{row.name}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="num">{price(row.stats.price)}</td>
                      <td className="num col-wide">
                        <Change value={row.stats.change1h} />
                      </td>
                      <td className="num">
                        <Change value={row.stats.change24h} />
                      </td>
                      <td className="num">
                        <Change value={row.stats.change7d} />
                      </td>
                      <td className="markets-table__spark">
                        <Spark values={row.stats.week} />
                      </td>
                      {asset === "crypto" && <td className="num">{fundingYearly(row.funding?.lastYearly)}</td>}
                      <td className="num">{row.agents || <span className="muted">0</span>}</td>
                      <td className="num col-wide">
                        {row.venue === "lighter" ? (
                          <span className="pill" title="Perps run on paper with Zolva's Lab agents for now; the Studio builds spot agents">
                            Lab only
                          </span>
                        ) : (
                          <Link className="button button--ghost button--small" href={`/studio?stock=${row.symbol}`}>
                            Build agent
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* The perps (BTC-PERP and others) come from Lighter: credit the source under the crypto list. */}
          {asset === "crypto" && visible.some((row) => row.venue === "lighter") && (
            <div className="markets-source">
              <span className="muted">Perps prices and funding from Lighter</span>
              <LighterBadge height={24} />
            </div>
          )}

          <div className="leader-cards only-mobile">
            {visible.map((row) => (
              <Link key={row.address} className="leader-card market-card" href={`/markets/${row.symbol}`}>
                <TickerAvatar symbol={row.symbol} />
                <span className="market-card__name">
                  <strong>{row.symbol}</strong> <NewPill hours={row.stats.newHours} />
                  {onLongbow(row) && <>{" "}<LongbowMark title={LONGBOW_TITLE} /></>}
                  <span className="market-name">{row.name}</span>
                </span>
                <Spark values={row.stats.week} height={28} />
                <span className="market-card__price">
                  <strong>{price(row.stats.price)}</strong>
                  <Change value={row.stats.change24h} />
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
