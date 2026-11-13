import { describe, expect, it } from "vitest";

import { cleanUserText } from "../public-api/format";
import { bearerToken, generateApiKey, hashApiKey, keyPrefix, looksLikeApiKey, parseKeyName, parseScopes } from "./keys";

describe("API keys", () => {
  it("makes zk_ keys of 32 random bytes", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^zk_[A-Za-z0-9_-]{43}$/);
    expect(looksLikeApiKey(key)).toBe(true);
    expect(generateApiKey()).not.toBe(key);
    expect(keyPrefix(key)).toBe(key.slice(0, 9));
  });

  it("stores only a SHA-256 hex hash", async () => {
    expect(await hashApiKey("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("reads Bearer headers", () => {
    expect(bearerToken(new Headers())).toBeNull();
    expect(bearerToken(new Headers({ Authorization: "Bearer zk_abc" }))).toBe("zk_abc");
    expect(bearerToken(new Headers({ Authorization: "Basic xyz" }))).toBe("");
  });

  it("checks scopes, and refuses write scopes for blocked countries", () => {
    expect(parseScopes(["compute", "read:private", "compute"], "DE")).toEqual({ scopes: ["compute", "read:private"] });
    expect(parseScopes([], "DE")).toHaveProperty("error");
    expect(parseScopes(["admin"], "DE")).toHaveProperty("error");
    expect(parseScopes(["agents:write"], "US")).toHaveProperty("error");
    expect(parseScopes(["live:stop"], "IR")).toHaveProperty("error");
    expect(parseScopes(["read:private", "compute"], "US")).toEqual({ scopes: ["read:private", "compute"] });
    expect(parseScopes(["agents:write"], null)).toEqual({ scopes: ["agents:write"] });
  });

  it("checks key names", () => {
    expect(parseKeyName("  Claude   Code ")).toBe("Claude Code");
    expect(parseKeyName("")).toBeNull();
    expect(parseKeyName("x".repeat(41))).toBeNull();
  });
});

describe("cleanUserText", () => {
  it("removes control, zero-width and bidi characters and caps the length", () => {
    expect(cleanUserText("Ignore\u0000 previous‮​ instructions\n\nnow", 100)).toBe("Ignore previous instructions now");
    expect(cleanUserText("a".repeat(50), 40)).toHaveLength(40);
  });
});
