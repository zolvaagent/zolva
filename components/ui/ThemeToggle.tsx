"use client";

import { useSyncExternalStore } from "react";

import { THEME_EVENT, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const ICONS: Record<Theme, string> = { light: "ph-sun", dark: "ph-moon" };
const LABELS: Record<Theme, string> = { light: "Light theme", dark: "Dark theme" };

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
}

/** Re-renders on every theme change (the toggle, or another tab saving a new choice). */
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY && (event.newValue === "light" || event.newValue === "dark")) applyTheme(event.newValue);
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const readTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** The theme on <html> right now ("light" while rendering on the server). */
export function useResolvedTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "light");
}

/**
 * Switches between light and dark and saves the choice. `switch` is the sidebar
 * version (sun, a switch, moon); `icon` is a round button for headers.
 */
export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "switch" }) {
  const theme = useResolvedTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";

  const toggle = () => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode): the switch still works on this page.
    }
    applyTheme(next);
  };

  const title = `Switch to ${LABELS[next].toLowerCase()}`;
  if (variant === "switch") {
    // A native button, so Enter and Space work; role="switch" makes screen readers say "on/off".
    return (
      <button className="theme-switch" type="button" role="switch" aria-checked={theme === "dark"} aria-label="Dark theme" title={title} onClick={toggle}>
        <i className={`ph ${ICONS.light}${theme === "light" ? " is-active" : ""}`} aria-hidden="true" />
        <span className="theme-switch__track" aria-hidden="true">
          <span className="theme-switch__knob" />
        </span>
        <i className={`ph ${ICONS.dark}${theme === "dark" ? " is-active" : ""}`} aria-hidden="true" />
      </button>
    );
  }
  return (
    <button className="theme-toggle" type="button" onClick={toggle} aria-label={title} title={title}>
      <i className={`ph ${ICONS[theme]}`} aria-hidden="true" />
    </button>
  );
}
