import { describe, expect, it } from "vitest";

import { firstCloseAt } from "./listing";

const at = (iso: string) => Date.parse(iso);

describe("firstCloseAt", () => {
  it("is the end of the first full hour after the history start, plus the tick's delay", () => {
    // ANT: pool from 17:16, history from 18:00; the 18:00 hour is stored at ~19:10.
    expect(firstCloseAt(at("2026-11-19T18:00:00Z"), at("2026-11-19T17:35:00Z"))).toBe(at("2026-11-19T19:10:00Z"));
    // A history start inside an hour waits for the next full hour.
    expect(firstCloseAt(at("2026-11-19T17:16:00Z"), at("2026-11-19T17:20:00Z"))).toBe(at("2026-11-19T19:10:00Z"));
  });

  it("without a history start, counts from now", () => {
    expect(firstCloseAt(null, at("2026-11-19T17:20:00Z"))).toBe(at("2026-11-19T19:10:00Z"));
  });

  it("points at the next tick when the expected one has passed", () => {
    expect(firstCloseAt(at("2026-11-19T18:00:00Z"), at("2026-11-19T19:30:00Z"))).toBe(at("2026-11-19T20:10:00Z"));
  });
});
