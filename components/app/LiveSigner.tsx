"use client";

import { useState } from "react";

import { useAuth } from "@/components/ui/Providers";

/** Grant or remove Zolva's signer on the logged-in Privy wallet (owner-only spike page). */
export function LiveSigner({ address, signer }: { address: string | null; signer: { signerId: string; policyId: string } | null }) {
  const { privy, openLogin } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!address) {
    return (
      <div className="card" style={{ marginTop: "var(--space-400)" }}>
        <p>Log in with your email or Google account first, so your Privy embedded wallet is active.</p>
        <button className="button button--primary" type="button" style={{ marginTop: "var(--space-200)" }} onClick={() => openLogin()}>
          Log in
        </button>
      </div>
    );
  }
  if (!signer) {
    return (
      <div className="card" style={{ marginTop: "var(--space-400)" }}>
        <p>
          No signer yet. Run <code>npm run live:setup -- {address}</code>, then restart the dev server.
        </p>
      </div>
    );
  }

  const run = async (label: string, action: () => Promise<void>) => {
    const handle = privy();
    if (!handle) return setStatus("Privy is still loading, or you logged in with an external wallet (signers need a Privy embedded wallet).");
    setBusy(true);
    setStatus(`${label}…`);
    try {
      await action();
      setStatus(`${label}: done.`);
    } catch (cause) {
      setStatus(`${label} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: "var(--space-400)", display: "flex", flexDirection: "column", gap: "var(--space-200)" }}>
      <p>
        Wallet <code>{address}</code>
        <br />
        Signer <code>{signer.signerId}</code>, policy <code>{signer.policyId}</code>
      </p>
      <p className="muted">The policy only allows approvals of the swap router and Uniswap swaps between USDG and the 14 v3 markets, paid back into this wallet, on Robinhood Chain.</p>
      <div style={{ display: "flex", gap: "var(--space-100)", flexWrap: "wrap" }}>
        <button className="button button--primary" type="button" disabled={busy} onClick={() => run("Grant signer", () => privy()!.addSigner(address, signer.signerId, [signer.policyId]))}>
          Grant Zolva signer
        </button>
        <button className="button button--ghost" type="button" disabled={busy} onClick={() => run("Remove signers", () => privy()!.removeSigners(address))}>
          Remove all signers
        </button>
      </div>
      {status && <p role="status">{status}</p>}
    </div>
  );
}
