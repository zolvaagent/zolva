/**
 * The call-only agent's texts and wallet policy (owner 2026-11-23): calls carry facts and the
 * project's own pitch, never exits, holdings, targets, hype or other tickers.
 */
import { describe, expect, it } from "vitest";

import { CALLOUT_MAX, callOnlyCallout, cleanPitch, exitSignalComment } from "./callouts.ts";
import { CHAIN_ID } from "./curve.ts";
import { callOnlyPolicyRules } from "./policy.ts";
import { parsePitch } from "./social.ts";

describe("call-only call", () => {
  it("matches the owner's example", () => {
    const text = callOnlyCallout({ symbol: "Intercept", pitch: "a risk firewall for trading agents, with a live dashboard already up", bonding: 0.63, devPct: 0.9, dexPaidMinutes: 11, caPostedByOwnX: true });
    expect(text).toBe("Zolva Lab signal on $Intercept. The pitch: a risk firewall for trading agents, with a live dashboard already up. Bonding 63%, dev 0.9%, DEX paid 11 min after launch, CA posted by their own X. Not advice.");
  });

  it("leaves out facts it doesn't have, and never mentions exits or holdings", () => {
    const text = callOnlyCallout({ symbol: "ABC", pitch: "pitched as a payments app for agents", bonding: 0.8, devPct: 2, dexPaidMinutes: null, caPostedByOwnX: false });
    expect(text).toBe("Zolva Lab signal on $ABC. The pitch: pitched as a payments app for agents. Bonding 80%, dev 2.0%. Not advice.");
    expect(text).not.toMatch(/exit|stop|position|watching|hold/i);
  });

  it("shortens only the pitch to fit Rushr's limit", () => {
    const text = callOnlyCallout({ symbol: "LONG", pitch: "word ".repeat(200).trim(), bonding: 0.7, devPct: 1, dexPaidMinutes: 5, caPostedByOwnX: true });
    expect(text.length).toBeLessThanOrEqual(CALLOUT_MAX);
    expect(text.endsWith("CA posted by their own X. Not advice.")).toBe(true);
  });
});

describe("cleanPitch", () => {
  it("keeps a plain pitch and lowercases its start", () => {
    expect(cleanPitch("Pitched as a risk firewall for trading agents.")).toBe("pitched as a risk firewall for trading agents");
  });

  it("refuses other tickers, prices, hype and links", () => {
    expect(cleanPitch("they say it is the next $PEPE for agents")).toBeNull();
    expect(cleanPitch("they target a 10m mcap by Friday")).toBeNull();
    expect(cleanPitch("they say it will moon with their agent tools")).toBeNull();
    expect(cleanPitch("pitched as a 100x AI agent launchpad")).toBeNull();
    expect(cleanPitch("they say it is huge, an agent launchpad 🚀")).toBeNull();
    expect(cleanPitch("short")).toBeNull();
    expect(cleanPitch("an agent wallet, see https://example.com for more")).toBe("an agent wallet, see for more");
  });
});

describe("parsePitch", () => {
  it("takes only a clear ok with a pitch", () => {
    expect(parsePitch('{"ok": true, "pitch": "pitched as an agent wallet"}')).toBe("pitched as an agent wallet");
    expect(parsePitch('{"ok": false, "pitch": ""}')).toBeNull();
    expect(parsePitch('{"ok": true}')).toBeNull();
    expect(parsePitch("I think it is a wallet")).toBeNull();
  });
});

describe("exit signal reply", () => {
  it("matches the owner's example", () => {
    expect(exitSignalComment({ exitKind: "trail", sharePct: 100, sinceCallPct: 18.2, peakPct: 31 })).toBe("Exit signal: trailing stop hit, +18% since call (peak +31%).");
  });

  it("says when it is partial, and drops the peak when it equals the exit", () => {
    expect(exitSignalComment({ exitKind: "ladder", sharePct: 50, sinceCallPct: 21, peakPct: 21 })).toBe("Partial exit signal (50%): profit taken, +21% since call.");
    expect(exitSignalComment({ exitKind: "stop", sharePct: 100, sinceCallPct: -15.4, peakPct: 4 })).toBe("Exit signal: stop loss hit, -15% since call (peak +4%).");
  });
});

describe("call-only wallet policy", () => {
  it("allows no transaction on Robinhood Chain or anywhere else", () => {
    const rules = callOnlyPolicyRules();
    expect(rules).toHaveLength(1);
    for (const rule of rules) {
      expect(rule.conditions).toContainEqual({ field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: "0" });
      expect(JSON.stringify(rule)).not.toContain(String(CHAIN_ID));
    }
  });
});
