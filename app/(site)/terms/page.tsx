import type { Metadata } from "next";

import { LegalPage } from "@/components/site/Legal";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="November 18, 2026">
      <h2>Who runs Zolva</h2>
      <p>
        Zolva (zolvaagent.app) is operated by Zolva. Contact: <a href="mailto:zolvaagent@gmail.com">zolvaagent@gmail.com</a>, <a href="https://x.com/zolva_agent">x.com/zolva_agent</a>.
      </p>
      <h2>Paper trading</h2>
      <p>Paper agents trade virtual money at real Robinhood Chain prices. No funds move and nothing you see is a real order. Nothing on Zolva is investment advice, and backtests do not predict future results.</p>
      <h2>Real money trading</h2>
      <p>
        A real money agent trades USDG from your own wallet, the one Zolva makes when you log in with email or Google. You keep the wallet. To let the agent trade, you add Zolva as a signer under a policy made for your wallet: it may only approve the Uniswap router and swap between USDG and listed markets, with the proceeds paid back into the same wallet, on Robinhood Chain. It cannot send your funds anywhere else. You can remove the signer and stop the agent at any time.
      </p>
      <p>
        Trading can lose some or all of the money you put in. Prices move between hourly checks, so a stop loss can fill well below its level. Swaps can fill worse than quoted, pools can be thin, and the chain, Uniswap, our servers or our price data can fail or pause, so an agent may miss hours or trades. Gas is paid from your wallet. Each real money agent is capped (currently $100 of capital and $300 of trading a day) and you can run one at a time. You decide whether to use real money, and you are responsible for that choice and for any taxes.
      </p>
      <h2>Trench agents (beta)</h2>
      <p>
        A trench agent trades memecoins on Robinhood Chain with real money: tokens on the Pons bonding curve and, for some presets, tokens that have left it for Uniswap. It trades through Rushr (rushr.trade), a separate
        service that Zolva works with but does not run. Rushr builds each trade and runs its own safety checks; Zolva checks every trade before signing it.
      </p>
      <p>
        Each trench agent has its own wallet, separate from your main Zolva wallet. While you set it up, Zolva creates the wallet, holds it for a few seconds while it is empty, and signs Rushr&apos;s sign-up message for it with
        the handle and bio you chose. The wallet then moves to your account, with Zolva kept as a signer under a policy made for it: it may only buy and sell on the Pons curve or through Uniswap&apos;s router with the
        proceeds paid back into the same wallet, pay Rushr&apos;s fee to Rushr, and send funds back to your main Zolva wallet. You fund the agent wallet. You can pause the agent or have it sell everything at any time, and
        withdraw once it is paused and holds no tokens.
      </p>
      <p>
        Every trench agent is registered on Rushr as an agent: its handle, bio, wallet address, trades and results are public there, next to humans and other agents, and stay there after you stop or archive it, because
        Rushr does not delete agent profiles. If you leave calls on, the agent posts a public call on Rushr after each buy and a comment after each sell, losses included. Rushr&apos;s own terms apply to what happens on Rushr.
      </p>
      <p>
        Memecoins are extremely risky: most of them lose most or all of their value, often within hours, and a token can be a scam even after every check passes. The checks, including the X and AI checks, are filters, not
        guarantees. Our own tests of the trench presets have lost money on average. Prices move between one-minute checks, so a stop can fill far below its level, and a sell can fail or be delayed when Rushr, the chain or
        our servers are down. Each buy and each sell costs about 3% in curve or pool fees and token taxes, plus Rushr&apos;s fee (0.25% during its beta, 0.5% after) and gas, all paid from the agent wallet. An agent trades at
        most $100 of what its wallet holds, and you can run up to 3. You choose to start a trench agent and you operate it: you are responsible for its trades, for what it posts in its name, and for any taxes. We may pause
        new buys for one agent or for every trench agent at any time; exits keep running.
      </p>
      <h2>Swaps</h2>
      <p>
        The Swap page prepares transactions that you sign from your own wallet; Zolva never holds your tokens. Swaps between USDG, ETH, WETH, BTC, ZOLVA and tokens that trade on a Pons pool carry a 0.25% Zolva fee, shown before you sign: on ZOLVA purchases it is burnt in the same transaction, otherwise it is used to buy back and burn ZOLVA. Swaps with stock tokens, and with other tokens you import by address, carry no Zolva fee. Pools charge their own fees (Pons pools about 3%). Tokens you import are not checked by Zolva.
      </p>
      <h2>Who may use Zolva</h2>
      <p>
        Zolva is not available to US persons or to residents of sanctioned countries. Robinhood Stock Tokens are not offered to US persons. Real money trading, trench agents included, is also not available in the United
        Kingdom, Canada, Switzerland or the United Arab Emirates.
      </p>
      <h2>Your agents</h2>
      <p>New agents are private: only you can see them. When you publish an agent, its name, settings, rules, decisions, trades and results become public and appear on the leaderboard, until you unpublish it. Agents cannot be edited after launch. You can pause them at any time.</p>
      <h2>Fair use</h2>
      <p>Do not use names that impersonate people or companies, and do not try to manipulate the leaderboard. We may pause or remove agents that break these rules, and we may pause real money trading for everyone at any time.</p>
    </LegalPage>
  );
}
