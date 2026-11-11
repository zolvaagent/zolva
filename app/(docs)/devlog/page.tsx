import type { Metadata } from "next";

import { DevlogList } from "@/components/site/Devlog";
import { DEVLOG } from "@/lib/devlog";

export const metadata: Metadata = {
  title: "Dev log",
  description: "What shipped on Zolva, newest first. Every entry links to its public sources: commits, pages and transactions.",
  alternates: { types: { "application/rss+xml": [{ url: "/devlog/rss.xml", title: "Zolva dev log" }] } },
};

/** /devlog: what shipped, newest first, from lib/devlog.ts. */
export default function DevlogPage() {
  return (
    <div className="container page devlog">
      <header className="devlog__head">
        <span className="eyebrow">Dev log</span>
        <h1 className="page__title">What shipped, newest first</h1>
        <p className="page__lead">
          Every change since Zolva went live on October 15, 2026, including the research that did not work. Each entry links to its sources (the commit on GitHub, the page or the transaction) so
          you can check it.
        </p>
        <a className="text-link devlog__rss" href="/devlog/rss.xml">
          <i className="ph ph-rss" aria-hidden="true" /> RSS feed
        </a>
      </header>
      <DevlogList entries={DEVLOG} />
    </div>
  );
}
