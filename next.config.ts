import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    // Pinned so Turbopack does not walk up and pick an unrelated lockfile.
    root: dirname,
  },
};

export default nextConfig;

// Exposes Cloudflare bindings (and .dev.vars secrets) to `next dev`.
initOpenNextCloudflareForDev();
