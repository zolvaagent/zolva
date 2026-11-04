"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parseUnits } from "viem";

import { useAuth, useToast } from "@/components/ui/Providers";
import { EXPLORER_URL } from "@/lib/chain";
import { usd } from "@/lib/format";
import { burnCall, hasInjectedWallet, sendBurnFromBrowserWallet, WalletError } from "@/lib/wallet-client";

/** /api/credits/zolva GET (lib/zolva-topup-server.ts TopUpInfo). */
type Info = { configured: boolean; token: string | null; decimals: number; burnAddress: string; price: number | null; minUsd: number; bonus: number };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * "Pay with ZOLVA" on the AI credits card: the wallet sends ZOLVA to the burn address,
 * then the server checks the transaction and adds paid credits (+10%). Before the token
 * launches it stays a disabled "Top up · Soon" button.
 */
export function ZolvaTopUp({ address, loginMethod }: { address: string; loginMethod: "privy" | "wallet" | null }) {
  const { privy } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/credits/zolva")
      .then((response) => (response.ok ? (response.json() as Promise<Info>) : null))
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  if (!info?.configured || !info.token) {
    return (
      <button className="button button--ghost" type="button" disabled>
        Top up <span className="pill pill--accent">Soon</span>
      </button>
    );
  }

  const value = Number(amount);
  const worth = info.price !== null && value > 0 ? value * info.price : 0;
  const credits = worth * (1 + info.bonus);
  // Email and Google accounts pay from their Privy wallet; wallet logins from the browser wallet.
  const usePrivy = loginMethod === "privy";
  const canSend = info.price !== null && worth >= info.minUsd && (usePrivy || hasInjectedWallet());

  // Asks the server to credit the burn, waiting for the transaction to confirm.
  const claim = async (hash: string) => {
    setBusy("Checking the burn on chain…");
    for (let attempt = 0; attempt < 8; attempt++) {
      const response = await fetch("/api/credits/zolva", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txHash: hash }) });
      const body = (await response.json().catch(() => ({}))) as { creditsMicro?: number; error?: string };
      if (response.ok && body.creditsMicro !== undefined) {
        toast(`Added ${usd(body.creditsMicro / 1_000_000)} of AI credits.`);
        dialog.current?.close();
        setAmount("");
        setTxHash(null);
        router.refresh();
        return;
      }
      if (!body.error?.includes("not confirmed yet")) throw new WalletError(body.error ?? "Crediting the burn failed. Please try again.");
      await pause(4000);
    }
    throw new WalletError("The burn is taking long to confirm. Press Check again in a minute; it stays claimable for 24 hours.");
  };

  const send = async () => {
    setError(null);
    try {
      const raw = parseUnits(amount, info.decimals);
      let hash: string;
      if (usePrivy) {
        const handle = privy();
        if (!handle) throw new WalletError("The secure wallet window is still loading. Try again in a moment.");
        // Our dialog sits in the top layer; close it so Privy's window is visible, then reopen.
        dialog.current?.close();
        try {
          hash = await handle.sendTransaction(address, info.token!, burnCall(info.burnAddress, raw));
        } finally {
          dialog.current?.showModal();
        }
      } else {
        setBusy("Confirm in your wallet…");
        hash = await sendBurnFromBrowserWallet(info.token!, info.burnAddress, raw);
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
      <button className="button button--ghost" type="button" onClick={() => dialog.current?.showModal()}>
        <i className="ph ph-fire" aria-hidden="true" />
        Pay with ZOLVA
      </button>

      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="zolva-topup-title"
        onClick={(event) => {
          if (event.target === dialog.current && !busy) dialog.current?.close();
        }}
      >
        <div className="modal__body">
          <span className="choice__glyph" aria-hidden="true">
            <i className="ph ph-fire" />
          </span>
          <h2 className="modal__title" id="zolva-topup-title">
            Pay for AI credits with ZOLVA
          </h2>
          <ul className="modal__list">
            <li>
              Your ZOLVA goes straight to the burn address, so it is gone for good. Zolva never holds it. You get {Math.round(info.bonus * 100)}% more credit
              than the same value in USDG.
            </li>
            <li>The burn is valued at today&apos;s ZOLVA price or the 7 day average, whichever is lower. The smallest top-up is {usd(info.minUsd)}.</li>
            <li>The transaction needs a little ETH on Robinhood Chain for gas.</li>
          </ul>
          <label className="ai-limit__field">
            <span className="ai-limit__label">ZOLVA to burn</span>
            <input className="input" inputMode="decimal" placeholder="0" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} disabled={Boolean(busy)} />
          </label>
          <div className="growth__row" style={{ padding: 0, border: 0 }}>
            <span className="muted">You get about</span>
            <strong>{info.price === null ? "No price yet" : usd(credits)}</strong>
          </div>
          {info.price !== null && worth > 0 && worth < info.minUsd && <p className="field-error">The smallest top-up is {usd(info.minUsd)} worth of ZOLVA.</p>}
          {!usePrivy && !hasInjectedWallet() && <p className="field-error">Open Zolva in a browser with your wallet (MetaMask, Rabby or Coinbase Wallet) to pay.</p>}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {txHash && (
            <a className="text-link" href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14 }}>
              View the burn on Blockscout
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
                {busy ?? "Burn and add credits"}
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
