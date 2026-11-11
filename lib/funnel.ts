/**
 * Activation funnel steps (2026-11-11): from opening the Studio to a launched agent. Sent from
 * the browser with track(), stored by /api/events in funnel_events.
 *
 *   studio_view      the Studio opened
 *   preset_pick      a "Start from" preset was picked (detail: its id)
 *   launch_click     Launch pressed with a valid form (detail: "logged_out" if a login comes first)
 *   login_ok         a login finished, anywhere on the site
 *   launch_ok        an agent was launched (detail: "paper" or "live")
 *   first_agent_cta  a first-agent button on the dashboard or Swap page was used (detail: where)
 */
export const FUNNEL_EVENTS = ["studio_view", "preset_pick", "launch_click", "login_ok", "launch_ok", "first_agent_cta"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

const VISITOR_KEY = "zolva_visitor";

/** A random id for this browser, kept in localStorage; a fresh one each time if storage is blocked. */
function visitorId(): string {
  const fresh = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  try {
    const stored = localStorage.getItem(VISITOR_KEY);
    if (stored && /^[0-9a-f]{32}$/.test(stored)) return stored;
    const id = fresh();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return fresh();
  }
}

/** Records one funnel step. Fire and forget: tracking never blocks or breaks the page. */
export function track(event: FunnelEvent, detail?: string): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ event, visitor: visitorId(), detail });
    // sendBeacon survives a page change (Launch navigates to the new agent right away).
    if (!navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Tracking is best effort.
  }
}
