import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // The agent builder was called the Forge until 2026-10-16. Old links keep
  // working, query string included (e.g. /forge?stock=NVDA).
  async redirects() {
    return [{ source: "/forge", destination: "/studio", permanent: true }];
  },
  async rewrites() {
    // ERC-8004 agentURI and endpoint-domain verification file (lib/erc8004.ts).
    return [{ source: "/.well-known/agent-registration.json", destination: "/api/erc8004/registration" }];
  },
  turbopack: {
    // Pinned so Turbopack does not walk up and pick an unrelated lockfile.
    root: dirname,
  },
};

export default nextConfig;

// Exposes Cloudflare bindings (and .dev.vars secrets) to `next dev`.
initOpenNextCloudflareForDev();
