"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useToast } from "@/components/ui/Providers";
import { TickerAvatar } from "@/components/ui/TickerAvatar";
import type { AlertView, GuardView, GuardianView, Holding } from "@/lib/guardian/data";
import { dateAt, price, shortAddress, usd } from "@/lib/format";

/** Form values while setting or editing a guard (strings, as typed). */
type Draft = { stopLossPct: string; takeProfitPct: string; basisPrice: string };

const DEFAULT_STOP = "8";

/** /guardian: alerts, the account's holdings with their guards, and the watched wallets. */
export function GuardianPanel({ data }: { data: GuardianView }) {
  const router = useRouter();
  const toast = useToast();
  // Which row's form is open: "new:<wallet>:<token>" or a guard id.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ stopLossPct: DEFAULT_STOP, takeProfitPct: "", basisPrice: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening the page counts as reading the alerts; the "New" marks stay until the next visit.
  const unread = data.alerts.filter((alert) => !alert.read).length;
  useEffect(() => {
    if (unread > 0) void fetch("/api/guardian/alerts", { method: "POST" }).then(() => window.dispatchEvent(new Event("zolva:guardian-read")));
  }, [unread]);

  const guardOf = (wallet: string, token: string) => data.guards.find((guard) => guard.wallet === wallet && guard.tokenAddress === token) ?? null;
  // Guards on tokens no longer held still show, so they can be removed.
  const orphanGuards = data.guards.filter((guard) => !data.holdings.some((holding) => holding.wallet === guard.wallet && holding.tokenAddress === guard.tokenAddress));
  const atLimit = data.guards.length >= data.maxGuards;

  const open = (key: string, initial: Draft) => {
    setEditing(key);
    setDraft(initial);
    setError(null);
  };

  const send = async (url: string, method: "POST" | "PATCH" | "DELETE", body?: object, done?: string) => {
    setBusy(true);
    setError(null);
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response?.ok) return setError(result?.error ?? "Something went wrong. Please try again.");
    setEditing(null);
    if (done) toast(done);
    router.refresh();
  };

  const form = (onSave: () => void, holding: Holding | null) => (
    <form
      className="guardian-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label>
        <span>Stop loss %</span>
        <input className="input" inputMode="decimal" required value={draft.stopLossPct} onChange={(event) => setDraft({ ...draft, stopLossPct: event.target.value })} />
      </label>
      <label>
        <span>Take profit % (optional)</span>
        <input className="input" inputMode="decimal" placeholder="None" value={draft.takeProfitPct} onChange={(event) => setDraft({ ...draft, takeProfitPct: event.target.value })} />
      </label>
      <label>
        <span>Measured from ($)</span>
        <input className="input" inputMode="decimal" placeholder={holding?.price ? `${holding.price.toFixed(2)} (now)` : "Price"} value={draft.basisPrice} onChange={(event) => setDraft({ ...draft, basisPrice: event.target.value })} />
      </label>
      <div className="guardian-form__actions">
        <button className="button button--primary" type="submit" disabled={busy}>
          Save guard
        </button>
        <button className="button button--ghost" type="button" disabled={busy} onClick={() => setEditing(null)}>
          Cancel
        </button>
      </div>
      <p className="guardian-form__hint muted">Empty &quot;measured from&quot; uses the latest hourly close. Enter what you paid to measure from your own entry.</p>
      {error && (
        <p className="guardian-form__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );

  const guardSummary = (guard: GuardView) => (
    <span className="guardian-guard">
      <span className={`pill ${guard.status === "armed" ? "pill--running" : "pill--warn"}`}>{guard.status === "armed" ? "Armed" : "Triggered"}</span>
      <span className="muted">
        Stop {price(guard.stopPrice)} (−{guard.stopLossPct}%)
        {guard.takeProfitPrice !== null && ` · Take profit ${price(guard.takeProfitPrice)} (+${guard.takeProfitPct}%)`}
      </span>
    </span>
  );

  const guardActions = (guard: GuardView) => (
    <span className="guardian-actions">
      <button
        className="button button--ghost"
        type="button"
        onClick={() => open(guard.id, { stopLossPct: String(guard.stopLossPct), takeProfitPct: guard.takeProfitPct === null ? "" : String(guard.takeProfitPct), basisPrice: String(guard.basisPrice) })}
      >
        {guard.status === "triggered" ? "Re-arm" : "Edit"}
      </button>
      <button className="button button--ghost" type="button" disabled={busy} onClick={() => void send(`/api/guardian/${guard.id}`, "DELETE", undefined, "Guard removed")}>
        Remove
      </button>
    </span>
  );

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: "var(--space-300)" }}>
        <div className="stat">
          <span className="stat__label">Holdings watched</span>
          <span className="stat__value">{data.holdings.length}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Guards</span>
          <span className="stat__value">
            {data.guards.length}{" "}
            <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
              of {data.maxGuards}
            </span>
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Value held</span>
          <span className="stat__value">{usd(data.holdings.reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0))}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Alerts</span>
          <span className="stat__value">{data.alerts.length}</span>
        </div>
      </div>

      <TelegramCard telegram={data.telegram} />

      {data.alerts.length > 0 && (
        <section className="card guardian-alerts" aria-labelledby="guardian-alerts-title">
          <h2 className="card__title" id="guardian-alerts-title">
            Alerts
          </h2>
          <ul className="guardian-alerts__list">
            {data.alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="guardian-holdings-title" style={{ marginTop: "var(--space-300)" }}>
        <div className="card-head">
          <h2 className="card__title" id="guardian-holdings-title">
            Your holdings
          </h2>
          {data.pricedAt !== null && <span className="muted" style={{ fontSize: 12 }}>Prices at {dateAt(data.pricedAt)}</span>}
        </div>
        {data.holdings.length === 0 ? (
          <div className="empty">
            <p>No Stock Tokens in your watched wallets yet. Buy some on Zolva Swap, or link the wallet that holds them in Settings.</p>
            <Link className="button" href="/swap">
              Open Swap
            </Link>
          </div>
        ) : (
          <ul className="guardian-holdings">
            {data.holdings.map((holding) => {
              const guard = guardOf(holding.wallet, holding.tokenAddress);
              const key = guard ? guard.id : `new:${holding.wallet}:${holding.tokenAddress}`;
              return (
                <li key={`${holding.wallet}-${holding.tokenAddress}`} className="guardian-holding">
                  <div className="guardian-holding__row">
                    <span className="guardian-holding__token">
                      <TickerAvatar symbol={holding.symbol} size={28} />
                      <span>
                        <strong>{holding.symbol}</strong>
                        <span className="muted guardian-holding__meta">
                          {holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })} · {holding.valueUsd === null ? "no price" : usd(holding.valueUsd)}
                          {data.wallets.length > 1 && ` · ${shortAddress(holding.wallet)}`}
                        </span>
                      </span>
                    </span>
                    {guard ? (
                      <>
                        {guardSummary(guard)}
                        {guardActions(guard)}
                      </>
                    ) : (
                      <button
                        className="button"
                        type="button"
                        disabled={atLimit}
                        title={atLimit ? `You can set up to ${data.maxGuards} guards.` : undefined}
                        onClick={() => open(key, { stopLossPct: DEFAULT_STOP, takeProfitPct: "", basisPrice: "" })}
                      >
                        <i className="ph ph-shield-check" aria-hidden="true" /> Add guard
                      </button>
                    )}
                  </div>
                  {editing === key &&
                    form(
                      () =>
                        guard
                          ? void send(`/api/guardian/${guard.id}`, "PATCH", draft, guard.status === "triggered" ? "Guard re-armed" : "Guard updated")
                          : void send("/api/guardian", "POST", { wallet: holding.wallet, tokenAddress: holding.tokenAddress, ...draft }, "Guard set"),
                      holding,
                    )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {orphanGuards.length > 0 && (
        <section className="card" aria-labelledby="guardian-orphans-title" style={{ marginTop: "var(--space-300)" }}>
          <h2 className="card__title" id="guardian-orphans-title">
            Guards on tokens you no longer hold
          </h2>
          <ul className="guardian-holdings">
            {orphanGuards.map((guard) => (
              <li key={guard.id} className="guardian-holding">
                <div className="guardian-holding__row">
                  <span className="guardian-holding__token">
                    <TickerAvatar symbol={guard.symbol} size={28} />
                    <strong>{guard.symbol}</strong>
                  </span>
                  {guardSummary(guard)}
                  {guardActions(guard)}
                </div>
                {editing === guard.id && form(() => void send(`/api/guardian/${guard.id}`, "PATCH", draft, "Guard updated"), null)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted guardian-note">
        Watching {data.wallets.map(shortAddress).join(", ")}.{" "}
        <Link className="text-link" href="/settings">
          Link another wallet
        </Link>
        . Checked once an hour on the hourly close, so a fast drop can pass your stop before the alert. Alerts only: Zolva never trades your wallet. Not investment advice.
      </p>
    </>
  );
}

function AlertRow({ alert }: { alert: AlertView }) {
  const hour = Date.parse(alert.hour) / 1000;
  return (
    <li className={`guardian-alert${alert.read ? "" : " guardian-alert--new"}`}>
      <span className={`pill ${alert.kind === "stop_loss" ? "pill--warn" : "pill--running"}`}>{alert.kind === "stop_loss" ? "Stop loss" : "Take profit"}</span>
      <span className="guardian-alert__body">
        <strong>{alert.symbol}</strong> at {price(alert.price)} (from {price(alert.basisPrice)}). {alert.reasoning.replace(/ Selling everything\.$/, "")}
        <span className="muted guardian-alert__meta">
          {dateAt(hour)} · {alert.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })} held
          {!alert.read && <span className="pill pill--accent">New</span>}
        </span>
      </span>
      <Link className="button" href={`/swap?sell=${alert.tokenAddress}`}>
        Sell on Zolva Swap
      </Link>
    </li>
  );
}

/** Connect or disconnect Telegram alerts. Opens the bot with a one-time code; the page refreshes when you come back. */
function TelegramCard({ telegram }: { telegram: GuardianView["telegram"] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  // Back from Telegram: refresh so "Connected" shows.
  useEffect(() => {
    if (!waiting) return;
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [waiting, router]);

  if (!telegram.available) return null;

  const connect = async () => {
    setBusy(true);
    const response = await fetch("/api/guardian/telegram", { method: "POST" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { url?: string; error?: string } | null;
    setBusy(false);
    if (!response?.ok || !body?.url) return toast(body?.error ?? "Could not create a link. Please try again.");
    setWaiting(true);
    window.open(body.url, "_blank", "noopener,noreferrer");
  };

  const disconnect = async () => {
    setBusy(true);
    const response = await fetch("/api/guardian/telegram", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    toast(response?.ok ? "Telegram disconnected" : "Disconnecting failed. Please try again.");
    router.refresh();
  };

  return (
    <section className="card guardian-telegram" aria-label="Telegram alerts">
      <i className="ph ph-telegram-logo" aria-hidden="true" />
      <span className="guardian-telegram__text">
        <strong>{telegram.connected ? "Telegram alerts are on" : "Get alerts on Telegram"}</strong>
        <span className="muted">
          {telegram.connected
            ? "When a guard fires you get a message with a link to sell on Zolva Swap."
            : waiting
              ? "Press Start in Telegram, then come back here."
              : "A message the moment a guard fires, even when Zolva is closed."}
        </span>
      </span>
      {telegram.connected ? (
        <button className="button button--ghost" type="button" disabled={busy} onClick={() => void disconnect()}>
          Disconnect
        </button>
      ) : (
        <span className="guardian-telegram__actions">
          {waiting && (
            <button className="button button--ghost" type="button" onClick={() => router.refresh()}>
              I pressed Start
            </button>
          )}
          <button className="button button--primary" type="button" disabled={busy} onClick={() => void connect()}>
            Connect Telegram
          </button>
        </span>
      )}
    </section>
  );
}
