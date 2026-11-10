"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parseUnits } from "viem";

import { useAuth, useToast } from "@/components/ui/Providers";
import { EXPLORER_URL } from "@/lib/chain";
import { usd } from "@/lib/format";
import { hasInjectedWallet, sendFromBrowserWallet, transferCall, WalletError } from "@/lib/wallet-client";

/** /api/credits/usdg GET (lib/usdg-topup-server.ts UsdgTopUpInfo). */
type Info = { configured: boolean; usdg: string; payTo: string | null; minUsd: number; maxUsd: number };

const USDG_DECIMALS = 6;
const PRESETS = [5, 10, 25];

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * "Top up with USDG" on the AI credits card: the wallet sends USDG to Zolva's receiving
 * address, then the server checks the transaction and adds the same amount of paid credits.
 * Hidden until the receiving address is configured.
 */
export function UsdgTopUp({ address, loginMethod }: { address: string; loginMethod: "privy" | "wallet" | null }) {
  const { privy } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/credits/usdg")
      .then((response) => (response.ok ? (response.json() as Promise<Info>) : null))
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  if (!info?.configured || !info.payTo) return null;

  const value = Number(amount);
  const inRange = value >= info.minUsd && value <= info.maxUsd;
  // Email and Google accounts pay from their Privy wallet; wallet logins from the browser wallet.
  const usePrivy = loginMethod === "privy";
  const canSend = inRange && (usePrivy || hasInjectedWallet());

  // Asks the server to credit the payment, waiting for the transaction to confirm.
  const claim = async (hash: string) => {
    setBusy("Checking the payment on chain…");
    for (let attempt = 0; attempt < 8; attempt++) {
      const response = await fetch("/api/credits/usdg", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txHash: hash }) });
      const body = (await response.json().catch(() => ({}))) as { creditsMicro?: number; error?: string };
      if (response.ok && body.creditsMicro !== undefined) {
        toast(`Added ${usd(body.creditsMicro / 1_000_000)} of AI credits.`);
        dialog.current?.close();
        setTxHash(null);
        router.refresh();
        return;
      }
      if (!body.error?.includes("not confirmed yet")) throw new WalletError(body.error ?? "Crediting the payment failed. Please try again.");
      await pause(4000);
    }
    throw new WalletError("The payment is taking long to confirm. Press Check again in a minute; it stays claimable for 24 hours.");
  };

  const send = async () => {
    setError(null);
    try {
      const raw = parseUnits(amount, USDG_DECIMALS);
      const data = transferCall(info.payTo!, raw);
      let hash: string;
      if (usePrivy) {
        const handle = privy();
        if (!handle) throw new WalletError("The secure wallet window is still loading. Try again in a moment.");
        // Our dialog sits in the top layer; close it so Privy's window is visible, then reopen.
        dialog.current?.close();
        try {
          hash = await handle.sendTransaction(address, info.usdg, data);
        } finally {
          dialog.current?.showModal();
        }
      } else {
        setBusy("Confirm in your wallet…");
        hash = await sendFromBrowserWallet(info.usdg, data, "Sending the USDG failed. Check you have USDG and a little ETH for gas, then try again.");
      }
      setTxHash(hash);
      await claim(hash);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      // An empty message means the user closed the wallet prompt.
      if (message && !message.includes("rejected")) setError(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button className="button button--primary" type="button" onClick={() => dialog.current?.showModal()}>
        <i className="ph ph-plus" aria-hidden="true" />
        Top up with USDG
      </button>

      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="usdg-topup-title"
        onClick={(event) => {
          if (event.target === dialog.current && !busy) dialog.current?.close();
        }}
      >
        <div className="modal__body">
          <span className="choice__glyph" aria-hidden="true">
            <i className="ph ph-coins" />
          </span>
          <h2 className="modal__title" id="usdg-topup-title">
            Top up AI credits with USDG
          </h2>
          <ul className="modal__list">
            <li>1 USDG adds $1 of paid credits, usable with any AI model. Credits are only spent when your agent&apos;s co-pilot reviews a trade.</li>
            <li>
              Your wallet sends USDG to Zolva on Robinhood Chain, from {usd(info.minUsd)} to {usd(info.maxUsd)} at a time. Credits are not refundable or withdrawable.
            </li>
            <li>The transaction needs a little ETH on Robinhood Chain for gas.</li>
          </ul>
          <div className="filter-row" style={{ margin: 0 }}>
            <div className="tabs" role="group" aria-label="Amount">
              {PRESETS.map((preset) => (
                <button key={preset} className="tab" type="button" aria-pressed={Number(amount) === preset} onClick={() => setAmount(String(preset))} disabled={Boolean(busy)}>
                  ${preset}
                </button>
              ))}
            </div>
          </div>
          <label className="ai-limit__field">
            <span className="ai-limit__label">USDG to pay</span>
            <input className="input" inputMode="decimal" placeholder="10" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} disabled={Boolean(busy)} />
          </label>
          <div className="growth__row" style={{ padding: 0, border: 0 }}>
            <span className="muted">You get</span>
            <strong>{value > 0 ? usd(value) : "–"} of credits</strong>
          </div>
          {value > 0 && !inRange && (
            <p className="field-error">
              Pay between {usd(info.minUsd)} and {usd(info.maxUsd)}.
            </p>
          )}
          {!usePrivy && !hasInjectedWallet() && <p className="field-error">Open Zolva in a browser with your wallet (MetaMask, Rabby or Coinbase Wallet) to pay.</p>}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {txHash && (
            <a className="text-link" href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14 }}>
              View the payment on Blockscout
            </a>
          )}
          <div className="modal__actions">
            <button className="button button--ghost" type="button" onClick={() => dialog.current?.close()} disabled={Boolean(busy)}>
              Cancel
            </button>
            {txHash && !busy ? (
              <button className="button button--primary" type="button" onClick={() => claim(txHash).catch((cause: Error) => setError(cause.message)).finally(() => setBusy(null))}>
                Check again
              </button>
            ) : (
              <button className="button button--primary" type="button" onClick={send} disabled={!canSend || Boolean(busy)}>
                {busy ?? `Pay ${value > 0 ? usd(value) : ""} USDG`}
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
