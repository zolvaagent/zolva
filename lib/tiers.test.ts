import { describe, expect, it } from "vitest";

import { GRACE_DAYS, holdingsUsd, linkWalletMessage, nextMembership, tierForUsd, TIERS } from "./tiers";

const DAY = 86_400;

describe("tierForUsd", () => {
  it("maps holdings to the highest tier they reach", () => {
    expect(tierForUsd(0)).toBe("free");
    expect(tierForUsd(24.99)).toBe("free");
    expect(tierForUsd(25)).toBe("holder");
    expect(tierForUsd(149.99)).toBe("holder");
    expect(tierForUsd(150)).toBe("pro");
    expect(tierForUsd(10_000)).toBe("pro");
  });

  it("only ever raises limits", () => {
    expect(TIERS.holder.activeAgents).toBeGreaterThan(TIERS.free.activeAgents);
    expect(TIERS.pro.freeAiAgents).toBeGreaterThan(TIERS.holder.freeAiAgents);
    expect(TIERS.free.freeAiAgents).toBe(0);
  });
});

describe("nextMembership", () => {
  const now = 1_800_000_000;

  it("moves up at once and clears any grace period", () => {
    expect(nextMembership({ tier: "free", graceUntil: null }, "pro", now)).toEqual({ tier: "pro", graceUntil: null });
    expect(nextMembership({ tier: "holder", graceUntil: now + DAY }, "holder", now)).toEqual({ tier: "holder", graceUntil: null });
  });

  it("keeps the tier for the grace period after holdings drop", () => {
    const first = nextMembership({ tier: "pro", graceUntil: null }, "holder", now);
    expect(first).toEqual({ tier: "pro", graceUntil: now + GRACE_DAYS * DAY });
    // A later read inside the grace period keeps the same deadline.
    expect(nextMembership(first, "free", now + DAY)).toEqual(first);
  });

  it("drops once the grace period has passed", () => {
    const grace = { tier: "pro" as const, graceUntil: now + GRACE_DAYS * DAY };
    expect(nextMembership(grace, "holder", now + GRACE_DAYS * DAY)).toEqual({ tier: "holder", graceUntil: null });
  });
});

describe("holdingsUsd", () => {
  it("values a raw balance at the average price", () => {
    expect(holdingsUsd(1_500_000_000_000_000_000_000n, 18, 0.02)).toBeCloseTo(30);
    expect(holdingsUsd(123_456n, 6, 2)).toBeCloseTo(0.246912);
  });

  it("is zero without a price", () => {
    expect(holdingsUsd(10n ** 24n, 18, null)).toBe(0);
    expect(holdingsUsd(10n ** 24n, 18, 0)).toBe(0);
  });
});

describe("linkWalletMessage", () => {
  it("names both addresses in lowercase and the nonce", () => {
    const message = linkWalletMessage("0xABCdef0000000000000000000000000000000001", "0xAAA0000000000000000000000000000000000002", "n0nce123");
    expect(message).toContain("Wallet: 0xabcdef0000000000000000000000000000000001");
    expect(message).toContain("Account: 0xaaa0000000000000000000000000000000000002");
    expect(message).toContain("Nonce: n0nce123");
  });
});
