"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/ui/Providers";
import { PALISEC_DETECT_URL } from "@/lib/agents/palisec";
import type { PalisecLinkStatus } from "@/lib/data/palisec";

const PAPER_NOTE = "Trades shown here are paper trades on Zolva.";

// Palisec's wording for a confirmed link (docs/outreach-palisec.md). Nothing here may suggest
// the agent's trades run through Palisec.
const STATUS_LINE: Record<PalisecLinkStatus, string> = {
  linked: `Linked to a Palisec smart account: each side names the other. ${PAPER_NOTE}`,
  pending: `Pending: this account has not named this agent on chain yet. ${PAPER_NOTE}`,
  unknown: `The link could not be checked on chain just now. ${PAPER_NOTE}`,
};

type Props = {
  agentId: string;
  /** Checksummed address the owner named, or null. */
  account: string | null;
  /** On-chain check of the other side; null when no account is set. */
  status: PalisecLinkStatus | null;
  isOwner: boolean;
};

/** Agent page, Settings card: the Palisec smart account this paper agent belongs to (owner can set it). */
export function PalisecAccount({ agentId, account, status, isOwner }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!account && !isOwner) return null;

  const save = async (value: string | null) => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ palisecAccount: value }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) return setError(body.error ?? "Saving failed. Please try again.");
    setEditing(false);
    toast(value?.trim() ? "Palisec account saved" : "Palisec account removed");
    router.refresh();
  };

  return (
    <section className="rules-summary palisec-account" aria-labelledby="palisec-account-title">
      <h3 className="rules-summary__title" id="palisec-account-title">
        Palisec account
      </h3>

      {editing ? (
        <form
          className="palisec-account__form"
          onSubmit={(event) => {
            event.preventDefault();
            void save(draft);
          }}
        >
          <label className="sr-only" htmlFor="palisec-account-input">
            Palisec smart account address on Robinhood Chain
          </label>
          <input
            id="palisec-account-input"
            className="input"
            placeholder="0x… on Robinhood Chain"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="palisec-account__actions">
            <button className="button button--primary" type="submit" disabled={busy}>
              Save
            </button>
            <button className="button button--ghost" type="button" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          {error && (
            <p className="palisec-account__error" role="alert">
              {error}
            </p>
          )}
          <p className="strategy-prompt__note">Public on this page and in the API. The page shows it as linked once that account names this agent on Palisec too.</p>
        </form>
      ) : account ? (
        <>
          <a className="text-link palisec-account__address" href={PALISEC_DETECT_URL} target="_blank" rel="noopener noreferrer">
            {account}
          </a>
          {status && (
            <p className={`strategy-prompt__note palisec-account__status palisec-account__status--${status}`}>
              {status === "linked" && <i className="ph ph-link" aria-hidden="true" />} {STATUS_LINE[status]}
            </p>
          )}
          {isOwner && (
            <div className="palisec-account__actions">
              <button className="button button--ghost" type="button" disabled={busy} onClick={() => (setDraft(account), setEditing(true))}>
                Change
              </button>
              <button className="button button--ghost" type="button" disabled={busy} onClick={() => void save(null)}>
                Remove
              </button>
            </div>
          )}
          {error && (
            <p className="palisec-account__error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="strategy-prompt__note" style={{ marginTop: 0 }}>
            Not set. If this agent belongs to a Palisec smart account, name it here.
          </p>
          <div className="palisec-account__actions">
            <button className="button button--ghost" type="button" onClick={() => setEditing(true)}>
              Add Palisec account
            </button>
          </div>
        </>
      )}
    </section>
  );
}
