"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { DOC_PAGES, docGroups, docHref, docPage } from "@/lib/docs";

/** Left column: every docs page by group, with the current one marked. */
export function DocsNav() {
  const pathname = usePathname();
  // On phones the topics are a scrolling row: keep the current one in view.
  useEffect(() => {
    document.querySelector(".docs-nav__link[aria-current='page']")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  return (
    <nav className="docs-nav" aria-label="Docs">
      {docGroups().map(({ group, pages }) => (
        <div key={group} className="docs-nav__group">
          <span className="docs-nav__label">{group}</span>
          {pages.map((page) => (
            <Link key={page.slug} className="docs-nav__link" href={docHref(page.slug)} aria-current={pathname === docHref(page.slug) ? "page" : undefined}>
              {page.title}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

type Heading = { id: string; text: string };

/** Right column: the page's sections (its h2s), with the one in view marked. */
export function DocsToc() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const elements = [...document.querySelectorAll<HTMLHeadingElement>(".docs-article h2[id]")];
    // The headings come from the page that just rendered, which React cannot see from here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeadings(elements.map((element) => ({ id: element.id, text: element.textContent ?? "" })));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pathname]);

  if (headings.length < 2) return null;
  return (
    <nav className="docs-toc" aria-label="On this page">
      <span className="docs-nav__label">On this page</span>
      {headings.map((heading) => (
        <a key={heading.id} className="docs-toc__link" href={`#${heading.id}`} aria-current={active === heading.id ? "true" : undefined}>
          {heading.text}
        </a>
      ))}
    </nav>
  );
}

/** A docs page: group label, title, lead, the content, then previous and next pages. */
export function DocsArticle({ slug, children }: { slug: string; children: ReactNode }) {
  const page = docPage(slug);
  const index = DOC_PAGES.indexOf(page);
  const previous = DOC_PAGES[index - 1];
  const next = DOC_PAGES[index + 1];
  return (
    <article className="docs-article">
      <span className="eyebrow">{page.group}</span>
      <h1 className="page__title">{page.title}</h1>
      <p className="page__lead">{page.description}</p>
      <div className="docs-body">{children}</div>
      <div className="docs-pager">
        {previous ? (
          <Link className="docs-pager__link" href={docHref(previous.slug)}>
            <span>
              <i className="ph ph-arrow-left" aria-hidden="true" /> Previous
            </span>
            <strong>{previous.title}</strong>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link className="docs-pager__link docs-pager__link--next" href={docHref(next.slug)}>
            <span>
              Next <i className="ph ph-arrow-right" aria-hidden="true" />
            </span>
            <strong>{next.title}</strong>
          </Link>
        )}
      </div>
    </article>
  );
}

/** Section heading with an anchor, picked up by the "On this page" list. */
export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id}>
      <a className="docs-anchor" href={`#${id}`}>
        {children}
      </a>
    </h2>
  );
}

const CALLOUT_ICONS = { note: "ph-info", tip: "ph-lightbulb", warn: "ph-warning" } as const;

/** A highlighted aside: a note, a tip or a warning. */
export function Callout({ kind = "note", title, children }: { kind?: keyof typeof CALLOUT_ICONS; title?: string; children: ReactNode }) {
  return (
    <aside className={`docs-callout docs-callout--${kind}`}>
      <i className={`ph-fill ${CALLOUT_ICONS[kind]}`} aria-hidden="true" />
      <div>
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </aside>
  );
}

/** A rule the way the Studio shows it: a label (Buy, Sell) and its conditions. */
export function RuleCard({ rows }: { rows: { label: string; tone?: "buy" | "sell" | "plain"; text: ReactNode }[] }) {
  return (
    <div className="docs-rule">
      {rows.map((row, index) => (
        <div key={index} className="docs-rule__row">
          <span className={`docs-rule__label docs-rule__label--${row.tone ?? "plain"}`}>{row.label}</span>
          <span>{row.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Numbered steps. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="docs-steps">{children}</ol>;
}
