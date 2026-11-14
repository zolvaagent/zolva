import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ACTION_NAMES, ACTIONS } from "../public-api/actions";
import { ME_ROUTES } from "../public-api/me-routes";
import { READ_TOOLS } from "../public-api/tools";
import { ACTION_REFERENCE, API_ERRORS, EXAMPLE_BODIES, KEY_TOOL_REFERENCE, LIMIT_ROWS, READ_TOOL_REFERENCE } from "./api";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

describe("API docs reference", () => {
  it("covers every keyed action and every MCP tool", () => {
    expect(ACTION_REFERENCE.map((row) => row.name).sort()).toEqual([...ACTION_NAMES].sort());
    expect(ACTION_REFERENCE).toHaveLength(ME_ROUTES.length);
    expect(KEY_TOOL_REFERENCE.map((row) => row.name)).toEqual(ACTION_NAMES);
    expect(READ_TOOL_REFERENCE.map((row) => row.name)).toEqual(Object.keys(READ_TOOLS));
  });

  it("lists every input of every action", () => {
    for (const row of ACTION_REFERENCE) {
      const inPath = ME_ROUTES.find((route) => route.action === row.name)!.path.includes(":id");
      const expected = Object.keys(ACTIONS[row.name].input).filter((name) => !(inPath && name === "agentId"));
      expect(row.params.map((param) => param.name), row.name).toEqual(expected);
    }
  });

  it("has example bodies the actions accept", () => {
    for (const name of ACTION_NAMES) {
      const inPath = ME_ROUTES.find((route) => route.action === name)!.path.includes(":id");
      const body = { ...(EXAMPLE_BODIES[name] ?? {}), ...(inPath ? { agentId: "ae0581f0-e99b-4d80-abf0-fd98fff11c78" } : {}) };
      const parsed = z.object(ACTIONS[name].input).strict().safeParse(body);
      expect(parsed.success, `${name}: ${parsed.error?.message}`).toBe(true);
    }
  });

  it("documents every error code the API can return", () => {
    const files = [...sourceFiles("lib/public-api"), ...sourceFiles("app/api/public"), "app/mcp/route.ts"];
    const codes = new Set<string>();
    for (const file of files) {
      const text = read(file);
      for (const match of text.matchAll(/(?:ActionError|fail|apiError)\(\d{3}, "([a-z_]+)"/g)) codes.add(match[1]);
      const writer = text.match(/WRITER_CODES[^=]*=\s*\{([^}]*)\}/);
      if (writer) for (const match of writer[1].matchAll(/"([a-z_]+)"/g)) codes.add(match[1]);
    }
    expect(codes.size).toBeGreaterThan(10);
    const documented = API_ERRORS.map((row) => row.code);
    for (const code of codes) expect(documented, code).toContain(code);
  });

  it("is rendered by the pages", () => {
    const publicApi = read("app/(docs)/docs/public-api/page.tsx");
    for (const name of ["ACTION_REFERENCE", "API_ERRORS", "LIMIT_ROWS", "SCOPE_ROWS"]) expect(publicApi, name).toMatch(new RegExp(`\\b${name}\\b`));
    const mcp = read("app/(docs)/docs/mcp/page.tsx");
    for (const name of ["READ_TOOL_REFERENCE", "KEY_TOOL_REFERENCE"]) expect(mcp, name).toMatch(new RegExp(`\\b${name}\\b`));
    expect(LIMIT_ROWS.length).toBeGreaterThan(10);
  });
});
