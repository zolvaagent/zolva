import type { Metadata } from "next";
import { cookies } from "next/headers";

import { SwapDialog } from "@/components/app/SwapDialog";
import { getSessionAddress, LOGIN_METHOD_COOKIE } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Swap" };
export const dynamic = "force-dynamic";

/** Swap any two of Zolva's tokens from your own wallet. Quotes work logged out; swapping needs a login. */
export default async function SwapPage() {
  const [address, cookieStore] = await Promise.all([getSessionAddress(), cookies()]);
  // Display only: how to sign (Privy window or browser wallet).
  const method = cookieStore.get(LOGIN_METHOD_COOKIE)?.value;
  const loginMethod = method === "privy" || method === "wallet" ? method : null;
  return (
    <div className="container page swap-page">
      <SwapDialog address={address} loginMethod={loginMethod} inline />
      <p className="muted swap-page__note">
        Swaps run on Uniswap on Robinhood Chain, from your own wallet: you sign every one, Zolva never holds your tokens. Only Zolva&apos;s allowlisted tokens, never a lookalike. To sell a
        live agent&apos;s holding, use Sell on the agent&apos;s page so its records stay in step.
      </p>
    </div>
  );
}
