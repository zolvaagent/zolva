import type { Metadata } from "next";
import { cookies } from "next/headers";

import { SwapWorkspace } from "@/components/app/SwapWorkspace";
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
      <SwapWorkspace address={address} loginMethod={loginMethod} />
    </div>
  );
}
