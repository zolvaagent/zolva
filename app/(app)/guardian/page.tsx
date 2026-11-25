import type { Metadata } from "next";

import { GuardianPanel } from "@/components/app/GuardianPanel";
import { LoginPrompt } from "@/components/app/LoginPrompt";
import { getSessionAddress } from "@/lib/auth/session";
import { loadGuardian } from "@/lib/guardian/data";
import { db } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Wallet Guardian",
  description: "Stop loss and take profit alerts on the Stock Tokens in your own wallet. Read only: Zolva never trades for you.",
};
export const dynamic = "force-dynamic";

export default async function GuardianPage() {
  const owner = await getSessionAddress();
  const head = (
    <div className="page__head">
      <div>
        <h1 className="page__title">Wallet Guardian</h1>
        <p className="page__lead">Set a stop loss or take profit on the Stock Tokens in your own wallet. Zolva checks them every hour and tells you when one is hit. It only reads your wallet: you decide and sell yourself.</p>
      </div>
    </div>
  );
  if (!owner) {
    return (
      <div className="container page">
        {head}
        <div className="card">
          <div className="empty" style={{ padding: "var(--space-600) var(--space-300)" }}>
            <h2 className="card__title">Log in to guard your wallet</h2>
            <p>Your login wallet is watched automatically; you can link more wallets in Settings.</p>
            <LoginPrompt />
          </div>
        </div>
      </div>
    );
  }
  const data = await loadGuardian(db(), owner);
  return (
    <div className="container page">
      {head}
      <GuardianPanel data={data} />
    </div>
  );
}
