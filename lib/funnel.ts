/**
 * Activation funnel steps (2026-11-11): from opening the Studio to a launched agent, stored in
 * funnel_events.
 *
 *   studio_view      the Studio opened
 *   preset_pick      a "Start from" preset was picked (detail: its id)
 *   launch_click     Launch pressed with a valid form (detail: "logged_out" if a login comes first)
 *   login_ok         a login finished, anywhere on the site (detail: "wallet" or "privy")
 *   login_dismiss    the login window was closed without a login (detail: where it opened and
 *                    the option tried, e.g. "studio privy")
 *   launch_ok        an agent was launched (detail: "paper" or "live")
 *   first_agent_cta  a first-agent button on the dashboard or Swap page was used (detail: where)
 *
 * login_ok and launch_ok are recorded on the server (lib/funnel-server.ts) by the routes that do
 * the work, because ad and tracker blockers stop some browsers from sending any event: on
 * 2026-11-12, 4 of 14 real launches had no event at all. The others are sent from the browser
 * with track() to /api/events. The visitor id is also kept in a cookie so the server events carry
 * the same id as the browser ones.
 */
export const FUNNEL_EVENTS = ["studio_view", "preset_pick", "launch_click", "login_ok", "login_dismiss", "launch_ok", "first_agent_cta"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** Events the browser may send to /api/events; the rest come from the server only. */
export const BROWSER_EVENTS: readonly FunnelEvent[] = ["studio_view", "preset_pick", "launch_click", "login_dismiss", "first_agent_cta"];

export const VISITOR_KEY = "zolva_visitor";
export const VISITOR_PATTERN = /^[0-9a-f]{32}$/;
/** Same rule as the funnel_events.detail column and /api/events. */
export const DETAIL_PATTERN = /^[\w .-]{1,64}$/;

/** A random id for this browser, kept in localStorage and a cookie; a fresh one each time if storage is blocked. */
function visitorId(): string {
  const fresh = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let id: string;
  try {
    const stored = localStorage.getItem(VISITOR_KEY);
    id = stored && VISITOR_PATTERN.test(stored) ? stored : fresh();
    if (id !== stored) localStorage.setItem(VISITOR_KEY, id);
  } catch {
    id = fresh();
  }
  try {
    // Read by the server-side events (login, launch). One year, first party only.
    if (!document.cookie.includes(`${VISITOR_KEY}=${id}`)) document.cookie = `${VISITOR_KEY}=${id}; path=/; max-age=31536000; samesite=lax; secure`;
  } catch {
    // Cookies blocked: the server events get a fresh id instead.
  }
  return id;
}

/** Records one browser funnel step. Fire and forget: tracking never blocks or breaks the page. */
export function track(event: FunnelEvent, detail?: string): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ event, visitor: visitorId(), detail });
    // sendBeacon survives a page change.
    if (!navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Tracking is best effort.
  }
}
