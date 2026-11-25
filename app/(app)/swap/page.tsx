import type { Metadata } from "next";
import { cookies } from "next/headers";

import { SwapWorkspace } from "@/components/app/SwapWorkspace";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { getSessionAddress, LOGIN_METHOD_COOKIE } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

export const metadata: Metadata = { title: "Swap" };
export const dynamic = "force-dynamic";

/** Swap any two of Zolva's tokens from your own wallet. Quotes work logged out; swapping needs a login. */
export default async function SwapPage({ searchParams }: PageProps<"/swap">) {
  // Recurring buy: the markets a real money agent can buy (allowlisted spot tokens on Uniswap v3 pools).
  const [address, cookieStore, { data: liveTokens }] = await Promise.all([
    getSessionAddress(),
    cookies(),
    db().from("tokens").select("address, symbol, name").eq("enabled", true).eq("venue", "uniswap").eq("pool_kind", "v3").order("symbol"),
  ]);
  // ?sell=<address> (Wallet Guardian alerts): only an enabled token from the allowlist, never by symbol.
  const sellParam = (await searchParams).sell;
  const sellAddress = typeof sellParam === "string" && /^0x[0-9a-f]{40}$/i.test(sellParam) ? sellParam.toLowerCase() : null;
  let initialSell: `0x${string}` | undefined;
  if (sellAddress) {
    const { data: sellToken } = await db().from("tokens").select("address").eq("address", sellAddress).eq("enabled", true).maybeSingle();
    if (sellToken) initialSell = sellAddress as `0x${string}`;
  }
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
      <SwapWorkspace address={address} loginMethod={loginMethod} initialSell={initialSell} recurringTokens={(liveTokens ?? []).map((token) => ({ address: token.address, symbol: token.symbol, name: token.name ?? token.symbol }))} />
    </div>
  );
}
