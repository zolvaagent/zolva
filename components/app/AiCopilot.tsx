"use client";

import { Select, type SelectOption } from "@/components/ui/Select";
import { AI_MODELS, formatCredits, monthlyEstimateUsd, TIER_LABELS } from "@/lib/ai/models";

export type CreditsView = { freeUsd: number; paidUsd: number } | null;

/** Select needs a string value; "off" stands for no co-pilot. */
const OFF = "off";

/**
 * Studio section: pick an AI co-pilot model for the agent, or none.
 * Lite models run on the free welcome credits; others need paid credits,
 * and top-up is not open yet, so they stay locked until an account has some.
 */
export function AiCopilotPicker({ value, onChange, credits }: { value: string | null; onChange: (model: string | null) => void; credits: CreditsView }) {
  const hasPaid = (credits?.paidUsd ?? 0) > 0;
  const options: SelectOption<string>[] = [
    { value: OFF, label: "Off, rules decide alone", meta: "Free" },
    ...AI_MODELS.map((model) => {
      const locked = model.tier !== "lite" && !hasPaid;
      const monthly = formatCredits(monthlyEstimateUsd(model));
      return {
        value: model.id,
        label: model.label,
        icon: model.logo,
        // "< $0.01" already says "about"; only round numbers get the ≈.
        meta: `${monthly.startsWith("<") ? "" : "≈ "}${monthly}/mo`,
        disabled: locked,
        group: `${TIER_LABELS[model.tier]} · ${model.tier === "lite" ? "free credits" : "paid credits"}`,
      };
    }),
  ];

  return (
    <div className="form-section">
      <div className="form-section__label" id="ai-label">
        AI co-pilot <span className="form-section__hint">Optional</span>
      </div>
      <p className="ai-intro">
        When your rules want to buy or sell, the AI reads the same numbers and approves or passes, with a reason you can read. Stop losses always run, and the backtest shows
        your rules alone.
      </p>

      <Select variant="block" label="AI co-pilot model" value={value ?? OFF} options={options} onChange={(next) => onChange(next === OFF ? null : next)} />

      <div className="ai-credits">
        <i className="ph ph-coins" aria-hidden="true" />
        {credits ? (
          <span>
            <strong>{formatCredits(credits.freeUsd)}</strong> free (Lite) · <strong>{formatCredits(credits.paidUsd)}</strong> paid
          </span>
        ) : (
          <span>New accounts get $0.50 of free AI credits for Lite models.</span>
        )}
        <span className="pill pill--accent">Top up soon</span>
      </div>
      <p className="note" style={{ margin: 0 }}>
        Estimates assume about 30 reviews a month. When credits run out, the agent keeps trading on its rules.
      </p>
    </div>
  );
}
