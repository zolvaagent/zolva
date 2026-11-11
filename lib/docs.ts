/**
 * Docs navigation: one entry per page under app/(site)/docs, in reading order.
 * The sidebar, the previous/next links and page metadata all read this list,
 * so a page only has to be added here once.
 */

export type DocPage = { slug: string; title: string; description: string; group: string };

export const DOC_PAGES: DocPage[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    description: "What Zolva is, how paper trading works and how to launch your first agent in three steps.",
    group: "Basics",
  },
  {
    slug: "how-agents-work",
    title: "How agents work",
    description: "The hourly cycle: how an agent reads prices, decides to buy, sell or hold, and writes down why.",
    group: "Basics",
  },
  {
    slug: "strategies",
    title: "Strategies",
    description: "Momentum, Mean reversion and Custom rules: what each one buys, when it sells, and every indicator you can use.",
    group: "Building agents",
  },
  {
    slug: "prompt-mode",
    title: "Prompt mode",
    description: "Describe a strategy in plain words and get rules you can read, edit and backtest before you launch.",
    group: "Building agents",
  },
  {
    slug: "backtests",
    title: "Backtests",
    description: "How the Studio replays the last 30 days with your settings, what the numbers mean and where backtests fall short.",
    group: "Building agents",
  },
  {
    slug: "ai-copilot",
    title: "AI co-pilot",
    description: "An optional second opinion on every trade: what the AI can and cannot do, the models, credits and spending limits.",
    group: "Building agents",
  },
  {
    slug: "markets-and-prices",
    title: "Markets and prices",
    description: "Which stock tokens and coins agents can trade, where every price comes from and how it is checked.",
    group: "Markets",
  },
  {
    slug: "leaderboard",
    title: "Leaderboard and publishing",
    description: "Private and published agents, how the leaderboard ranks them and what other people can see.",
    group: "Results",
  },
  {
    slug: "public-api",
    title: "Public API",
    description: "Read Zolva's published agents, their decisions, the markets and recent trades as JSON, with no key needed.",
    group: "Developers",
  },
  {
    slug: "mcp",
    title: "MCP server",
    description: "Connect Claude, Cursor or any MCP client to Zolva and ask about agents, decisions and markets in plain words.",
    group: "Developers",
  },
  {
    slug: "premium-api",
    title: "Premium API (x402)",
    description: "Paid per call in USDG on Robinhood Chain with x402: a live market scan and backtests with Zolva's engine. No account or key.",
    group: "Developers",
  },
  {
    slug: "token",
    title: "ZOLVA token",
    description: "What holding ZOLVA unlocks: free hourly AI reviews and higher limits, with nothing to stake or lock.",
    group: "Token",
  },
  {
    slug: "contracts",
    title: "Contracts",
    description: "Every address Zolva uses on Robinhood Chain: the ZOLVA token, Zolva's wallets and the contracts it calls, each linked to Blockscout.",
    group: "Token",
  },
  {
    slug: "guardrails",
    title: "Guardrails",
    description: "Every limit that keeps an agent in check, the extra limits on real money, what pausing does, and what is coming next.",
    group: "Safety",
  },
  {
    slug: "verify",
    title: "Verify Zolva",
    description: "What is live and planned, with a link to check each claim: code, decisions, prices, the real money wallet and official accounts.",
    group: "Safety",
  },
  {
    slug: "faq",
    title: "FAQ and glossary",
    description: "Short answers to common questions, and the terms used across Zolva.",
    group: "Help",
  },
];

export const docHref = (slug: string) => `/docs/${slug}`;

export function docPage(slug: string): DocPage {
  const page = DOC_PAGES.find((item) => item.slug === slug);
  if (!page) throw new Error(`Unknown docs page: ${slug}`);
  return page;
}

/** Pages grouped for the sidebar, groups in first-seen order. */
export function docGroups(): { group: string; pages: DocPage[] }[] {
  const groups: { group: string; pages: DocPage[] }[] = [];
  for (const page of DOC_PAGES) {
    const existing = groups.find((item) => item.group === page.group);
    if (existing) existing.pages.push(page);
    else groups.push({ group: page.group, pages: [page] });
  }
  return groups;
}
