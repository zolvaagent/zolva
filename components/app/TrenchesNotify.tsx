"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/ui/Providers";

type State = "idle" | "saving" | "listed" | "error";

/** "Notify me" for the Trenches page: logs in if needed, then adds the wallet to the notify list. */
export function TrenchesNotify() {
  const { address, openLogin } = useAuth();
  const [state, setState] = useState<State>("idle");

  // A returning, signed-in visitor sees that they are already on the list.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetch("/api/trenches/notify")
      .then((response) => (response.ok ? (response.json() as Promise<{ listed?: boolean }>) : null))
      .then((body) => {
        if (!cancelled && body?.listed) setState("listed");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  const join = async () => {
    setState("saving");
    try {
      const response = await fetch("/api/trenches/notify", { method: "POST" });
      setState(response.ok ? "listed" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "listed") {
    return (
      <p className="muted" role="status">
        <i className="ph ph-check-circle gain" aria-hidden="true" /> You&apos;re on the list. We&apos;ll tell you when trench agents open.
      </p>
    );
  }

  return (
    <div>
      <button className="button button--primary" type="button" disabled={state === "saving"} onClick={() => (address ? void join() : openLogin(() => void join()))}>
        <i className="ph ph-bell" aria-hidden="true" />
        {state === "saving" ? "Adding you…" : "Notify me when it opens"}
      </button>
      {state === "error" ? (
        <p className="loss" role="alert">
          Could not add you. Try again.
        </p>
      ) : null}
    </div>
  );
}
