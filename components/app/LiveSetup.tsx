"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/ui/Providers";
import { EXPLORER_URL } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

/** What /api/live/setup returns (lib/live/onboard.ts LiveStatus). */
export type LiveStatusView = {
  enabled: boolean;
  usdg: number;
  eth: number;
  maxCapitalUsd: number;
  dailyVolumeUsd: number;
  open: boolean;
  hasActiveLiveAgent: boolean;
};

/** Least ETH for gas, the same floor the launch route checks. */
export const MIN_GAS_ETH = 0.00002;

/** Ready to launch a real money agent with this status. */
export const liveReady = (status: LiveStatusView | null) => Boolean(status && status.open && status.enabled && status.usdg >= 10 && status.eth >= MIN_GAS_ETH && !status.hasActiveLiveAgent);

/**
 * The real money steps in the Studio, in order: log in with email or Google (a Privy
 * embedded wallet), allow Zolva's signer under a policy made for this wallet, then fund
 * it with USDG and a little ETH for gas. Reports the wallet status up so the Studio can
 * cap the capital and enable the launch.
 */
export function LiveSetup({ onStatus }: { onStatus: (status: LiveStatusView | null) => void }) {
  const { address, privy, openLogin } = useAuth();
  const [status, setStatus] = useState<LiveStatusView | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetch("/api/live/setup")
      .then((response) => (response.ok ? (response.json() as Promise<LiveStatusView>) : Promise.reject()))
      .then((body) => {
        if (cancelled) return;
        setStatus(body);
        onStatus(body);
      })
      .catch(() => {
        if (!cancelled) onStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, version, onStatus]);

  if (!address) {
    return (
      <div className="live-setup">
        <p>Real money trades from a wallet Zolva makes for you. Log in with email or Google to get one.</p>
        <button className="button button--primary" type="button" onClick={() => openLogin()}>
          Log in
        </button>
      </div>
    );
  }

  const allow = async () => {
    const handle = privy();
    if (!handle) {
      setError("Real money needs the wallet Zolva makes for you. Log out, then log in with email or Google.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const prepared = await fetch("/api/live/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "prepare" }) });
      const plan = (await prepared.json().catch(() => ({}))) as { signerId?: string; policyId?: string; error?: string };
      if (!prepared.ok || !plan.signerId || !plan.policyId) throw new Error(plan.error ?? "Setting up real money failed. Please try again.");
      await handle.addSigner(address, plan.signerId, [plan.policyId]);
      const confirmed = await fetch("/api/live/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "confirm", policyId: plan.policyId }) });
      const done = (await confirmed.json().catch(() => ({}))) as { error?: string };
      if (!confirmed.ok) throw new Error(done.error ?? "Setting up real money failed. Please try again.");
      setVersion((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Setting up real money failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <div className="live-setup muted">Checking your wallet…</div>;
  if (!status.open) return <div className="live-setup">Real money trading is paused right now. Paper trading stays open.</div>;

  const funded = status.usdg >= 10 && status.eth >= MIN_GAS_ETH;
  return (
    <div className="live-setup">
      <ol className="live-steps">
        <li className={`live-step${status.enabled ? " live-step--done" : ""}`}>
          <strong>Allow Zolva to trade for you</strong>
          <span className="muted">
            Zolva can only swap between USDG and listed markets on Uniswap, paid back into your own wallet. It can never send your money anywhere else. You can remove it any time.
          </span>
          {!status.enabled && (
            <button className="button button--primary" type="button" disabled={busy} onClick={() => void allow()}>
              {busy ? "Waiting for approval…" : "Allow Zolva"}
            </button>
          )}
        </li>
        <li className={`live-step${funded ? " live-step--done" : ""}`}>
          <strong>Fund your wallet</strong>
          <span className="muted">
            Send USDG and a little ETH for gas on Robinhood Chain to{" "}
            <a className="text-link mono" href={`${EXPLORER_URL}/address/${address}`} target="_blank" rel="noopener noreferrer">
              {shortAddress(address)}
            </a>
            .
          </span>
          <span className="live-balance mono">
            {status.usdg.toFixed(2)} USDG · {status.eth.toFixed(5)} ETH
            <button className="text-link" type="button" onClick={() => setVersion((value) => value + 1)}>
              Refresh
            </button>
          </span>
        </li>
        <li className="live-step">
          <strong>Set the capital</strong>
          <span className="muted">
            Up to ${status.maxCapitalUsd} per agent and ${status.dailyVolumeUsd} of trading a day. One real money agent at a time.
          </span>
        </li>
      </ol>
      {status.hasActiveLiveAgent && <p className="field-error">You already run a real money agent. Pause it in your dashboard to launch another.</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
