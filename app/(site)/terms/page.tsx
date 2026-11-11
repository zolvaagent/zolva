import type { Metadata } from "next";

import { LegalPage } from "@/components/site/Legal";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="November 11, 2026">
      <h2>Paper trading</h2>
      <p>Paper agents trade virtual money at real Robinhood Chain prices. No funds move and nothing you see is a real order. Nothing on Zolva is investment advice, and backtests do not predict future results.</p>
      <h2>Real money trading</h2>
      <p>
        A real money agent trades USDG from your own wallet, the one Zolva makes when you log in with email or Google. You keep the wallet. To let the agent trade, you add Zolva as a signer under a policy made for your wallet: it may only approve the Uniswap router and swap between USDG and listed markets, with the proceeds paid back into the same wallet, on Robinhood Chain. It cannot send your funds anywhere else. You can remove the signer and stop the agent at any time.
      </p>
      <p>
        Trading can lose some or all of the money you put in. Prices move between hourly checks, so a stop loss can fill well below its level. Swaps can fill worse than quoted, pools can be thin, and the chain, Uniswap, our servers or our price data can fail or pause, so an agent may miss hours or trades. Gas is paid from your wallet. Each real money agent is capped (currently $100 of capital and $300 of trading a day) and you can run one at a time. You decide whether to use real money, and you are responsible for that choice and for any taxes.
      </p>
      <h2>Swaps</h2>
      <p>
        The Swap page prepares transactions that you sign from your own wallet; Zolva never holds your tokens. Swaps between USDG, ETH, WETH, BTC, ZOLVA and tokens that trade on a Pons pool carry a 0.25% Zolva fee, shown before you sign: on ZOLVA purchases it is burnt in the same transaction, otherwise it is used to buy back and burn ZOLVA. Swaps with stock tokens, and with other tokens you import by address, carry no Zolva fee. Pools charge their own fees (Pons pools about 3%). Tokens you import are not checked by Zolva.
      </p>
      <h2>Who may use Zolva</h2>
      <p>
        Zolva is not available to US persons or to residents of sanctioned countries. Robinhood Stock Tokens are not offered to US persons. Real money trading is also not available in the United Kingdom, Canada, Switzerland or the United Arab Emirates.
      </p>
      <h2>Your agents</h2>
      <p>New agents are private: only you can see them. When you publish an agent, its name, settings, rules, decisions, trades and results become public and appear on the leaderboard, until you unpublish it. Agents cannot be edited after launch. You can pause them at any time.</p>
      <h2>Fair use</h2>
      <p>Do not use names that impersonate people or companies, and do not try to manipulate the leaderboard. We may pause or remove agents that break these rules, and we may pause real money trading for everyone at any time.</p>
    </LegalPage>
  );
}
