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
