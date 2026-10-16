"use client";

import { AI_MODELS, formatCredits, monthlyEstimateUsd, TIER_LABELS, type AiTier } from "@/lib/ai/models";

export type CreditsView = { freeUsd: number; paidUsd: number } | null;

const TIERS: AiTier[] = ["lite", "standard", "pro", "max"];

/**
 * Studio section: pick an AI co-pilot model for the agent, or none.
 * Lite models run on the free welcome credits; others need paid credits,
 * and top-up is not open yet, so they stay locked until an account has some.
 */
export function AiCopilotPicker({ value, onChange, credits }: { value: string | null; onChange: (model: string | null) => void; credits: CreditsView }) {
  const hasPaid = (credits?.paidUsd ?? 0) > 0;
  return (
    <div className="form-section" role="radiogroup" aria-labelledby="ai-label">
      <div className="form-section__label" id="ai-label">
        AI co-pilot <span className="form-section__hint">Optional</span>
      </div>
      <p className="ai-intro">
        When your rules want to buy or sell, the AI reads the same numbers and approves or passes, with a reason you can read. Stop losses always run. The backtest shows your rules
        alone; the AI only acts on live hours.
      </p>

      <div className="ai-credits">
        <i className="ph ph-coins" aria-hidden="true" />
        {credits ? (
          <span>
            Your AI credits: <strong>{formatCredits(credits.freeUsd)}</strong> free (Lite models) · <strong>{formatCredits(credits.paidUsd)}</strong> paid
          </span>
        ) : (
          <span>New accounts get $0.50 of free AI credits for Lite models.</span>
        )}
        <span className="pill pill--accent">Top up soon</span>
      </div>

      <div className="ai-models">
        <label className="ai-model">
          <input type="radio" name="ai-model" checked={value === null} onChange={() => onChange(null)} />
          <span className="ai-model__name">
            <strong>Off</strong>
            <span>Rules decide alone</span>
          </span>
          <span className="ai-model__cost">Free</span>
        </label>
        {TIERS.map((tier) => (
          <div key={tier} className="ai-tier">
            <span className="ai-tier__label">{TIER_LABELS[tier]}</span>
            {AI_MODELS.filter((model) => model.tier === tier).map((model) => {
              const locked = tier !== "lite" && !hasPaid;
              return (
                <label key={model.id} className="ai-model" aria-disabled={locked || undefined}>
                  <input type="radio" name="ai-model" checked={value === model.id} disabled={locked} onChange={() => onChange(model.id)} />
                  <span className="ai-model__name">
                    <strong>{model.label}</strong>
                    <span>{tier === "lite" ? "Free credits work" : locked ? "Needs paid credits" : "Paid credits"}</span>
                  </span>
                  <span className="ai-model__cost">≈ {formatCredits(monthlyEstimateUsd(model))}/mo</span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
      <p className="note" style={{ margin: 0 }}>
        Estimates assume about 30 reviews a month (one each time your rules want to trade). When credits run out, the agent keeps trading on its rules.
      </p>
    </div>
  );
}
