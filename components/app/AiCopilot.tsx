"use client";

import { Select, type SelectOption } from "@/components/ui/Select";
import { AI_EXPIRY_DAYS } from "@/lib/ai/limits";
import { AI_MODELS, aiModel, formatCredits, isLite, monthlyEstimateUsd, TIER_LABELS } from "@/lib/ai/models";

export type CreditsView = { freeUsd: number; paidUsd: number } | null;

/** The AI budget as edited in a form: the limit stays a string while typing. */
export type LimitDraft = { usd: string; days: number };

const EXPIRY_LABELS: Record<number, string> = { 7: "7 days", 30: "30 days", 90: "90 days", 365: "1 year" };
const EXPIRY_OPTIONS: SelectOption<number>[] = AI_EXPIRY_DAYS.map((days) => ({ value: days, label: EXPIRY_LABELS[days] }));

/** Credits a model can draw on: Lite models use free credits first, others only paid. */
export const usableCreditsUsd = (credits: CreditsView, modelId: string) => (credits ? (isLite(modelId) ? credits.freeUsd + credits.paidUsd : credits.paidUsd) : 0);

/**
 * The most the co-pilot may spend on one agent, and for how long. Used in the
 * Studio and in the agent page's edit dialog. A limit above the balance is
 * fine: it is a cap, nothing is reserved.
 */
export function AiLimitFields({ value, onChange, modelId, credits, error }: { value: LimitDraft; onChange: (value: LimitDraft) => void; modelId: string; credits: CreditsView; error?: string | null }) {
  const balance = usableCreditsUsd(credits, modelId);
  const limit = Number(value.usd);
  return (
    <div className="ai-limit">
      <div className="ai-limit__row">
        <label className="ai-limit__field">
          <span className="ai-limit__label">AI limit</span>
          <span className="ai-limit__money">
            <span aria-hidden="true">$</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min={0.01}
              max={1000}
              step={0.05}
              value={value.usd}
              aria-invalid={Boolean(error) || undefined}
              onChange={(event) => onChange({ ...value, usd: event.target.value })}
            />
          </span>
        </label>
        <div className="ai-limit__field">
          <span className="ai-limit__label">Lasts</span>
          <Select label="How long the AI limit lasts" value={value.days} options={EXPIRY_OPTIONS} onChange={(days) => onChange({ ...value, days })} />
        </div>
      </div>
      {error ? (
        <p className="field-error">{error}</p>
      ) : (
        <p className="note" style={{ margin: 0 }}>
          The co-pilot stops at the limit, at the end date, or when your credits run out, whichever comes first. The agent keeps trading on its rules.
          {credits && limit > balance && ` Your balance for this model is ${formatCredits(balance)}, so that runs out first.`}
        </p>
      )}
    </div>
  );
}

/** Select needs a string value; "off" stands for no co-pilot. */
const OFF = "off";

/**
 * Studio section: pick an AI co-pilot model for the agent, or none.
 * Lite models run on the free welcome credits; others need paid credits,
 * and top-up is not open yet, so they stay locked until an account has some.
 */
export function AiCopilotPicker({
  value,
  onChange,
  credits,
  limit,
  onLimitChange,
  limitError,
}: {
  value: string | null;
  onChange: (model: string | null) => void;
  credits: CreditsView;
  limit: LimitDraft;
  onLimitChange: (limit: LimitDraft) => void;
  limitError?: string | null;
}) {
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
      {value && aiModel(value) && <AiLimitFields value={limit} onChange={onLimitChange} modelId={value} credits={credits} error={limitError} />}

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
        Estimates assume about 30 reviews a month.
      </p>
    </div>
  );
}
