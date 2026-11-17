"use client";

import { useEffect, useState } from "react";

type Difference = { at: string; detail: string } | null;
type VerifyBody = {
  status: "match" | "differs" | "no_history";
  method: "hour_by_hour" | "cumulative";
  verifiedSince: string | null;
  hoursReplayed: number;
  hoursVerified: number;
  hoursDiffering: number;
  trades: { replay: number; recorded: number; matched: number };
  value: { replay: number; recorded: number; gapPct: number };
  firstDifference: Difference;
  lastDifference: Difference;
  unverifiable: { hours: number; hoursDiffering: number; firstDifference: Difference; lastDifference: Difference } | null;
  priceCorrections: { hours: number; recent: { at: string; market: string; then: number; now: number }[] };
};

const when = (iso: string) => `${new Date(iso).toUTCString().slice(5, 22)} UTC`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
/** Up to 4 significant digits, as the closes are shown elsewhere. */
const close = (value: number) => `$${Number(value.toPrecision(4))}`;

/** What the replay is doing, shown in turn while it runs (it takes a few seconds on older agents). */
const STEPS = ["Loading every hour this agent ran…", "Loading the prices it saw…", "Replaying each hour with the engine…", "Comparing every trade and its value…"];
const STEP_MS = 1800;

/**
 * "Verify this agent": asks the public API to replay the agent with Zolva's engine over every hour it ran
 * and compare each trade and its value with the record (lib/agents/verify.ts). Published paper agents only.
 */
export function VerifyAgent({ agentId }: { agentId: string }) {
  const [state, setState] = useState<{ busy: boolean; body: VerifyBody | null; error: string | null }>({ busy: false, body: null, error: null });
  const path = `/api/public/v1/agents/${agentId}/verify`;
  const [step, setStep] = useState(0);

  // Walk through the steps while the replay runs; stay on the last one if it takes longer.
  useEffect(() => {
    if (!state.busy) return;
    const timer = setInterval(() => setStep((current) => Math.min(current + 1, STEPS.length - 1)), STEP_MS);
    return () => clearInterval(timer);
  }, [state.busy]);

  const run = async () => {
    setStep(0);
    setState({ busy: true, body: null, error: null });
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(response.status === 404 ? "Only published paper agents can be verified." : `The check failed (${response.status}). Try again in a minute.`);
      setState({ busy: false, body: (await response.json()) as VerifyBody, error: null });
    } catch (cause) {
      setState({ busy: false, body: null, error: cause instanceof Error ? cause.message : "The check failed." });
    }
  };

  const body = state.body;
  const unverifiable = body?.unverifiable;
  const unchecked = unverifiable?.hoursDiffering ?? 0;
  const matching = body ? body.hoursReplayed - body.hoursDiffering - unchecked : 0;
  const corrected = body?.priceCorrections;
  const lastCorrection = corrected?.recent[corrected.recent.length - 1];
  return (
    <section className="verify-agent" aria-label="Verify this agent">
      <div className="verify-agent__head">
        <h3 className="verify-agent__title">Verify this agent</h3>
        <button className="button button--ghost button--small" type="button" onClick={run} disabled={state.busy}>
          <i className={`ph ${state.busy ? "ph-circle-notch verify-agent__spin" : "ph-seal-check"}`} aria-hidden="true" />
          {state.busy ? "Replaying…" : body ? "Run again" : "Replay with the engine"}
        </button>
      </div>
      <p className="verify-agent__lead">Replays every hour this agent ran with Zolva&apos;s open source engine, on the prices it saw, and checks each trade and its value against the record.</p>
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
        {state.error && <p className="field-error">{state.error}</p>}
        {body?.status === "match" && (
          <p className="verify-agent__result verify-agent__result--match">
            <i className="ph ph-check-circle" aria-hidden="true" />
            <span>
              {unchecked ? "Every hour that can be checked matches" : "Every hour matches"}: {matching} of {body.hoursReplayed} hours, {body.trades.matched} of {body.trades.recorded} trades.
            </span>
          </p>
        )}
        {body?.status === "differs" && (
          <>
            <p className="verify-agent__result verify-agent__result--differs">
              <i className="ph ph-warning-circle" aria-hidden="true" />
              <span>
                {matching} of {body.hoursReplayed} hours match. {body.hoursDiffering} differ
                {body.firstDifference && body.lastDifference && body.firstDifference.at !== body.lastDifference.at
                  ? `, between ${when(body.firstDifference.at)} and ${when(body.lastDifference.at)}`
                  : body.firstDifference
                    ? `, at ${when(body.firstDifference.at)}`
                    : ""}
                {body.method === "hour_by_hour" && body.lastDifference ? `. Every hour since then matches.` : "."}
              </span>
            </p>
            {body.firstDifference && <p className="verify-agent__detail">First difference: {body.firstDifference.detail}.</p>}
          </>
        )}
        {body && unverifiable && unchecked > 0 && (
          <p className="verify-agent__detail">
            {plural(unchecked, "hour")} ({when(unverifiable.firstDifference!.at)} to {when(unverifiable.lastDifference!.at)}) cannot be checked: their rules read closes that no decision stored (Zolva began
            storing the close each decision saw on 14 Nov), so a close corrected after the agent acted cannot be ruled out.
          </p>
        )}
        {body && body.status !== "no_history" && corrected && lastCorrection && (
          <p className="verify-agent__detail">
            In {plural(corrected.hours, "hour")} a close was corrected after the agent acted; the replay used the close it saw (latest: {lastCorrection.market} {close(lastCorrection.then)} then,{" "}
            {close(lastCorrection.now)} now, {when(lastCorrection.at)}).
          </p>
        )}
        {body?.status === "no_history" && <p className="verify-agent__result">This agent has not run yet. Check back after its first hour.</p>}
      </div>
      <p className="verify-agent__how">
        Check it yourself: <a href={path}>the JSON</a>, the engine in <a href="https://github.com/zolvaagent/zolva/blob/main/lib/engine/engine.ts">lib/engine/engine.ts</a>, or the MCP tool <code>verify_agent</code>.
      </p>
    </section>
  );
}
