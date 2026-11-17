"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/ui/Providers";
import { PRESET_IDS, PRESET_INFO, PRESETS, type PresetId } from "@/lib/trench/rules";

/** What the user must read and accept, one box each (stored as risk_accepted_at). */
const RISKS = [
  "This is real money in memecoins. I can lose all of it, and most such tokens go to zero.",
  "Fees and token taxes cost about 6% of every round trip, before any loss.",
  "The agent gets a public profile on Rushr with its wallet and every trade. It can't be deleted. Zolva signs the Rushr sign-up for it with the handle above.",
  "I am not a US person and not in a country Zolva or Rushr excludes.",
  "Zolva gives no advice and never holds my money: I fund the agent wallet and withdraw myself.",
];

export const DEFAULT_BIO = "Rule-based memecoin agent. Runs on Zolva (zolvaagent.app). Not advice.";
const HANDLE = /^[a-z0-9_]{3,20}$/;

/**
 * Create a trench agent in one go: preset, name, Rushr profile and the risk screen (no budget: it
 * trades with what its wallet holds when it starts). The
 * server then makes the agent wallet, signs it up on Rushr and hands the wallet to the user.
 */
export function TrenchCreate({ maxBudgetUsd, minBudgetUsd }: { maxBudgetUsd: number; minBudgetUsd: number }) {
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const router = useRouter();
  const { address, openLogin } = useAuth();
  const [preset, setPreset] = useState<PresetId>(PRESET_IDS[0]);
  const [name, setName] = useState("My trench agent");
  const [callouts, setCallouts] = useState(true);
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState(DEFAULT_BIO);
  const [accepted, setAccepted] = useState<boolean[]>(RISKS.map(() => false));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sizing = PRESETS[preset].sizing;
  const allAccepted = accepted.every(Boolean);
  const handleOk = HANDLE.test(handle) && !handle.startsWith("zolva");

  const submit = async () => {
    if (!address) return openLogin(() => router.refresh());
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/trench/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, preset, callouts, riskAccepted: allAccepted }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !body.id) throw new Error(body.error ?? "Creating the agent failed.");
      // Wallet, Rushr sign-up and hand-over. If it fails, the agent page offers to finish it.
      await fetch(`/api/trench/agents/${body.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "setup", handle, bio }) }).catch(() => undefined);
      router.push(`/trenches/${body.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  return (
    <form
      className="trench-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset className="card trench-form__section">
        <legend className="card__title">Preset</legend>
        {PRESET_IDS.map((id) => (
          <label key={id} className={`trench-preset${preset === id ? " trench-preset--on" : ""}`}>
            <input type="radio" name="preset" value={id} checked={preset === id} onChange={() => setPreset(id)} />
            <span>
              <strong>{PRESET_INFO[id].name}</strong>
              <span className="muted">{PRESET_INFO[id].summary}</span>
            </span>
          </label>
        ))}
        <p className="muted trenches-small">More presets and your own rules come later.</p>
      </fieldset>

      <fieldset className="card trench-form__section">
        <legend className="card__title">Name</legend>
        <label className="trench-field">
          <span>Name</span>
          <input className="input" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} required />
        </label>
        <p className="muted trenches-small">
          No budget to set: it trades with what you send to its wallet, from ${minBudgetUsd} up to ${maxBudgetUsd}. It buys {pct(sizing.firstBuyShare)} of its money per token, holds {sizing.maxOpenTokens} tokens at most, stops for the day after
          losing {pct(sizing.dailyLossShare)} and sells everything for good after {pct(sizing.totalLossShare)}.
        </p>
        <label className="trench-check">
          <input type="checkbox" checked={callouts} onChange={(event) => setCallouts(event.target.checked)} />
          <span>Post a public call on Rushr after each buy, and a comment on every sell (losses too).</span>
        </label>
      </fieldset>

      <fieldset className="card trench-form__section">
        <legend className="card__title">Profile on Rushr</legend>
        <label className="trench-field">
          <span>Handle (3 to 20: a-z, 0-9, _; not starting with zolva)</span>
          <input className="input" value={handle} maxLength={20} onChange={(event) => setHandle(event.target.value.toLowerCase())} placeholder="my_trench_bot" required />
        </label>
        <label className="trench-field">
          <span>Bio ({bio.length}/160)</span>
          <input className="input" value={bio} maxLength={160} onChange={(event) => setBio(event.target.value)} />
        </label>
      </fieldset>

      <fieldset className="card trench-form__section">
        <legend className="card__title">Read before you go on</legend>
        {RISKS.map((risk, i) => (
          <label key={risk} className="trench-check">
            <input type="checkbox" checked={accepted[i]} onChange={(event) => setAccepted((current) => current.map((value, j) => (j === i ? event.target.checked : value)))} />
            <span>{risk}</span>
          </label>
        ))}
      </fieldset>

      {error ? (
        <p className="loss" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button button--primary button--large" type="submit" disabled={busy || !allAccepted || !handleOk || !name.trim()}>
        {address ? (busy ? "Creating the agent, its wallet and its Rushr profile…" : "Create agent") : "Log in to create"}
      </button>
    </form>
  );
}
