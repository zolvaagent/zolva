"use client";

import { useState } from "react";

import { useAuth } from "@/components/ui/Providers";
import { GENERATIONS_PER_DAY, PROMPT_MAX_LENGTH, PROMPT_MIN_LENGTH } from "@/lib/ai/strategy-writer";
import type { Rules } from "@/lib/engine/rules";

export type CustomMode = "rules" | "prompt";

export type Generated = { prompt: string; summary: string; notes: string };

const PLACEHOLDER = "Buy big tech stocks after a sharp drop, when the price is unusually low for the last two days. Sell once it recovers to its average, or after 3 days. Be careful with buys outside US market hours.";

/**
 * Custom strategy, step one: build the rules by hand, or describe the idea
 * in plain words and let the AI strategy writer turn it into rules. The
 * generated rules land in the normal rule builder below, editable and
 * backtested like any other.
 */
export function PromptWriter({
  mode,
  onModeChange,
  generated,
  onGenerated,
  hasCredits,
  copilotOn,
}: {
  mode: CustomMode;
  onModeChange: (mode: CustomMode) => void;
  generated: Generated | null;
  onGenerated: (result: Generated & { rules: Rules; costUsd: number }) => void;
  hasCredits: boolean;
  copilotOn: boolean;
}) {
  const { address, openLogin } = useAuth();
  const [prompt, setPrompt] = useState(generated?.prompt ?? "");
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const length = prompt.trim().length;
  const tooShort = length < PROMPT_MIN_LENGTH;

  const generate = async () => {
    if (!address) {
      openLogin();
      return;
    }
    setState({ busy: true, error: null });
    const response = await fetch("/api/strategy/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.trim() }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { rules?: Rules; notes?: string; summary?: string; costUsd?: number; error?: string } | null;
    if (!response?.ok || !body?.rules) {
      setState({ busy: false, error: body?.error ?? "The AI did not answer. Please try again." });
      return;
    }
    setState({ busy: false, error: null });
    onGenerated({ prompt: prompt.trim(), rules: body.rules, summary: body.summary ?? "", notes: body.notes ?? "", costUsd: body.costUsd ?? 0 });
  };

  return (
    <div className="form-section">
      <div className="form-section__label">
        How do you want to build it?
      </div>
      <div className="tabs" role="tablist" aria-label="Build mode" style={{ width: "fit-content" }}>
        <button className="tab" type="button" role="tab" aria-selected={mode === "rules"} onClick={() => onModeChange("rules")}>
          <i className="ph ph-sliders-horizontal" aria-hidden="true" /> Rules
        </button>
        <button className="tab" type="button" role="tab" aria-selected={mode === "prompt"} onClick={() => onModeChange("prompt")}>
          <i className="ph ph-sparkle" aria-hidden="true" /> Prompt
        </button>
      </div>

      {mode === "prompt" && (
        <div className="prompt-writer">
          <label className="sr-only" htmlFor="strategy-prompt">
            Describe your strategy
          </label>
          <textarea
            id="strategy-prompt"
            className="input prompt-writer__input"
            rows={4}
            maxLength={PROMPT_MAX_LENGTH}
            placeholder={PLACEHOLDER}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <div className="prompt-writer__bar">
            <span className="prompt-writer__hint">
              {length}/{PROMPT_MAX_LENGTH} · under $0.01 of AI credits per try, {GENERATIONS_PER_DAY} a day
            </span>
            <button className="button button--primary" type="button" disabled={state.busy || tooShort || (Boolean(address) && !hasCredits)} onClick={generate}>
              <i className={`ph ${state.busy ? "ph-circle-notch prompt-writer__spin" : "ph-sparkle"}`} aria-hidden="true" />
              {state.busy ? "Writing rules" : generated ? "Generate again" : "Generate rules"}
            </button>
          </div>
          {address && !hasCredits && <p className="field-error">You are out of AI credits. Build your rules by hand instead.</p>}
          {state.error && (
            <p className="field-error" role="alert">
              {state.error}
            </p>
          )}

          {generated && !state.busy && (
            <div className="prompt-writer__result" aria-live="polite">
              <p>
                <i className="ph ph-check-circle" aria-hidden="true" /> {generated.summary || "Rules are ready below."} Check them below and edit anything you like; the backtest updates live.
              </p>
              {generated.notes && (
                <p className="prompt-writer__notes">
                  <strong>For the AI co-pilot:</strong> {generated.notes}
                  {!copilotOn && " Turn on the AI co-pilot below so it follows this on live trades."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
