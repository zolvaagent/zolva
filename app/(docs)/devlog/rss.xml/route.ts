import { DEVLOG } from "@/lib/devlog";

const SITE = "https://zolvaagent.app";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS 2.0 feed of the dev log, newest 50 entries. */
export function GET() {
  const items = DEVLOG.slice(0, 50)
    .map((entry) => {
      const link = `${SITE}/devlog#${entry.id}`;
      const sources = entry.sources.map((source) => `${source.label}: ${source.href}`).join("\n");
      return `    <item>
      <title>${escape(`${entry.area} · ${entry.title}`)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(`${entry.date}T12:00:00Z`).toUTCString()}</pubDate>
      <category>${escape(entry.area)}</category>
      <description>${escape(`${entry.body}\n\nSources:\n${sources}`)}</description>
    </item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Zolva dev log</title>
    <link>${SITE}/devlog</link>
    <atom:link href="${SITE}/devlog/rss.xml" rel="self" type="application/rss+xml" />
    <description>What shipped on Zolva, newest first, with public sources.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
