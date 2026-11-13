import Link from "next/link";

import { ApiKeysCard } from "@/components/app/ApiKeysCard";
import { LoginPrompt } from "@/components/app/LoginPrompt";
import { MembershipCard } from "@/components/app/MembershipCard";
import { UsdgTopUp } from "@/components/app/UsdgTopUp";
import { WalletExport } from "@/components/app/WalletExport";
import { ZolvaTopUp } from "@/components/app/ZolvaTopUp";
import type { ApiKeyEventRow, ApiKeyRow } from "@/lib/api-keys/server";
import { formatCredits } from "@/lib/ai/models";
import { EXPLORER_URL } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

type Props = {
  address: string;
  /** AI co-pilot credits, USD. */
  credits: { freeUsd: number; paidUsd: number };
  /** How this browser logged in (display only); "privy" means an email or Google account with a Privy wallet. */
  loginMethod: "privy" | "wallet" | null;
  /** Zolva has a live trading signer on this wallet. */
  liveSigner: boolean;
  /** The account's API keys (not revoked) and their latest audit events. */
  apiKeys: { keys: ApiKeyRow[]; events: ApiKeyEventRow[] };
};

/**
 * Settings: the account's wallet, membership, AI credits and API keys.
 * These cards used to sit in the Dashboard's side column; they moved here so
 * the Dashboard stays about agents. The ids are link targets (/settings#credits).
 */
export function Settings({ address, credits, loginMethod, liveSigner, apiKeys }: Props) {
  return (
    <div className="container page">
      <div className="page__head">
        <div>
          <span className="eyebrow">Settings</span>
          <h1 className="page__title" style={{ marginTop: "var(--space-75)" }}>
            Account and wallets
          </h1>
        </div>
      </div>

      <div className="settings">
        <section className="card stack stack--tight" id="account" aria-labelledby="account-title">
          <h2 className="card__title" id="account-title">
            Account
          </h2>
          <div className="account" style={{ padding: 0 }}>
            <span className="avatar" aria-hidden="true">
              {address.slice(2, 3).toUpperCase()}
            </span>
            <span className="account__text">
              <strong className="mono">{shortAddress(address)}</strong>
              <span>{loginMethod === "privy" ? "Email or Google login" : loginMethod === "wallet" ? "Wallet login" : "Signed in"}</span>
            </span>
          </div>
          <div className="wallet-box">
            <div className="growth__row" style={{ border: 0, padding: 0 }}>
              <span className="muted">{loginMethod === "privy" ? "Your Zolva wallet" : "Connected wallet"}</span>
              <span className="pill pill--accent">Robinhood Chain</span>
            </div>
            <a className="wallet-box__address mono" href={`${EXPLORER_URL}/address/${address}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              {shortAddress(address)}
              <i className="ph ph-arrow-square-out" />
            </a>
            <p className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
              {loginMethod === "privy"
                ? "Created for you when you logged in. It is yours: export its private key to use it in any wallet app."
                : "Paper trading needs no funds. Your wallet is only used to sign in."}
            </p>
            {loginMethod === "privy" && <WalletExport address={address} liveSigner={liveSigner} />}
            <Link className="button button--ghost" href="/swap">
              <i className="ph ph-arrows-left-right" aria-hidden="true" />
              Swap
            </Link>
          </div>
        </section>

        <div id="membership">
          <MembershipCard address={address} />
        </div>

        <section className="card stack stack--tight" id="credits" aria-labelledby="credits-title">
          <div className="card-head" style={{ margin: 0 }}>
            <h2 className="card__title" id="credits-title">
              AI credits
            </h2>
            <i className="ph ph-sparkle" style={{ color: "var(--color-purple-rich)", fontSize: 22 }} aria-hidden="true" />
          </div>
          <div className="growth__row" style={{ padding: 0, border: 0 }}>
            <span className="muted">Free (Lite models)</span>
            <strong>{formatCredits(credits.freeUsd)}</strong>
          </div>
          <div className="growth__row" style={{ padding: 0, border: 0 }}>
            <span className="muted">Paid (any model)</span>
            <strong>{formatCredits(credits.paidUsd)}</strong>
          </div>
          <p className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
            Spent only when an agent&apos;s AI co-pilot reviews a trade. If credits run out, agents keep trading on their rules.
          </p>
          <div className="topup-actions">
            <UsdgTopUp address={address} loginMethod={loginMethod} />
            <ZolvaTopUp address={address} loginMethod={loginMethod} />
          </div>
        </section>

        <div id="api-keys">
          <ApiKeysCard initialKeys={apiKeys.keys} initialEvents={apiKeys.events} />
        </div>

        <div>
          <LoginPrompt mode="logout" />
        </div>
      </div>
    </div>
  );
}
