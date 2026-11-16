"use client";

import { useState, type ReactNode } from "react";

import type { Ledger, LedgerRow } from "@/lib/agents/ledger";
import { EXPLORER_URL } from "@/lib/chain";
import { dateAt, isMarketHours, price, shortAddress, signedUsd, tone, usd } from "@/lib/format";

/** Rows shown before "Show all". */
const FIRST_ROWS = 20;

const REASONS: Record<string, { label: string; pill: string; title?: string }> = {
  stop_loss: { label: "Stop loss", pill: "pill--warn" },
  take_profit: { label: "Take profit", pill: "pill--running" },
  max_hold: { label: "Max hold", pill: "" },
  manual: { label: "Manual", pill: "", title: "Sold by the owner with Sell position" },
  resize: { label: "Resize", pill: "", title: "Moved back toward the volatility target at 00:00 UTC" },
};

/** Up to 6 significant digits, so a BTC fraction and a share count both read well. */
const amount = (value: number) => (value >= 1000 ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : Number(value.toPrecision(6)).toString());

/** dexHours: label stock orders placed while New York was closed (not on perps). */
function Row({ row, live, dexHours }: { row: LedgerRow; live: boolean; dexHours: boolean }) {
  const reason = REASONS[row.reason];
  return (
    <tr>
      <td className="muted">{dateAt(row.ts)}</td>
      <td>
        <span className="ledger__order">
          <span className={`decision__action decision__action--${row.side}`}>{row.side}</span>
          <strong>{row.symbol}</strong>
          {reason && (
            <span className={`pill ${reason.pill}`} title={reason.title}>
              {reason.label}
            </span>
          )}
          {dexHours && !isMarketHours(row.ts) && (
            <span className="pill" title="New York exchange closed. Price came from Robinhood Chain trading only.">
              DEX hours
            </span>
          )}
        </span>
      </td>
      <td className="num">{amount(row.quantity)}</td>
      <td className="num">{price(row.price)}</td>
      <td className="num muted">{usd(row.costUsd)}</td>
      <td className={`num ${tone(row.cashFlow)}`}>{signedUsd(row.cashFlow)}</td>
      <td className="num">{usd(row.cashAfter)}</td>
      <td className={`num ${row.realisedPnl === null ? "" : tone(row.realisedPnl)}`}>{row.realisedPnl === null ? <span className="muted">–</span> : signedUsd(row.realisedPnl)}</td>
      {live && (
        <td>
          {row.txHash && (
            <a className="text-link" href={`${EXPLORER_URL}/tx/${row.txHash}`} target="_blank" rel="noopener noreferrer" title="Swap on Blockscout">
              Tx <i className="ph ph-arrow-up-right" aria-hidden="true" />
            </a>
          )}
        </td>
      )}
    </tr>
  );
}

/**
 * Every order the agent placed, with the cash it moved and running totals (lib/agents/ledger.ts):
 * start capital + realised + unrealised = value now, checked against the recorded cash.
 */
export function OrderLedger({ ledger, live, perps, wallet, empty }: { ledger: Ledger; live: boolean; perps: boolean; wallet: string | null; empty: ReactNode }) {
  const [showAll, setShowAll] = useState(false);
  const { totals } = ledger;
  const newestFirst = [...ledger.rows].reverse();
  const rows = showAll ? newestFirst : newestFirst.slice(0, FIRST_ROWS);
  const gap = totals.recordedCash - totals.ledgerCash;
  const costLabel = live ? "Costs (gas and slippage)" : perps ? "Costs (0.05% per order)" : "Costs (0.5% per order)";

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card__title">Order ledger</h2>
        <span className="muted" style={{ fontSize: 14, lineHeight: "20px" }}>
          {ledger.rows.length} {ledger.rows.length === 1 ? "order" : "orders"}
          {live && wallet && (
            <>
              {" "}
              from{" "}
              <a className="text-link mono" href={`${EXPLORER_URL}/address/${wallet}`} target="_blank" rel="noopener noreferrer" title="The agent's wallet on Blockscout">
                {shortAddress(wallet)} <i className="ph ph-arrow-up-right" aria-hidden="true" />
              </a>
            </>
          )}
        </span>
      </div>

      {!ledger.rows.length ? (
        empty
      ) : (
        <>
          <div className="stat-grid ledger__stats">
            <div className="stat">
              <span className="stat__label">Start capital</span>
              <span className="stat__value">{usd(totals.startCapital)}</span>
            </div>
            <div className="stat">
              <span className="stat__label">Realised P&amp;L</span>
              <span className={`stat__value ${tone(totals.realisedPnl)}`}>{signedUsd(totals.realisedPnl)}</span>
            </div>
            <div className="stat">
              <span className="stat__label">Unrealised P&amp;L</span>
              <span className={`stat__value ${tone(totals.unrealisedPnl)}`}>{signedUsd(totals.unrealisedPnl)}</span>
            </div>
            <div className="stat">
              <span className="stat__label">Value now</span>
              <span className="stat__value">{usd(totals.valueNow)}</span>
            </div>
          </div>

          <dl className="ledger__notes">
            <div>
              <dt>{costLabel}</dt>
              <dd>{usd(totals.costs)}</dd>
            </div>
            {totals.funding !== null && (
              <div>
                <dt>Funding, net</dt>
                <dd className={tone(totals.funding)}>{signedUsd(totals.funding)}</dd>
              </div>
            )}
            <div>
              <dt>Cash now</dt>
              <dd>{usd(totals.recordedCash)}</dd>
            </div>
          </dl>
          <p className="ledger__check">
            {totals.balances ? (
              <>
                <i className="ph ph-check-circle gain" aria-hidden="true" />
                <span>
                  Balances: {usd(totals.startCapital)} start {signedUsd(totals.realisedPnl)} realised {signedUsd(totals.unrealisedPnl)} unrealised = {usd(totals.valueNow)} now, and the
                  orders add up to the recorded cash. P&amp;L is after costs{totals.funding !== null ? " and funding" : ""}.
                </span>
              </>
            ) : (
              <>
                <i className="ph ph-warning-circle loss" aria-hidden="true" />
                <span>The orders add up to {usd(totals.ledgerCash)} cash, {signedUsd(-gap)} away from the recorded {usd(totals.recordedCash)}.</span>
              </>
            )}
          </p>
          {totals.quantityMismatches.length > 0 && (
            <p className="ledger__check">
              <i className="ph ph-warning-circle loss" aria-hidden="true" />
              <span>
                The recorded holding of {totals.quantityMismatches.map((token) => ledger.rows.find((row) => row.token === token)?.symbol ?? token).join(", ")} differs from what these orders add up to, so its unrealised P&amp;L
                counts the difference as a loss.
              </span>
            </p>
          )}

          <div className="table-wrap">
            <table className="table ledger__table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Order</th>
                  <th className="num">Quantity</th>
                  <th className="num">Price</th>
                  <th className="num">Cost</th>
                  <th className="num">Cash in / out</th>
                  <th className="num">Cash after</th>
                  <th className="num">Realised</th>
                  {live && <th className="sr-only">Transaction</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <Row key={`${row.ts}-${row.token}-${row.side}-${i}`} row={row} live={live} dexHours={!perps} />
                ))}
              </tbody>
            </table>
          </div>
          {newestFirst.length > FIRST_ROWS && (
            <button className="button button--ghost button--small ledger__more" type="button" onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Show the latest 20" : `Show all ${newestFirst.length} orders`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
