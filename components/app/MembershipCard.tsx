"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { shortAddress, usd } from "@/lib/format";
import { TIERS, type Tier } from "@/lib/tiers";
import { hasInjectedWallet, linkExtraWallet, WalletError } from "@/lib/wallet-client";

/** What /api/membership returns (lib/membership.ts MembershipState). */
type Membership = {
  configured: boolean;
  tier: Tier;
  holdingsUsd: number;
  averagePrice: number | null;
  wallets: { address: string; primary: boolean }[];
  checkedAt: number | null;
  graceUntil: number | null;
};

const NEXT_TIER: Partial<Record<Tier, Tier>> = { free: "holder", holder: "pro" };

/**
 * ZOLVA membership on the Settings page: the account's tier, what it unlocks, the
 * wallets whose ZOLVA counts, and Refresh. Before the token launches it only
 * explains the tiers.
 */
export function MembershipCard({ address }: { address: string }) {
  const [state, setState] = useState<Membership | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/membership")
      .then((response) => (response.ok ? (response.json() as Promise<Membership>) : null))
      .then((body) => {
        if (!cancelled) setState(body);
      })
      .catch(() => !cancelled && setError("Loading your membership failed."));
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (action: () => Promise<Membership>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await action());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  };
  const call = (method: "POST" | "DELETE", url: string, body?: object) => async () => {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = (await response.json().catch(() => ({}))) as Membership & { error?: string };
    if (!response.ok) throw new WalletError(json.error ?? "That did not work. Please try again.");
    return json;
  };

  const tier = state?.tier ?? "free";
  const limits = TIERS[tier];
  const next = NEXT_TIER[tier];

  return (
    <div className="card stack stack--tight">
      <div className="card-head" style={{ margin: 0 }}>
        <h2 className="card__title">ZOLVA membership</h2>
        <span className={`pill${tier === "free" ? "" : " pill--accent"}`}>{limits.label}</span>
      </div>

      {!state ? (
        <div className="skeleton" style={{ height: 96, borderRadius: 12 }} aria-label="Loading membership" />
      ) : !state.configured ? (
        <>
          <p className="muted" style={{ fontSize: 14, lineHeight: "20px" }}>
            Hold ZOLVA to get free hourly AI reviews and higher limits. Nothing to stake or lock. Starts when the ZOLVA token launches.
          </p>
          <TierRows />
          <Link className="text-link" href="/docs/token" style={{ fontSize: 14 }}>
            How tiers work
          </Link>
        </>
      ) : (
        <>
          <div className="growth__row" style={{ padding: 0, border: 0 }}>
            <span className="muted">Your ZOLVA (7 day average price)</span>
            <strong>{usd(state.holdingsUsd)}</strong>
          </div>
          <div className="growth__row" style={{ padding: 0, border: 0 }}>
            <span className="muted">Free AI agents · active agents · writer tries a day</span>
            <strong>
              {limits.freeAiAgents} · {limits.activeAgents} · {limits.writerPerDay}
            </strong>
          </div>
          {next && (
            <p className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
              {TIERS[next].label} at {usd(TIERS[next].minUsd)}: {TIERS[next].freeAiAgents} free AI agent{TIERS[next].freeAiAgents === 1 ? "" : "s"}, {TIERS[next].activeAgents} active agents.
            </p>
          )}
          {state.graceUntil && (
            <p className="field-error" role="status">
              Your ZOLVA is below this tier. It stays until {new Date(state.graceUntil * 1000).toUTCString().slice(5, 22)} UTC.
            </p>
          )}
          {state.averagePrice === null && (
            <p className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
              No ZOLVA price yet, so holdings count as $0 for now. Prices are recorded every hour.
            </p>
          )}

          <ul className="stack stack--tight" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {state.wallets.map((wallet) => (
              <li key={wallet.address} className="growth__row" style={{ padding: 0, border: 0 }}>
                <span className="mono">{shortAddress(wallet.address)}</span>
                {wallet.primary ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Login wallet
                  </span>
                ) : (
                  <button
                    className="text-link"
                    type="button"
                    disabled={busy}
                    onClick={() => run(call("DELETE", "/api/membership/wallets", { wallet: wallet.address }))}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: "var(--space-75)", flexWrap: "wrap" }}>
            <button className="button button--ghost button--small" type="button" disabled={busy} onClick={() => run(call("POST", "/api/membership"))}>
              <i className="ph ph-arrows-clockwise" aria-hidden="true" />
              Refresh
            </button>
            {hasInjectedWallet() && (
              <button className="button button--ghost button--small" type="button" disabled={busy} onClick={() => run(() => linkExtraWallet<Membership>(address))}>
                <i className="ph ph-plus" aria-hidden="true" />
                Add a wallet
              </button>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
            Adding a wallet asks it to sign a message: free, no transaction. ZOLVA is a utility token with no claim on Zolva&apos;s revenue.
          </p>
        </>
      )}
    </div>
  );
}

function TierRows() {
  return (
    <>
      {(["holder", "pro"] as const).map((key) => (
        <div key={key} className="growth__row" style={{ padding: 0, border: 0 }}>
          <span className="muted">
            {TIERS[key].label} · {usd(TIERS[key].minUsd)}+
          </span>
          <strong style={{ fontSize: 13 }}>
            {TIERS[key].freeAiAgents} free AI agent{TIERS[key].freeAiAgents === 1 ? "" : "s"}, {TIERS[key].activeAgents} agents
          </strong>
        </div>
      ))}
    </>
  );
}
