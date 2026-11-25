import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MCP_VERSION } from "../../../lib/public-api/mcp-version.ts";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const pkg = read("../package.json");
const server = read("../../../server.json");

describe("MCP Registry entry", () => {
  it("names this package with the version that is published", () => {
    // The registry checks mcpName against the server name before it accepts the package.
    expect(pkg.mcpName).toBe(server.name);
    const entry = server.packages.find((item) => item.registryType === "npm");
    expect(entry.identifier).toBe(pkg.name);
    expect(entry.version).toBe(pkg.version);
    expect(entry.transport.type).toBe("stdio");
  });

  it("lists the same server version as the MCP server reports", () => {
    expect(server.version).toBe(MCP_VERSION);
  });
});
