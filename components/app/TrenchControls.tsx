"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "setup" | "active" | "paused" | "halted" | "closed";

/**
 * The run controls in the agent page header: Start / Resume (main), Pause buying (amber: exits keep
 * running) and Sell everything and stop (red: sells every token on the next minute, never buys again).
 */
export function TrenchControls({ agentId, status, setupDone }: { agentId: string; status: Status; setupDone: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const step = async (name: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(name);
    setError(null);
    try {
      const response = await fetch(`/api/trench/agents/${agentId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: name }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "That did not work. Please try again.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="trench-controls">
      <div className="trench-controls__buttons">
        {status === "setup" || status === "paused" ? (
          <button className="button button--primary" type="button" disabled={Boolean(busy) || !setupDone} onClick={() => void step(status === "setup" ? "start" : "resume")}>
            <i className="ph ph-play" aria-hidden="true" />
            {busy === "start" || busy === "resume" ? "Starting…" : status === "setup" ? "Start trading" : "Resume buying"}
          </button>
        ) : null}
        {status === "active" ? (
          <button className="button trench-controls__pause" type="button" disabled={Boolean(busy)} onClick={() => void step("pause")}>
            <i className="ph ph-pause" aria-hidden="true" />
            {busy === "pause" ? "Pausing…" : "Pause buying"}
          </button>
        ) : null}
        {status === "active" || status === "paused" ? (
          <button
            className="button trench-controls__stop"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void step("sell_all", "Sell every token this agent holds on the next minute and stop it for good? It can't be restarted.")}
          >
            <i className="ph ph-stop-circle" aria-hidden="true" />
            {busy === "sell_all" ? "Stopping…" : "Sell everything & stop"}
          </button>
        ) : null}
      </div>
      {status === "active" ? <p className="trench-controls__hint">Pause stops new buys; stops and sells keep running.</p> : null}
      {error ? (
        <p className="loss" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
