#!/usr/bin/env node
/**
 * `npx @zolva/mcp`: runs Zolva's MCP server for clients that start local (stdio) servers.
 * Set ZOLVA_API_KEY for your own paper agents; without it the tools are read-only.
 */
import { readFileSync } from "node:fs";

import { DEFAULT_URL, startBridge } from "../lib/bridge.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const HELP = `@zolva/mcp ${version}: Zolva's MCP server over stdio

Usage: add it to your MCP client as a local server.
  command: npx
  args:    ["-y", "@zolva/mcp"]
  env:     ZOLVA_API_KEY=zk_...   (optional: your own paper agents, backtests, AI)

Without a key the tools are read-only: published agents, markets and trades.
Make a key at https://zolvaagent.app/settings#api-keys
Docs: https://zolvaagent.app/docs/mcp

Environment:
  ZOLVA_API_KEY   API key (zk_...), sent as a Bearer token
  ZOLVA_MCP_URL   Server URL, default ${DEFAULT_URL}

Options:
  -h, --help      Show this help
  -v, --version   Show the version`;

const argument = process.argv[2];
if (argument === "-h" || argument === "--help") {
  process.stdout.write(`${HELP}\n`);
  process.exit(0);
}
if (argument === "-v" || argument === "--version") {
  process.stdout.write(`${version}\n`);
  process.exit(0);
}

// stdout carries the MCP messages, so every note goes to stderr.
const apiKey = process.env.ZOLVA_API_KEY?.trim() || undefined;
if (apiKey && !apiKey.startsWith("zk_")) process.stderr.write("[zolva] ZOLVA_API_KEY does not look like a Zolva key (zk_...). Sending it anyway.\n");

await startBridge({ apiKey, url: process.env.ZOLVA_MCP_URL || DEFAULT_URL, userAgent: `zolva-npm/${version}` });
process.stderr.write(`[zolva] ${version} connected to ${process.env.ZOLVA_MCP_URL || DEFAULT_URL} (${apiKey ? "with API key" : "read-only"})\n`);
