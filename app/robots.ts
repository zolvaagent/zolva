import type { MetadataRoute } from "next";

/**
 * /robots.txt: crawl the public site and point crawlers to /sitemap.xml. Signed-in
 * pages, the dev tools and the APIs are left out; they have nothing to index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/mcp", "/dev/", "/settings", "/app", "/swap"] },
    sitemap: "https://zolvaagent.app/sitemap.xml",
  };
}
