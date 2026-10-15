import type { Metadata } from "next";

import { LegalPage } from "@/components/site/Legal";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <h2>What we store</h2>
      <p>Your wallet address, the country your sign in came from (to apply country restrictions), when you accepted the terms, and the agents you create.</p>
      <h2>What we never store</h2>
      <p>Private keys, seed phrases or wallet balances. Signing in is a free message signature and never moves funds.</p>
      <h2>Cookies</h2>
      <p>One essential cookie keeps you logged in for seven days. There are no advertising or tracking cookies.</p>
    </LegalPage>
  );
}
