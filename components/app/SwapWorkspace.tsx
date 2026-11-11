"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SwapDialog } from "@/components/app/SwapDialog";
import { LineChart } from "@/components/ui/LineChart";
import { TickerAvatar } from "@/components/ui/TickerAvatar";
import { EXPLORER_URL } from "@/lib/chain";
import { percent, price, tone } from "@/lib/format";
import type { SwapToken } from "@/lib/swap";

type Chart = { startTs: number; closes: number[] };
type Transaction = { txHash: string; ts: number; changes: { symbol: string; amount: number }[] };

/** "3 h ago", "2 days ago" from unix seconds. */
function ago(ts: number): string {
  const minutes = Math.floor((Date.now() / 1000 - ts) / 60);
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Amounts with sensible precision: 0.000752 ETH, 1.68 USDG, 12.5 NVDA. */
function amount(value: number): string {
  const size = Math.abs(value);
  return size >= 100 ? size.toFixed(2) : size >= 1 ? size.toFixed(3) : size.toPrecision(3);
}

/**
 * The swap page: the swap card, and beside it the chart of the token being bought and the
 * wallet's latest transactions with Zolva's tokens (refreshed after each swap).
 */
export function SwapWorkspace({ address, loginMethod }: { address: string | null; loginMethod: "privy" | "wallet" | null }) {
  const [buy, setBuy] = useState<SwapToken | null>(null);
  const [chart, setChart] = useState<{ address: string; data: Chart | null } | null>(null);
  const [history, setHistory] = useState<Transaction[] | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    // USDG has no chart of its own (it is the dollar), and an imported token has no Zolva prices.
    if (!buy || (buy.pool === null && !buy.verified && !buy.pons) || (buy.listed === false && !buy.pons)) return;
    fetch(`/api/swap?chart=${buy.address}`)
      .then((response) => (response.ok ? (response.json() as Promise<Chart>) : null))
      .then((data) => setChart({ address: buy.address, data }))
      .catch(() => setChart({ address: buy.address, data: null }));
  }, [buy]);

  useEffect(() => {
    if (!address) return;
    fetch("/api/swap?history")
      .then((response) => (response.ok ? (response.json() as Promise<{ transactions: Transaction[] }>) : Promise.reject()))
      .then((body) => setHistory(body.transactions))
      .catch(() => setHistory([]));
  }, [address, historyVersion]);

  const data = chart && buy && chart.address === buy.address ? chart.data : null;
  const last = data?.closes.at(-1) ?? null;
  const dayAgo = data && data.closes.length > 24 ? data.closes[data.closes.length - 25] : null;
  const change24h = last !== null && dayAgo ? (last / dayAgo - 1) * 100 : null;
  const weekChange = data && data.closes.length > 1 ? (data.closes[data.closes.length - 1] / data.closes[0] - 1) * 100 : null;

  return (
    <div className="swap-workspace">
      <div className="swap-workspace__main">
        <SwapDialog address={address} loginMethod={loginMethod} inline onPair={setBuy} onSwapped={() => setHistoryVersion((version) => version + 1)} />
      </div>

      <div className="swap-workspace__side">
        <section className="card swap-chart" aria-label="Price chart">
          {buy && (buy.pool !== null || buy.verified || buy.pons) ? (
            <>
              <div className="swap-chart__head">
                <TickerAvatar symbol={buy.symbol} size={36} />
                <div>
                  <strong>{buy.symbol}</strong>
                  <span className="muted">{buy.name}</span>
                </div>
                <div className="swap-chart__price">
                  <strong>{last !== null ? price(last) : "–"}</strong>
                  {change24h !== null && <span className={tone(change24h)}>{percent(change24h)} 24h</span>}
                </div>
              </div>
              {buy.listed === false && !buy.pons ? (
                <div className="swap-chart__empty muted">An imported token: Zolva keeps no price history for it. Check its chart on GeckoTerminal.</div>
              ) : data && data.closes.length > 1 ? (
                <LineChart
                  startTs={data.startTs}
                  height={200}
                  step={2}
                  legend={false}
                  series={[{ label: buy.symbol, values: data.closes, color: weekChange !== null && weekChange < 0 ? "var(--color-loss)" : "var(--color-purple-rich)" }]}
                />
              ) : (
                <div className="swap-chart__empty muted">{chart?.address === buy.address ? "No price history for this token yet." : "Loading the chart…"}</div>
              )}
              <div className="swap-chart__foot">
                <span className="muted">
                  {buy.listed === false ? "Not on Zolva's list" : <>7 days of hourly closes{weekChange !== null && <> · <span className={tone(weekChange)}>{percent(weekChange)}</span></>}</>}
                </span>
                {buy.verified || buy.pons ? (
                  <a className="text-link" href={`https://ponsfamily.com/launchpad/${buy.address}`} target="_blank" rel="noopener noreferrer">
                    {buy.symbol} on Pons <i className="ph ph-arrow-up-right" aria-hidden="true" />
                  </a>
                ) : buy.listed === false ? (
                  <a className="text-link" href={`https://www.geckoterminal.com/robinhood/tokens/${buy.address}`} target="_blank" rel="noopener noreferrer">
                    {buy.symbol} on GeckoTerminal <i className="ph ph-arrow-up-right" aria-hidden="true" />
                  </a>
                ) : (
                  <Link className="text-link" href={`/markets/${buy.symbol}`}>
                    {buy.symbol} on Markets <i className="ph ph-arrow-right" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </>
          ) : (
            <div className="swap-chart__empty muted">Pick a token to buy to see its chart.</div>
          )}
        </section>

        <section className="card swap-history" aria-label="Your recent transactions">
          <div className="card-head" style={{ marginBottom: "var(--space-100)" }}>
            <h2 className="card__title">Recent transactions</h2>
            {address && (
              <a className="text-link" href={`${EXPLORER_URL}/address/${address}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                All on Blockscout <i className="ph ph-arrow-up-right" aria-hidden="true" />
              </a>
            )}
          </div>
          {!address ? (
            <p className="muted swap-history__empty">Log in to see your wallet&apos;s latest swaps here.</p>
          ) : history === null ? (
            <p className="muted swap-history__empty">Loading…</p>
          ) : history.length === 0 ? (
            <p className="muted swap-history__empty">No transactions with Zolva&apos;s tokens in the last 7 days.</p>
          ) : (
            <ul className="swap-history__list">
              {history.map((tx) => {
                const sent = tx.changes.filter((change) => change.amount < 0);
                const received = tx.changes.filter((change) => change.amount > 0);
                return (
                  <li key={tx.txHash}>
                    <a className="swap-history__row" href={`${EXPLORER_URL}/tx/${tx.txHash}`} target="_blank" rel="noopener noreferrer">
                      <span className="swap-history__icons" aria-hidden="true">
                        {tx.changes.slice(0, 2).map((change) => (
                          <TickerAvatar key={change.symbol} symbol={change.symbol} size={24} />
                        ))}
                      </span>
                      <span className="swap-history__text">
                        <strong>
                          {sent.length && received.length ? "Swap" : received.length ? "Received" : "Sent"} {[...sent, ...received].map((change) => change.symbol).join(" → ")}
                        </strong>
                        <span className="muted">{ago(tx.ts)}</span>
                      </span>
                      <span className="swap-history__amounts">
                        {received.map((change) => (
                          <span key={change.symbol} className="gain">
                            +{amount(change.amount)} {change.symbol}
                          </span>
                        ))}
                        {sent.map((change) => (
                          <span key={change.symbol} className="muted">
                            −{amount(change.amount)} {change.symbol}
                          </span>
                        ))}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
