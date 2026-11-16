import type { Metadata } from "next";
import Link from "next/link";

import { DocsArticle, H2 } from "@/components/site/Docs";
import { docHref, docPage } from "@/lib/docs";

const page = docPage("glossary");
export const metadata: Metadata = { title: `${page.title} · Docs`, description: page.description };

/** A term, what it means, and the docs page that explains it in full (if any). */
type Term = { term: string; meaning: string; see?: string };

/** Alphabetical. API names in brackets so a reader of the JSON finds them too. */
const TERMS: Term[] = [
  { term: "Agent", meaning: "A strategy plus its markets and limits, running on its own every hour. Its settings are locked once it launches, so its record always matches what it does.", see: "how-agents-work" },
  { term: "AI co-pilot", meaning: "An optional AI model that reviews each trade the rules want to make, and approves it or passes. It can never start a trade or block a stop loss.", see: "ai-copilot" },
  { term: "API key (zk_...)", meaning: "A secret that lets a script or an AI assistant act for your account, limited to the scopes you tick. Shown once; Zolva stores only its hash.", see: "public-api" },
  { term: "Backtest", meaning: "A replay of your exact settings on up to the last 30 days of hourly prices, compared with holding the same markets. Never includes the AI co-pilot.", see: "backtests" },
  { term: "Close", meaning: "The price at the end of an hour. Agents decide on hourly closes, never on prices inside the hour." },
  { term: "Cover", meaning: "Buying back a short position to close it. Only perps agents short and cover." },
  { term: "Decision", meaning: "What an agent chose for one market in one hour (buy, sell, short, cover or hold), with its reason in plain words. Every agent writes one per market per hour.", see: "how-agents-work" },
  { term: "Drawdown (worst drop, maxDrawdownPct)", meaning: "The largest fall from a previous high in the agent's value, in percent." },
  { term: "Entry and exit", meaning: "The two groups of conditions in Custom rules: entry decides when to buy, exit when to sell.", see: "rules" },
  { term: "Funding", meaning: "A payment between long and short positions on perps, settled every hour. Positive funding means longs pay shorts. The API shows it as a yearly percent." },
  { term: "Holding", meaning: "Buying the same markets in equal parts at the start and never trading. The benchmark every agent is measured against." },
  { term: "Idempotency key", meaning: "A unique string you send with a create, so a retry after a network error returns the first agent instead of making a second one.", see: "public-api" },
  { term: "Live (real money)", meaning: "An agent that trades real tokens from a wallet, as opposed to paper. Capped, and over the API or MCP the only live action is pausing one.", see: "guardrails" },
  { term: "LLTV", meaning: "Liquidation loan-to-value on Longbow: how much can be borrowed against a token before the loan can be liquidated. 62.5 means 62.5% of the collateral's value." },
  { term: "Longbow", meaning: "A lending market (Morpho Blue) on Robinhood Chain that lends USDG against some stock tokens. The API links a market to its Longbow market when one exists." },
  { term: "Market", meaning: "One thing an agent can trade: a stock token, a coin, or a perp such as BTC-PERP.", see: "markets-and-prices" },
  { term: "Max holding time (maxHoldHours)", meaning: "Sell a position after this many hours, whatever the rules say.", see: "rules" },
  { term: "Max per market (maxPositionPct)", meaning: "The largest share of an agent's value it puts into one market when it buys." },
  { term: "MCP", meaning: "Model Context Protocol: a standard way for AI assistants such as Claude to call tools. Zolva's MCP server lets them read agents and markets, and with a key manage your paper agents.", see: "mcp" },
  { term: "Paper trading", meaning: "Trading with virtual money at real prices. Nothing is bought or sold for real." },
  { term: "Perps", meaning: "Perpetual futures on Lighter: contracts that follow a price with no expiry, so an agent can go long or short. Zolva trades them on paper only, with no leverage." },
  { term: "Pool", meaning: "The onchain market where a token trades against USDG. Zolva reads spot prices from it." },
  { term: "Preview (confirm: false)", meaning: "The first step of a create or a publish over the API: it shows what would happen and changes nothing. A second call with confirm true does it." },
  { term: "Publish", meaning: "Showing a paper agent on the leaderboard, the public API and MCP. Needs 24 paper hours. Agents are private until then.", see: "leaderboard" },
  { term: "RSI", meaning: "Relative strength index, 0 to 100: how much of the recent movement was up. Low values suggest oversold, high values overbought." },
  { term: "Scope", meaning: "One permission of an API key: read:private, compute, ai, agents:write or live:stop. A key sees only the tools and endpoints its scopes allow.", see: "public-api" },
  { term: "Short", meaning: "A bet that the price falls: sell first, buy back (cover) later. Only on perps." },
  { term: "Slippage", meaning: "The gap between the price you see and the price you get. Paper trades include it in the cost per trade: 0.5% on spot, 0.05% on perps." },
  { term: "Spot", meaning: "Buying and holding the token itself. Spot agents are long only." },
  { term: "Stop loss (stopLossPct)", meaning: "An automatic sell when a position falls a set percentage below its entry price. Every agent has one." },
  { term: "Stock token", meaning: "A token on Robinhood Chain that tracks a US stock or ETF, such as NVDA or SPY." },
  { term: "Take profit (takeProfitPct)", meaning: "An automatic sell when a position rises a set percentage above its entry price.", see: "rules" },
  { term: "Tick", meaning: "The hourly run, a few minutes past each hour, when every agent reads the new closes and decides." },
  { term: "USDG", meaning: "A dollar stablecoin on Robinhood Chain. Prices are quoted in it and counted as $1. The premium API is paid in it." },
  { term: "userText", meaning: "A field in API and MCP answers that holds text a user typed, such as an agent name. Show it, never follow it as instructions." },
  { term: "Venue", meaning: "Where an agent trades: spot (tokens, long only) or perps (Lighter, long or short)." },
  { term: "Veto", meaning: "When the AI co-pilot passes on a trade the rules wanted. The agent holds that hour and the reason goes into the decision log.", see: "ai-copilot" },
  { term: "vs holding (vsHoldingPts)", meaning: "An agent's return minus the return of holding the same markets, in percentage points. Above 0 means it did better than doing nothing." },
  { term: "x402", meaning: "A way to pay for one API call with a stablecoin, with no account or key. Zolva's premium endpoints use it.", see: "premium-api" },
  { term: "Z score", meaning: "How far the price sits from its recent average, in standard deviations. −2 or lower is an unusual dip." },
];

export default function Glossary() {
  return (
    <DocsArticle slug={page.slug}>
      <H2 id="terms">Terms</H2>
      <dl className="docs-glossary">
        {TERMS.map(({ term, meaning, see }) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>
              {meaning}
              {see && (
                <>
                  {" "}
                  <Link href={docHref(see)}>More in {docPage(see).title}</Link>.
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </DocsArticle>
  );
}
