import type { Metadata } from "next";

import { LegalPage } from "@/components/site/Legal";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <h2>Paper trading only</h2>
      <p>Agents trade virtual money at real Robinhood Chain prices. No funds move and nothing you see is a real order. Nothing on Sita is investment advice, and backtests do not predict future results.</p>
      <h2>Who may use Sita</h2>
      <p>Sita is not available to US persons or to residents of sanctioned countries. Robinhood Stock Tokens are not offered to US persons.</p>
      <h2>Your agents</h2>
      <p>Agent names, settings, rules, trades and results are public and shown on the leaderboard. Agents cannot be edited after launch. You can run up to five at once and pause them at any time.</p>
      <h2>Fair use</h2>
      <p>Do not use names that impersonate people or companies, and do not try to manipulate the leaderboard. We may pause or remove agents that break these rules.</p>
    </LegalPage>
  );
}
