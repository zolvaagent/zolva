import type { Metadata } from "next";
import { cookies } from "next/headers";

import { LoginPrompt } from "@/components/app/LoginPrompt";
import { Settings } from "@/components/app/Settings";
import { listApiKeyEvents, listApiKeys } from "@/lib/api-keys/server";
import { getSessionAddress, LOGIN_METHOD_COOKIE } from "@/lib/auth/session";
import { getCredits } from "@/lib/data/credits";
import { db } from "@/lib/supabase";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const address = await getSessionAddress();
  if (!address) {
    return (
      <div className="container page">
        <div className="card">
          <div className="empty" style={{ padding: "var(--space-800) var(--space-300)" }}>
            <img src="/img/brand/zolva-mark.png" alt="" width={88} height={88} />
            <h1 className="page__title">Log in to Zolva</h1>
            <p>Use your wallet to sign in. Settings hold your wallet, membership, AI credits and API keys.</p>
            <LoginPrompt />
          </div>
        </div>
      </div>
    );
  }

  const client = db();
  const [credits, liveWallet, cookieStore, apiKeys] = await Promise.all([
    getCredits(client, address),
    client.from("live_wallets").select("address").eq("address", address).maybeSingle(),
    cookies(),
    // Until the api_keys migration is applied the card shows no keys instead of breaking the page.
    Promise.all([listApiKeys(client, address), listApiKeyEvents(client, address)])
      .then(([keys, events]) => ({ keys, events }))
      .catch((cause) => {
        console.error("settings api keys", cause);
        return { keys: [], events: [] };
      }),
  ]);
  // Display only: decides whether to offer the private key export (Privy embedded wallets).
  const loginValue = cookieStore.get(LOGIN_METHOD_COOKIE)?.value;
  const loginMethod = loginValue === "privy" ? "privy" : loginValue === "wallet" ? "wallet" : null;

  return <Settings address={address} credits={credits} loginMethod={loginMethod} liveSigner={Boolean(liveWallet.data)} apiKeys={apiKeys} />;
}
