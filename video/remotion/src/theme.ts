import { Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

// Same tokens as the website (app/globals.css).
export const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600"] });

export const C = {
  dark: "#121116",
  light: "#fafaf9",
  card: "#ffffff",
  border: "#f1f1f0",
  borderStrong: "#e1e1e0",
  text: "#252228",
  muted: "rgba(37, 34, 40, 0.62)",
  faint: "#8f8e8e",
  onDark: "#f6f7f4",
  onDarkMuted: "rgba(246, 247, 244, 0.6)",
  purple: "#8075ff",
  lavender: "#9896ff",
  lavenderSoft: "#e5e5ff",
  gain: "#0a9a4c",
  gainSoft: "#e6f8ee",
  loss: "#e5484d",
  warn: "#c96a00",
  warnSoft: "#fff1e0",
};

/** The site's "heavy" ease: fast start, long soft landing. */
export const ease = Easing.bezier(0.32, 0.72, 0, 1);

export const cardShadow = "0 1px 2px rgba(37, 34, 40, 0.05), 0 24px 60px -24px rgba(37, 34, 40, 0.22)";
