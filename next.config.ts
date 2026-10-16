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
  turbopack: {
    // Pinned so Turbopack does not walk up and pick an unrelated lockfile.
    root: dirname,
  },
};

export default nextConfig;

// Exposes Cloudflare bindings (and .dev.vars secrets) to `next dev`.
initOpenNextCloudflareForDev();
