"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useAuth, useToast } from "@/components/ui/Providers";

/**
 * Export the private key of an email or Google account's Privy wallet. A
 * warning dialog comes first; Privy then shows the key in its own window on
 * its own domain, so Zolva never sees it. When Zolva still has a live signer
 * on the wallet, the dialog offers to remove it (which also pauses the live agents).
 */
export function WalletExport({ address, liveSigner }: { address: string; liveSigner: boolean }) {
  const { privy, openLogin } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setUnderstood(false);
    setError(null);
    dialog.current?.showModal();
  };

  const handle = () => {
    const current = privy();
    if (!current) setError("The secure wallet window is still loading. Try again in a moment.");
    return current;
  };

  const showKey = async () => {
    const current = handle();
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await current.exportWallet(address);
      dialog.current?.close();
    } catch {
      // Privy needs its own login too; after a while only Zolva's session is left.
      setError("Please log in again with your email or Google account, then try the export once more.");
    } finally {
      setBusy(false);
    }
  };

  const removeSigner = async () => {
    const current = handle();
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await current.removeSigners(address);
      const response = await fetch("/api/live/revoke", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { paused?: number; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Removing live trading failed.");
      toast(body.paused ? `Zolva's signer removed. ${body.paused} live agent${body.paused === 1 ? "" : "s"} paused.` : "Zolva's signer removed.");
      dialog.current?.close();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Removing the signer failed. Please log in again and retry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="button button--ghost button--small" type="button" onClick={open}>
        <i className="ph ph-key" aria-hidden="true" />
        Export private key
      </button>

      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="export-title"
        onClick={(event) => {
          if (event.target === dialog.current && !busy) dialog.current?.close();
        }}
      >
        <div className="modal__body">
          <span className="choice__glyph" aria-hidden="true">
            <i className="ph ph-key" />
          </span>
          <h2 className="modal__title" id="export-title">
            Export your private key?
          </h2>
          <ul className="modal__list">
            <li>Your private key gives full control of this wallet. With it you can use the same wallet in MetaMask, Rabby or any other wallet app.</li>
            <li>
              <strong className="loss">Anyone who sees it can take everything in the wallet.</strong> Never share it, paste it into a website or send it in a chat. Zolva will never ask for it.
            </li>
            <li>The key appears in Privy&apos;s own secure window. Zolva never sees or stores it.</li>
            {liveSigner && (
              <li>
                Zolva can still trade for your live agents after you export, within the limits you approved.{" "}
                <button className="text-link" type="button" onClick={removeSigner} disabled={busy}>
                  Remove Zolva&apos;s signer
                </button>{" "}
                to stop that; it also pauses your live agents.
              </li>
            )}
          </ul>
          <label style={{ display: "flex", gap: "var(--space-75)", alignItems: "flex-start", fontSize: 14, lineHeight: "20px" }}>
            <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} style={{ marginTop: 3 }} />I understand that anyone with my private key controls my wallet.
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}{" "}
              {error.startsWith("Please log in") && (
                <button className="text-link" type="button" onClick={() => openLogin(() => router.refresh())}>
                  Log in
                </button>
              )}
            </p>
          )}
          <div className="modal__actions">
            {/* Cancel takes the first focus: the safe default for a dialog about a private key. */}
            <button className="button button--ghost" type="button" onClick={() => dialog.current?.close()} disabled={busy} autoFocus>
              Cancel
            </button>
            <button className="button button--primary" type="button" onClick={showKey} disabled={!understood || busy}>
              {busy ? "Opening…" : "Show private key"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
