/**
 * Light and dark theme. The toggle saves "light" or "dark" in localStorage per
 * browser; a first visit with nothing saved starts from the operating system's
 * setting. The theme lives on <html data-theme>, which app/globals.css reads.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "zolva-theme";

/** Fired on window after the theme changes, so islands (Privy) can follow. */
export const THEME_EVENT = "zolva-theme-change";

/**
 * Runs in <head> before the page paints, so a dark page never flashes white.
 * Kept tiny and dependency free; any storage error falls back to the system theme.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement,c;try{c=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}var dark=c==="dark"||(c!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);d.dataset.theme=dark?"dark":"light"})();`;
