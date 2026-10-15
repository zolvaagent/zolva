import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Default config, no incremental-cache override.
 *
 * Agent pages and the leaderboard change every hour, so pages render
 * dynamically. Revisit if ISR is ever used.
 */
export default defineCloudflareConfig();
