import { describe, expect, it } from "vitest";

import type { DevlogEntry } from "./devlog";
import { unseenItems, whatsNewItems, WHATS_NEW_MAX } from "./whats-new";

const entry = (id: string, hrefs: string[]): DevlogEntry => ({
  id,
  date: "2026-11-23",
  area: "Agents",
  title: id,
  body: "",
  sources: hrefs.map((href) => ({ label: href, href })),
});

describe("whatsNewItems", () => {
  it("links the first page on the site, kept relative", () => {
    const [item] = whatsNewItems([entry("a", ["https://github.com/zolvaagent/zolva/commit/abc", "https://zolvaagent.app/activity?view=positions"])]);
    expect(item.href).toBe("/activity?view=positions");
  });

  it("falls back to the entry on /devlog when it only links commits or other sites", () => {
    const [item] = whatsNewItems([entry("b", ["https://github.com/zolvaagent/zolva/commit/abc", "https://robin.etherscan.io/tx/0x1"])]);
    expect(item.href).toBe("/devlog#b");
  });

  it("keeps DEVLOG order and the limit", () => {
    const items = whatsNewItems(["1", "2", "3", "4"].map((id) => entry(id, [])), 2);
    expect(items.map((item) => item.id)).toEqual(["1", "2"]);
  });
});

describe("unseenItems", () => {
  const items = whatsNewItems(["e5", "e4", "e3", "e2", "e1"].map((id) => entry(id, [])));
  const ids = (seen: string | null) => unseenItems(items, seen).map((item) => item.id);

  it("shows the newest few on a first visit", () => {
    expect(ids(null)).toEqual(["e5", "e4", "e3"].slice(0, WHATS_NEW_MAX));
  });

  it("shows only entries newer than the one closed on", () => {
    expect(ids("e3")).toEqual(["e5", "e4"]);
    expect(ids("e5")).toEqual([]);
  });

  it("caps a long gap at the newest few", () => {
    expect(ids("e1")).toEqual(["e5", "e4", "e3"]);
  });

  it("treats an id older than every item like a first visit", () => {
    expect(ids("gone")).toEqual(["e5", "e4", "e3"]);
  });
});
