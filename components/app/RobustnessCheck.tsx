"use client";

import { useEffect, useState } from "react";

import { percent, tone } from "@/lib/format";
import type { Rules } from "@/lib/engine/rules";
import type { MonthResult, RobustnessReport } from "@/lib/studio/robustness";

/** The Studio settings the check runs on: the same body shape as agent creation. */
export type RobustnessSettings = {
  strategy: string;
  rules?: Rules;
  venue: "spot" | "perps";
  /** Picked markets by token address. */
  tokens: string[];
  maxPositionPct: number;
  stopLossPct: number;
};

type Ready = Extract<RobustnessReport, { ok: true }>;

/** What the check is doing, shown in turn while it runs. */
const STEPS = ["Loading every hour of history…", "Running your rules month by month…", "Running again at double costs…", "Trying markets you didn't pick…"];
const STEP_MS = 1500;

const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * "Check robustness" under the Studio's 30 day backtest: the same agent on all the history Zolva
 * has, month by month, at double costs and on markets the user did not pick
 * (lib/studio/robustness.ts, run on the server by /api/studio/robustness).
 */
export function RobustnessCheck({ settings }: { settings: RobustnessSettings }) {
  const key = JSON.stringify(settings);
  const [state, setState] = useState<{ busy: boolean; key: string | null; report: Ready | null; error: string | null }>({ busy: false, key: null, report: null, error: null });
  const [step, setStep] = useState(0);

  // Walk through the steps while the check runs; stay on the last one if it takes longer.
  useEffect(() => {
    if (!state.busy) return;
    const timer = setInterval(() => setStep((current) => Math.min(current + 1, STEPS.length - 1)), STEP_MS);
    return () => clearInterval(timer);
  }, [state.busy]);

  const run = async () => {
    setStep(0);
    setState({ busy: true, key, report: null, error: null });
    try {
      const response = await fetch("/api/studio/robustness", { method: "POST", headers: { "Content-Type": "application/json" }, body: key });
      const body = (await response.json().catch(() => null)) as (Ready & { error?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.error ?? `The check failed (${response.status}). Try again in a minute.`);
      setState({ busy: false, key, report: body, error: null });
    } catch (cause) {
      setState({ busy: false, key, report: null, error: cause instanceof Error ? cause.message : "The check failed." });
    }
  };

  // A result belongs to the settings it ran on; any change asks for a new run.
  const stale = state.key !== null && state.key !== key && !state.busy;
  const report = stale ? null : state.report;
  const error = stale ? null : state.error;
  return (
    <section className="robustness" aria-label="Robustness check">
      <div className="robustness__head">
        <h3 className="robustness__title">Is it more than one lucky month?</h3>
        <button className="button button--ghost button--small" type="button" onClick={run} disabled={state.busy}>
          <i className={`ph ${state.busy ? "ph-circle-notch verify-agent__spin" : "ph-shield-check"}`} aria-hidden="true" />
          {state.busy ? "Checking…" : report ? "Check again" : "Check robustness"}
        </button>
      </div>
      {!report && !state.busy && (
        <p className="robustness__lead">
          {stale ? "Your settings changed since the last check. Run it again." : "Runs these rules on all the history Zolva has, month by month, at double costs, and on markets you didn't pick."}
        </p>
      )}
      <div aria-live="polite">
        {state.busy && (
          <div className="verify-agent__loading" role="status">
            <div className="verify-agent__bar" aria-hidden="true">
              <span />
            </div>
            <p className="verify-agent__step" key={step}>
              {STEPS[step]}
            </p>
          </div>
        )}
        {error && <p className="field-error">{error}</p>}
        {report && <RobustnessResult report={report} />}
      </div>
    </section>
  );
}

function RobustnessResult({ report }: { report: Ready }) {
  return (
    <div className="robustness__result">
      <ul className="robustness__summary">
        {report.summary.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="table-wrap">
        <table className="table table--compact">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col" className="num">
                Your agent
              </th>
              <th scope="col" className="num">
                Holding
              </th>
            </tr>
          </thead>
          <tbody>
            {report.months.map((month: MonthResult) => (
              <tr key={month.month}>
                <td>
                  {monthName(month.month)}
                  {month.days < 28 && <span className="robustness__days"> ({month.days} days)</span>}
                </td>
                <td className={`num ${tone(month.returnPct)}`}>{percent(month.returnPct)}</td>
                <td className="num">{percent(month.holdPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="robustness__lead">Each month is one continuous run, so a position can carry from one month into the next. Past results do not predict future ones.</p>
    </div>
  );
}
