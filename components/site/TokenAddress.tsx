"use client";

import { useState } from "react";

import { EXPLORER_URL } from "@/lib/chain";

/** The launched token as the docs pages show it (read from env on the server, lib/env.ts). */
export type TokenCard = { address: string; pool: string | null; tradeUrl: string | null };

/**
 * The official ZOLVA contract address with a copy button and links to check it: Blockscout,
 * its pool on GeckoTerminal and the page where it trades. Used on /docs/token, /docs/verify
 * and /docs/contracts so the address only ever comes from one setting.
 */
export function TokenAddress({ token }: { token: TokenCard }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(token.address).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false),
    );

  return (
    <div className="token-card">
      <span className="token-card__label">Official ZOLVA contract on Robinhood Chain</span>
      <div className="token-card__row">
        <code className="token-card__address">{token.address}</code>
        <button className="button button--ghost button--small" type="button" onClick={copy} aria-live="polite">
          <i className={`ph ${copied ? "ph-check" : "ph-copy"}`} aria-hidden="true" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="token-card__links">
        <a className="text-link" href={`${EXPLORER_URL}/token/${token.address}`} target="_blank" rel="noopener noreferrer">
          Blockscout <i className="ph ph-arrow-up-right" aria-hidden="true" />
        </a>
        {token.pool && (
          <a className="text-link" href={`https://www.geckoterminal.com/robinhood/pools/${token.pool}`} target="_blank" rel="noopener noreferrer">
            GeckoTerminal <i className="ph ph-arrow-up-right" aria-hidden="true" />
          </a>
        )}
        {token.pool && (
          <a className="text-link" href={`https://dexscreener.com/robinhood/${token.pool}`} target="_blank" rel="noopener noreferrer">
            DexScreener <i className="ph ph-arrow-up-right" aria-hidden="true" />
          </a>
        )}
        {token.tradeUrl && (
          <a className="text-link" href={token.tradeUrl} target="_blank" rel="noopener noreferrer">
            Trade on Pons <i className="ph ph-arrow-up-right" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}

/** A compact copyable CA for the landing hero: "$ZOLVA CA 0x8e04…681f" with a copy icon. */
export function TokenPill({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(address).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false),
    );
  return (
    <button className="token-pill" type="button" onClick={copy} aria-label={`Copy the ZOLVA contract address ${address}`}>
      <span className="token-pill__label">$ZOLVA CA</span>
      <code>{`${address.slice(0, 6)}…${address.slice(-4)}`}</code>
      <i className={`ph ${copied ? "ph-check" : "ph-copy"}`} aria-hidden="true" />
    </button>
  );
}
