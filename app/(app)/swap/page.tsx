import type { Metadata } from "next";
import { cookies } from "next/headers";

import { LoginPrompt } from "@/components/app/LoginPrompt";
import { SwapDialog } from "@/components/app/SwapDialog";
import { getSessionAddress, LOGIN_METHOD_COOKIE } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Swap" };
export const dynamic = "force-dynamic";

/** Swap between USDG and Zolva's markets from your own wallet. */
export default async function SwapPage() {
  const [address, cookieStore] = await Promise.all([getSessionAddress(), cookies()]);
  // Display only: how to sign (Privy window or browser wallet).
  const method = cookieStore.get(LOGIN_METHOD_COOKIE)?.value;
  const loginMethod = method === "privy" || method === "wallet" ? method : null;
  return (
    <div className="container page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Swap</h1>
          <p className="page__lead">Buy or sell Zolva&apos;s markets for USDG from your own wallet, on Uniswap on Robinhood Chain. You sign every swap; Zolva never holds your tokens.</p>
        </div>
      </div>
      {address ? (
        <div className="swap-page">
          <SwapDialog address={address} loginMethod={loginMethod} inline />
          <p className="muted swap-page__note">
            Only Zolva&apos;s allowlisted tokens, never a lookalike. Holdings of a live agent are better sold with Sell on the agent&apos;s page, so the agent&apos;s records stay in step with the wallet.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="empty">
            <img src="/img/brand/zolva-mark.png" alt="" width={72} height={72} />
            <h2 className="card__title">Log in to swap</h2>
            <p>Swaps come from your own wallet, so log in with it first.</p>
            <LoginPrompt />
          </div>
        </div>
      )}
    </div>
  );
}
