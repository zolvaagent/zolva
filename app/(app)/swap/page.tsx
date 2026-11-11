import type { Metadata } from "next";
import { cookies } from "next/headers";

import { SwapWorkspace } from "@/components/app/SwapWorkspace";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { getSessionAddress, LOGIN_METHOD_COOKIE } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

export const metadata: Metadata = { title: "Swap" };
export const dynamic = "force-dynamic";

/** Swap any two of Zolva's tokens from your own wallet. Quotes work logged out; swapping needs a login. */
export default async function SwapPage() {
  const [address, cookieStore] = await Promise.all([getSessionAddress(), cookies()]);
  // Display only: how to sign (Privy window or browser wallet).
  const method = cookieStore.get(LOGIN_METHOD_COOKIE)?.value;
  const loginMethod = method === "privy" || method === "wallet" ? method : null;
  // Many accounts log in here to buy ZOLVA and never build an agent: offer the first one.
  let firstAgent = false;
  if (address) {
    const { count } = await db().from("agents").select("id", { count: "exact", head: true }).eq("owner", address);
    firstAgent = count === 0;
  }
  return (
    <div className="container page swap-page">
      {firstAgent && (
        <div className="card first-agent first-agent--slim">
          <img src="/img/icons/agent.png" alt="" width={48} height={48} />
          <div className="first-agent__text">
            <strong>Holding ZOLVA? Put it to work.</strong>
            <span className="muted">Build a trading agent and check its last 30 days before it runs. Paper trading is free, and holding ZOLVA lets you run more agents.</span>
          </div>
          <TrackedLink className="button button--primary" href="/studio" event="first_agent_cta" detail="swap">
            Build an agent
          </TrackedLink>
        </div>
      )}
      <SwapWorkspace address={address} loginMethod={loginMethod} />
    </div>
  );
}
