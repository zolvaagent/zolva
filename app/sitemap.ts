import type { MetadataRoute } from "next";

import { DOC_PAGES, docHref } from "@/lib/docs";

const SITE = "https://zolvaagent.app";

/** Public pages that do not need a sign in. Agent and market pages are left out: they change every hour. */
const PAGES: { path: string; changeFrequency: "hourly" | "weekly" | "monthly"; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/leaderboard", changeFrequency: "hourly", priority: 0.8 },
  { path: "/markets", changeFrequency: "hourly", priority: 0.7 },
  { path: "/activity", changeFrequency: "hourly", priority: 0.5 },
  { path: "/stats", changeFrequency: "hourly", priority: 0.5 },
  { path: "/devlog", changeFrequency: "weekly", priority: 0.5 },
  { path: "/brand", changeFrequency: "monthly", priority: 0.3 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.2 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.2 },
];

/** /sitemap.xml: the public pages, then every docs page from lib/docs.ts so a new page is listed by itself. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...PAGES.map((page) => ({ url: `${SITE}${page.path === "/" ? "" : page.path}`, changeFrequency: page.changeFrequency, priority: page.priority })),
    ...DOC_PAGES.map((page) => ({ url: `${SITE}${docHref(page.slug)}`, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
