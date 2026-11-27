"use client";

import { useToast } from "@/components/ui/Providers";
import type { Fingerprint } from "@/lib/agents/fingerprint";
import { dayAt } from "@/lib/format";

/**
 * The hash recorded for this agent's trading settings (lib/agents/fingerprint.ts), with the day it was
 * recorded: agents made before fingerprints got theirs later than their start.
 */
export function RulesFingerprint({ fingerprint }: { fingerprint: Fingerprint }) {
  const toast = useToast();
  const { sha256, recordedAt, matches } = fingerprint;
  const copy = () => {
    navigator.clipboard?.writeText(sha256).then(
      () => toast("Fingerprint copied"),
      () => toast("Copy failed"),
    );
  };

  return (
    <section className="rules-summary" aria-labelledby="rules-fingerprint-title">
      <h3 className="rules-summary__title" id="rules-fingerprint-title">
        Rules fingerprint
      </h3>
      <div className="rules-fingerprint__row">
        <code className="rules-fingerprint__hash" title={sha256}>
          {sha256.slice(0, 10)}…{sha256.slice(-8)}
        </code>
        <button className="button button--ghost button--small" type="button" onClick={copy}>
          Copy
        </button>
      </div>
      {!matches && (
        <p className="strategy-prompt__note rules-fingerprint__warning" role="status">
          <i className="ph ph-warning" aria-hidden="true" /> The current settings no longer match this fingerprint.
        </p>
      )}
      <p className="strategy-prompt__note">
        SHA-256 of the trading settings and markets, recorded by Zolva on {dayAt(Date.parse(recordedAt) / 1000)}. Not on chain yet.
      </p>
    </section>
  );
}
