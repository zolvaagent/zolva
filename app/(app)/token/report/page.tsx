import type { Metadata } from "next";
import Link from "next/link";

import { EXPLORER_URL } from "@/lib/chain";
import { loadTokenReport } from "@/lib/data/token-report";
import { env } from "@/lib/env";
import { dateAt, shortAddress } from "@/lib/format";
import { createChainClient } from "@/lib/prices/onchain";
import { db } from "@/lib/supabase";
import { DEAD, ZOLVA } from "@/lib/swap-zolva";
import { BURN_LABELS } from "@/lib/token-report";

export const metadata: Metadata = {
  title: "ZOLVA report",
  description: "Every ZOLVA burn on chain, the swap fees waiting for the next buyback, and how AI credits were granted and spent.",
};
export const dynamic = "force-dynamic";

const tokens = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const dollars = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 4 : 2 })}`;
const amount = (value: number) => (value === 0 ? "0" : value >= 1 ? value.toLocaleString("en-US", { maximumFractionDigits: 4 }) : Number(value.toPrecision(4)).toString());

/**
 * The public ZOLVA report: plain numbers with their sources. Burns and the fee wallet are read from
 * Robinhood Chain; AI credits are totals from Zolva's ledger, never per user. Refreshed every 10 minutes.
 */
export default async function TokenReportPage() {
  const report = await loadTokenReport(db(), createChainClient(env.robinhoodRpcUrl), env.swapFee?.recipient ?? null);
  const burntPct = report.supply > 0 ? (report.burnt / report.supply) * 100 : 0;
  return (
    <div className="container page token-report">
      <div className="page__head">
        <div>
          <h1 className="page__title">ZOLVA report</h1>
          <p className="page__lead">
            What has been burnt, what the swap fee has collected for the next buyback, and how AI credits were used. Read from Robinhood Chain and Zolva&apos;s ledger, updated {dateAt(report.builtAt)}.
          </p>
        </div>
        <Link className="button button--ghost" href="/docs/token">
          How ZOLVA works
        </Link>
      </div>

      <section className="stat-grid token-report__stats" aria-label="Burnt">
        <div className="stat">
          <span className="stat__label">ZOLVA burnt</span>
          <span className="stat__value">{tokens(report.burnt)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Of the supply</span>
          <span className="stat__value">{burntPct.toFixed(2)}%</span>
        </div>
        <div className="stat">
          <span className="stat__label">Total supply</span>
          <span className="stat__value">{tokens(report.supply)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Burns</span>
          <span className="stat__value">{report.burnTotals.reduce((sum, row) => sum + row.count, 0)}</span>
        </div>
      </section>
      <p className="muted token-report__source">
        Burnt means held by the dead address{" "}
        <a className="text-link mono" href={`${EXPLORER_URL}/token/${ZOLVA}?a=${DEAD}`} target="_blank" rel="noopener noreferrer">
          {shortAddress(DEAD)}
        </a>
        , which no one can spend from.
      </p>

      <div className="token-report__grid">
        <section className="card" aria-labelledby="burn-kinds">
          <h2 className="card__title" id="burn-kinds">
            Where the burns came from
          </h2>
          <p className="muted token-report__note">In ZOLVA.</p>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {report.burnTotals.map((row) => (
                  <tr key={row.kind}>
                    <td>
                      {BURN_LABELS[row.kind]}
                      <span className="muted"> · {row.count === 1 ? "1 burn" : `${row.count} burns`}</span>
                    </td>
                    <td className="num">
                      <strong>{tokens(row.amount)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" aria-labelledby="fee-wallet">
          <h2 className="card__title" id="fee-wallet">
            Swap fees waiting for the next buyback
          </h2>
          {report.feeWallet ? (
            <>
              <p className="muted token-report__note">
                The 0.25% fee on swaps between USDG, ETH, BTC and Pons tokens collects in{" "}
                <a className="text-link mono" href={`${EXPLORER_URL}/address/${report.feeWallet.address}`} target="_blank" rel="noopener noreferrer">
                  {shortAddress(report.feeWallet.address)}
                </a>{" "}
                until it buys ZOLVA and burns it. On ZOLVA buys the fee is burnt in the swap itself.
              </p>
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {report.feeWallet.balances.map((balance) => (
                      <tr key={balance.symbol}>
                        <td>{balance.symbol}</td>
                        <td className="num">{amount(balance.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="muted">No fee wallet is set right now, so other swaps pay no Zolva fee.</p>
          )}
        </section>

        <section className="card" aria-labelledby="ai-credits">
          <h2 className="card__title" id="ai-credits">
            AI credits
          </h2>
          <p className="muted token-report__note">Totals across all accounts. AI credits pay for the co-pilot&apos;s reviews and for writing strategies from words.</p>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                <tr>
                  <td>Free credits given to new accounts</td>
                  <td className="num">{dollars(report.credits.freeGrantedUsd)}</td>
                </tr>
                <tr>
                  <td>Paid credits added (top-ups and grants)</td>
                  <td className="num">{dollars(report.credits.paidAddedUsd)}</td>
                </tr>
                <tr>
                  <td>Spent</td>
                  <td className="num">{dollars(report.credits.spentUsd)}</td>
                </tr>
                <tr>
                  <td>Co-pilot reviews</td>
                  <td className="num">{report.credits.reviews.toLocaleString("en-US")}</td>
                </tr>
                <tr>
                  <td>Strategies written from words</td>
                  <td className="num">{report.credits.strategies.toLocaleString("en-US")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card" aria-labelledby="burn-log">
        <div className="card-head">
          <h2 className="card__title" id="burn-log">
            Every burn
          </h2>
          <span className="muted">Newest first</span>
        </div>
        {report.burns.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Kind</th>
                  <th className="num">ZOLVA</th>
                  <th className="sr-only">Transaction</th>
                </tr>
              </thead>
              <tbody>
                {report.burns.map((burn) => (
                  <tr key={`${burn.txHash}-${burn.amount}`}>
                    <td className="muted">{burn.ts !== null ? dateAt(burn.ts) : `Block ${burn.blockNumber}`}</td>
                    <td>{BURN_LABELS[burn.kind]}</td>
                    <td className="num">{tokens(burn.amount)}</td>
                    <td>
                      <a className="text-link" href={`${EXPLORER_URL}/tx/${burn.txHash}`} target="_blank" rel="noopener noreferrer">
                        Tx <i className="ph ph-arrow-up-right" aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No burns yet.</p>
        )}
      </section>
    </div>
  );
}
