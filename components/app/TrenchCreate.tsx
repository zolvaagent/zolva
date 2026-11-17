"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/ui/Providers";
import { EDITABLE_FIELDS, parseTrenchRules, PRESET_IDS, PRESET_INFO, PRESETS, type EditableField, type PresetId, type TrenchRules } from "@/lib/trench/rules";

/** What the user must read and accept, one box each (stored as risk_accepted_at). */
const RISKS = [
  "This is real money in memecoins. I can lose all of it, and most such tokens go to zero.",
  "Fees and token taxes cost about 3% on each buy and each sell, before any loss.",
  "The agent gets a public profile on Rushr with its wallet and every trade. It can't be deleted. Zolva signs the Rushr sign-up for it with the handle above.",
  "I am not a US person and not in a country Zolva or Rushr excludes.",
  "Zolva gives no advice and never holds my money: I fund the agent wallet and withdraw myself.",
];

export const DEFAULT_BIO = "Rule-based memecoin agent. Runs on Zolva (zolvaagent.app). Not advice.";
const HANDLE = /^[a-z0-9_]{3,20}$/;

/** A field's value as shown in the form (0.35 -> 35). */
function shown(rules: TrenchRules, field: EditableField): number {
  const value = (rules[field.group] as Record<string, unknown>)[field.key];
  return Math.round(Number(value) * field.scale * 100) / 100;
}

/** The preset with the edited fields applied, in stored units, then parsed and clamped like the server does. */
function editedRules(preset: PresetId, edits: Record<string, number>, requireX: boolean | null): TrenchRules {
  const base = JSON.parse(JSON.stringify(PRESETS[preset])) as TrenchRules;
  if (requireX !== null) base.entry.requireSocial = requireX;
  for (const field of EDITABLE_FIELDS) {
    const value = edits[`${field.group}.${field.key}`];
    if (value === undefined || !Number.isFinite(value)) continue;
    (base[field.group] as Record<string, unknown>)[field.key] = value / field.scale;
  }
  return parseTrenchRules(base, preset);
}

/**
 * Create a trench agent in one go: preset (optionally edited as your own rules), name, Rushr
 * profile and the risk screen. No budget: it trades with what its wallet holds when it starts. The
 * server then makes the agent wallet, signs it up on Rushr and hands the wallet to the user.
 */
export function TrenchCreate({ maxBudgetUsd, minBudgetUsd }: { maxBudgetUsd: number; minBudgetUsd: number }) {
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const router = useRouter();
  const { address, openLogin } = useAuth();
  const [preset, setPreset] = useState<PresetId>(PRESET_IDS[0]);
  const [edits, setEdits] = useState<Record<string, number>>({});
  // null: as the preset has it. Off lets a curve agent buy without the X and narrative checks.
  const [requireX, setRequireX] = useState<boolean | null>(null);
  const [name, setName] = useState("My trench agent");
  const [callouts, setCallouts] = useState(true);
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState(DEFAULT_BIO);
  const [accepted, setAccepted] = useState<boolean[]>(RISKS.map(() => false));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = editedRules(preset, edits, requireX);
  const custom = Object.keys(edits).length > 0 || (requireX !== null && requireX !== PRESETS[preset].entry.requireSocial);
  const sizing = rules.sizing;
  const fields = EDITABLE_FIELDS.filter((field) => field.markets.includes(rules.market));
  const allAccepted = accepted.every(Boolean);
  const handleOk = HANDLE.test(handle) && !handle.startsWith("zolva");

  const pickPreset = (id: PresetId) => {
    setPreset(id);
    setEdits({});
    setRequireX(null);
  };

  const submit = async () => {
    if (!address) return openLogin(() => router.refresh());
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/trench/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, preset, rules: custom ? rules : undefined, callouts, riskAccepted: allAccepted }),
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
        <legend className="card__title">Strategy</legend>
        {PRESET_IDS.map((id) => (
          <label key={id} className={`trench-preset${preset === id ? " trench-preset--on" : ""}`}>
            <input type="radio" name="preset" value={id} checked={preset === id} onChange={() => pickPreset(id)} />
            <span className="trench-preset__icon" aria-hidden="true">
              <i className={`ph ph-${PRESET_INFO[id].icon}`} />
            </span>
            <span>
              <strong>{PRESET_INFO[id].name}</strong>
              <span className="muted">{PRESET_INFO[id].summary}</span>
            </span>
          </label>
        ))}

        <details className="trench-custom">
          <summary>
            <i className="ph ph-sliders-horizontal" aria-hidden="true" /> Your own rules{custom ? <span className="trench-pill trench-pill--custom">Custom</span> : null}
          </summary>
          <p className="muted trenches-small">
            Change {PRESET_INFO[preset].name}&apos;s numbers. The stop loss, Rushr&apos;s safety check, the slippage cap and the money caps stay on whatever you set. A custom agent says &quot;Custom rules&quot; on Rushr.
          </p>
          {PRESETS[preset].entry.requireSocial ? (
            <label className="trench-check trench-custom__toggle">
              <input type="checkbox" checked={rules.entry.requireSocial} onChange={(event) => setRequireX(event.target.checked)} />
              <span>
                <strong>Require X checks</strong>
                <span className="muted">
                  {" "}
                  The project&apos;s X account must have a blue check and a website, post its own contract address, and pass an AI check that it is more than a joke. Off: it can buy even when X can&apos;t be read, with
                  looser filtering.
                </span>
              </span>
            </label>
          ) : null}
          {(["entry", "exit", "sizing"] as const).map((group) => (
            <div key={group} className="trench-custom__group">
              <h3>{group === "entry" ? "Buys when" : group === "exit" ? "Sells" : "Sizing"}</h3>
              <div className="trench-custom__grid">
                {fields
                  .filter((field) => field.group === group)
                  .map((field) => {
                    const id = `${field.group}.${field.key}`;
                    return (
                      <label key={id} className="trench-field">
                        <span>{field.label}</span>
                        <span className="trench-custom__input">
                          {field.unit === "$" ? <span className="muted">$</span> : null}
                          <input
                            className="input"
                            type="number"
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            value={edits[id] ?? shown(rules, field)}
                            onChange={(event) => setEdits((current) => ({ ...current, [id]: Number(event.target.value) }))}
                          />
                          {field.unit && field.unit !== "$" ? <span className="muted">{field.unit}</span> : null}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>
          ))}
          {custom ? (
            <button
              className="button button--ghost button--small"
              type="button"
              onClick={() => {
                setEdits({});
                setRequireX(null);
              }}
            >
              Back to {PRESET_INFO[preset].name}
            </button>
          ) : null}
        </details>
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
