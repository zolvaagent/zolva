import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RATE_LIMIT_BINDINGS } from "./limits";

describe("rate limits", () => {
  it("match the rate limiting bindings in wrangler.jsonc", () => {
    const wrangler = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
    for (const [name, limit] of Object.entries(RATE_LIMIT_BINDINGS)) {
      const line = wrangler.split("\n").find((row) => row.includes(`"${name}"`));
      expect(line, name).toBeDefined();
      expect(line?.replace(/\s+/g, ""), name).toContain(`"limit":${limit},"period":60}`);
    }
  });
});
