"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/ui/Providers";
import { usd } from "@/lib/format";
import { limitsFor, PRESET_IDS, PRESET_INFO, PRESETS, type PresetId } from "@/lib/trench/rules";

/** What the user must read and accept, one box each (stored as risk_accepted_at). */
const RISKS = [
  "This is real money in memecoins. I can lose all of it, and most such tokens go to zero.",
  "Fees and token taxes cost about 6% of every round trip, before any loss.",
  "The agent gets a public profile on Rushr with its wallet and every trade. It can't be deleted.",
  "I am not a US person and not in a country Zolva or Rushr excludes.",
  "Zolva gives no advice and never holds my money: I fund the agent wallet and withdraw myself.",
];

/** Create a trench agent: preset, name, budget, callouts and the risk screen. */
export function TrenchCreate({ maxBudgetUsd, minBudgetUsd }: { maxBudgetUsd: number; minBudgetUsd: number }) {
  const router = useRouter();
  const { address, openLogin } = useAuth();
  const [preset, setPreset] = useState<PresetId>(PRESET_IDS[0]);
  const [name, setName] = useState("My trench agent");
  const [budget, setBudget] = useState(Math.min(50, maxBudgetUsd));
  const [callouts, setCallouts] = useState(true);
  const [accepted, setAccepted] = useState<boolean[]>(RISKS.map(() => false));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limits = limitsFor(PRESETS[preset], budget);
  const allAccepted = accepted.every(Boolean);
  const budgetOk = budget >= minBudgetUsd && budget <= maxBudgetUsd;

  const submit = async () => {
    if (!address) return openLogin(() => router.refresh());
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/trench/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, preset, budgetUsd: budget, callouts, riskAccepted: allAccepted }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !body.id) throw new Error(body.error ?? "Creating the agent failed.");
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
        <legend className="card__title">Name and budget</legend>
        <label className="trench-field">
          <span>Name</span>
          <input className="input" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="trench-field">
          <span>Budget (USD of ETH you will send to the agent wallet)</span>
          <input className="input" type="number" min={minBudgetUsd} max={maxBudgetUsd} step={5} value={budget} onChange={(event) => setBudget(Number(event.target.value))} />
        </label>
        <p className="muted trenches-small">
          With {usd(budget)}: first buy {usd(limits.firstBuyUsd)}, one add of {usd(limits.addUsd)}, at most {usd(limits.maxPerTokenUsd)} per token and {limits.maxOpenTokens} tokens at once. It stops buying for
          the day after {usd(limits.dailyLossUsd)} of losses and sells everything for good after {usd(limits.totalLossUsd)}.
        </p>
        <label className="trench-check">
          <input type="checkbox" checked={callouts} onChange={(event) => setCallouts(event.target.checked)} />
          <span>Post a public call on Rushr after each buy, and a comment on every sell (losses too).</span>
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
      <button className="button button--primary button--large" type="submit" disabled={busy || !allAccepted || !budgetOk || !name.trim()}>
        {address ? (busy ? "Creating…" : "Create agent") : "Log in to create"}
      </button>
    </form>
  );
}
