"use client";

import { useEffect, useSyncExternalStore } from "react";

import { THEME_EVENT, THEME_STORAGE_KEY, type Theme, type ThemeChoice } from "@/lib/theme";

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const ICONS: Record<ThemeChoice, string> = { system: "ph-desktop", light: "ph-sun", dark: "ph-moon" };
const LABELS: Record<ThemeChoice, string> = { system: "System theme", light: "Light theme", dark: "Dark theme" };

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function applyTheme(choice: ThemeChoice) {
  const theme: Theme = choice === "system" ? (window.matchMedia(DARK_QUERY).matches ? "dark" : "light") : choice;
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
}

/** Re-renders on every theme change (toggle, or another tab changing the saved choice). */
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyTheme(readChoice());
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
 * Cycles System → Light → Dark. `row` is the sidebar version with a text
 * label; `icon` is a round button for headers.
 */
export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "row" }) {
  // "system" on the server and during hydration, then the saved choice.
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as const);

  // In system mode, follow the OS when it switches (sunset schedules and the like).
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onSystemChange = () => readChoice() === "system" && applyTheme("system");
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  const cycle = () => {
    const next = NEXT[choice];
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode): the switch still works on this page.
    }
    applyTheme(next);
  };

  const title = `${LABELS[choice]}. Switch to ${LABELS[NEXT[choice]].toLowerCase()}`;
  if (variant === "row") {
    return (
      <button className="app-link theme-toggle-row" type="button" onClick={cycle} title={title}>
        <i className={`ph ${ICONS[choice]}`} aria-hidden="true" />
        {LABELS[choice]}
      </button>
    );
  }
  return (
    <button className="theme-toggle" type="button" onClick={cycle} aria-label={title} title={title}>
      <i className={`ph ${ICONS[choice]}`} aria-hidden="true" />
    </button>
  );
}
