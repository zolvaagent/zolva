import { describe, expect, it } from "vitest";

import { VERIFY_STALE_SECONDS, verifyBadge, type StoredVerify } from "./verify-badge";

const NOW = 1_790_000_000;
const row = (agentId: string, status: StoredVerify["status"], age = 60): StoredVerify => ({ agentId, status, checkedAt: NOW - age });

describe("verifyBadge", () => {
  it("is green when every public agent matches", () => {
    expect(verifyBadge(["a", "b", "c"], [row("a", "match"), row("b", "match"), row("c", "no_history")], NOW)).toMatchObject({
      schemaVersion: 1,
      label: "replay-verified",
      message: "3/3 agents",
      color: "brightgreen",
    });
  });

  it("is red when one differs", () => {
    expect(verifyBadge(["a", "b"], [row("a", "match"), row("b", "differs")], NOW)).toMatchObject({ message: "1/2 agents", color: "red" });
  });

  it("is yellow, not green, while an agent has no fresh result", () => {
    expect(verifyBadge(["a", "b"], [row("a", "match")], NOW)).toMatchObject({ message: "1/2 agents", color: "yellow" });
    expect(verifyBadge(["a", "b"], [row("a", "match"), row("b", "match", VERIFY_STALE_SECONDS + 1)], NOW)).toMatchObject({ message: "1/2 agents", color: "yellow" });
  });

  it("ignores results of agents that are no longer public", () => {
    expect(verifyBadge(["a"], [row("a", "match"), row("gone", "differs")], NOW)).toMatchObject({ message: "1/1 agents", color: "brightgreen" });
  });
});
