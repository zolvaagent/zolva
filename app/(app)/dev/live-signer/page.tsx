import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LiveSigner } from "@/components/app/LiveSigner";
import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Live signer (dev)", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Real money spike, step 1 (owner only): grant or remove Zolva's signer on
 * your Privy embedded wallet. Local development only; production returns 404.
 */
export default async function LiveSignerPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const address = await getSessionAddress();
  return (
    <div className="container page">
      <h1 className="page__title">Live signer (dev only)</h1>
      <p className="page__lead">Step 1 of real money trading: let Zolva sign swaps for your Privy wallet, limited by a policy. Nothing trades from this page.</p>
      <LiveSigner address={address} signer={env.liveSigner} />
    </div>
  );
}
