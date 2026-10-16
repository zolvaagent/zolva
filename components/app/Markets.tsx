"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { TickerAvatar } from "@/components/ui/TickerAvatar";
import type { MarketRow } from "@/lib/data/markets";
import { percent, price, sparkline, tone } from "@/lib/format";

const VIEWS = [
  ["all", "All"],
  ["gainers", "Top gainers"],
  ["losers", "Top losers"],
] as const;

type View = (typeof VIEWS)[number][0];

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

/** Asset classes on the page. Crypto is announced but not built yet. */
const ASSETS = [
  ["stocks", "Stocks"],
  ["crypto", "Crypto"],
] as const;

export function Markets({ rows }: { rows: MarketRow[] }) {
  const [asset, setAsset] = useState<(typeof ASSETS)[number][0]>("stocks");
  // Sits in the same row as the stock filters, so the page has one toolbar.
  const assetTabs = (
    <div className="tabs asset-tabs" role="tablist" aria-label="Market">
      {ASSETS.map(([key, label]) => (
        <button key={key} className="tab" role="tab" type="button" aria-selected={asset === key} onClick={() => setAsset(key)}>
          {label}
          {key === "crypto" && <span className="pill pill--accent">Soon</span>}
        </button>
      ))}
    </div>
  );
  if (asset === "stocks") return <StockMarkets rows={rows} leading={assetTabs} />;
  return (
    <>
      <div className="filter-row">
        <div className="filter-group">{assetTabs}</div>
      </div>
      <CryptoSoon />
    </>
  );
}

function CryptoSoon() {
  return (
    <div className="card">
      <div className="empty">
        <span className="choice__glyph" aria-hidden="true">
          <i className="ph ph-currency-eth" />
        </span>
        <h2 className="card__title">Crypto markets are coming</h2>
        <p>Crypto tokens on Robinhood Chain, priced every hour from their onchain pools like the stocks are today. Your agents will trade them with the same strategies and rules.</p>
        <p className="muted" style={{ fontSize: 13 }}>
          Not available yet. Stocks are live now.
        </p>
      </div>
    </div>
  );
}

function StockMarkets({ rows, leading }: { rows: MarketRow[]; leading: ReactNode }) {
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => !needle || row.symbol.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle));
    const day = (row: MarketRow) => row.stats.change24h ?? 0;
    if (view === "gainers") return list.filter((row) => day(row) > 0).sort((a, b) => day(b) - day(a));
    if (view === "losers") return list.filter((row) => day(row) < 0).sort((a, b) => day(a) - day(b));
    return list.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [rows, view, query]);

  return (
    <>
      <div className="filter-row">
        <div className="filter-group">
          {leading}
          <div className="tabs" role="tablist" aria-label="Show">
            {VIEWS.map(([key, label]) => (
              <button key={key} className="tab" role="tab" type="button" aria-selected={view === key} onClick={() => setView(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="market-search">
          <i className="ph ph-magnifying-glass" aria-hidden="true" />
          <span className="sr-only">Search stocks</span>
          <input className="input" type="search" placeholder="Search NVDA, Tesla…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      {!visible.length ? (
        <div className="card">
          <div className="empty">
            <h2 className="card__title">{query ? `No stock matches "${query.trim()}"` : view === "gainers" ? "Nothing is up in the last 24 hours" : "Nothing is down in the last 24 hours"}</h2>
            <p>{query ? "Try a ticker like NVDA or a name like Tesla." : "Check All to see every stock."}</p>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => {
                setQuery("");
                setView("all");
              }}
            >
              Show all stocks
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
                    <th>Stock</th>
                    <th className="num">Price</th>
                    <th className="num col-wide">1h</th>
                    <th className="num">24h</th>
                    <th className="num">7d</th>
                    <th>Last 7 days</th>
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
                        <Link className="agent-cell" href={`/markets/${row.symbol}`}>
                          <TickerAvatar symbol={row.symbol} />
                          <span>
                            <strong>{row.symbol}</strong>
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
                      <td className="num">{row.agents || <span className="muted">0</span>}</td>
                      <td className="num col-wide">
                        <Link className="button button--ghost button--small" href={`/studio?stock=${row.symbol}`}>
                          Build agent
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="leader-cards only-mobile">
            {visible.map((row) => (
              <Link key={row.address} className="leader-card market-card" href={`/markets/${row.symbol}`}>
                <TickerAvatar symbol={row.symbol} />
                <span className="market-card__name">
                  <strong>{row.symbol}</strong>
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
