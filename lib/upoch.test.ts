import { describe, expect, it } from "vitest";

import { fetchUpochBadge, isSafeBadgeSvg, isUpochMirrorNumber, upochMirror } from "./upoch";

const BADGE = '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="20" role="img"><linearGradient id="s"/><rect fill="url(#s)"/><text>Verified</text></svg>';

describe("upochMirror", () => {
  it("maps the 3 mirrored agents and nothing else", () => {
    expect(upochMirror("be4b8f92-031d-4ae1-a5e9-c12583ff1d20")).toEqual({ number: 6, pageUrl: "https://upoch.tech/verified/6", badgePath: "/api/upoch-badge/6" });
    expect(upochMirror("b4cca798-68a1-4064-b750-92f6e1e06bb0")?.number).toBe(7);
    expect(upochMirror("8482ba4c-a4ad-47b5-b6d2-222ecdf5cc5f")?.number).toBe(8);
    expect(upochMirror("bdf114e1-45cf-4e83-9308-6e2db6f26bc4")).toBeNull();
  });
});

describe("isUpochMirrorNumber", () => {
  it("accepts only listed numbers", () => {
    expect(isUpochMirrorNumber("6")).toBe(6);
    expect(isUpochMirrorNumber("5")).toBeNull();
    expect(isUpochMirrorNumber("6/../x")).toBeNull();
    expect(isUpochMirrorNumber("")).toBeNull();
  });
});

describe("isSafeBadgeSvg", () => {
  it("accepts a plain badge", () => expect(isSafeBadgeSvg(BADGE)).toBe(true));
  it("rejects scripts, handlers, foreign content and outside links", () => {
    expect(isSafeBadgeSvg(BADGE.replace("<text>", "<script>alert(1)</script><text>"))).toBe(false);
    expect(isSafeBadgeSvg(BADGE.replace("<rect", '<rect onload="x()"'))).toBe(false);
    expect(isSafeBadgeSvg(BADGE.replace("<text>", "<foreignObject/><text>"))).toBe(false);
    expect(isSafeBadgeSvg(BADGE.replace("<text>", '<image href="https://evil.example/x.png"/><text>'))).toBe(false);
  });
  it("rejects non-SVG and oversized bodies", () => {
    expect(isSafeBadgeSvg("<html></html>")).toBe(false);
    expect(isSafeBadgeSvg(BADGE + " ".repeat(40_000))).toBe(false);
  });
});

describe("fetchUpochBadge", () => {
  const respond = (body: string, type = "image/svg+xml; charset=utf-8", status = 200) =>
    (async () => new Response(body, { status, headers: { "content-type": type } })) as unknown as typeof fetch;

  it("returns a safe badge", async () => expect(await fetchUpochBadge(6, respond(BADGE))).toBe(BADGE));
  it("returns null on errors, wrong type or unsafe content", async () => {
    expect(await fetchUpochBadge(6, respond(BADGE, "text/html"))).toBeNull();
    expect(await fetchUpochBadge(6, respond("", "image/svg+xml", 500))).toBeNull();
    expect(await fetchUpochBadge(6, respond(BADGE.replace("<text>", "<script></script><text>")))).toBeNull();
    const failing = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect(await fetchUpochBadge(6, failing)).toBeNull();
  });
});
