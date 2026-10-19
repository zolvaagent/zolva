import type { CSSProperties, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { C, cardShadow, ease, fontFamily } from "./theme";

/** 0 to 1 over `duration` frames starting at `start`, with the site ease. */
export function useProgress(start: number, duration: number) {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, start + duration], [0, 1], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

/**
 * Headline that reveals word by word (blur to sharp, rising slightly).
 * Words wrapped in *stars* get the accent colour, like "Nobody can *watch* them all."
 */
export function Headline({ text, start, size = 76, color = C.text, accent = C.purple, align = "left", stagger = 4, style }: {
  text: string;
  start: number;
  size?: number;
  color?: string;
  accent?: string;
  align?: "left" | "center";
  stagger?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  // *Marked phrases* may span several words.
  let inAccent = false;
  const words = text.split(" ").map((raw) => {
    if (raw.startsWith("*")) inAccent = true;
    const word = { text: raw.replace(/\*/g, ""), accent: inAccent };
    if (raw.replace(/[.,!?]+$/, "").endsWith("*")) inAccent = false;
    return word;
  });
  return (
    <div style={{ fontFamily, fontSize: size, lineHeight: 1.08, fontWeight: 600, letterSpacing: "-0.035em", color, textAlign: align, ...style }}>
      {words.map(({ text: word, accent: isAccent }, i) => {
        const p = interpolate(frame, [start + i * stagger, start + i * stagger + 18], [0, 1], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.24em",
              opacity: p,
              filter: `blur(${(1 - p) * 10}px)`,
              transform: `translateY(${(1 - p) * 18}px)`,
              color: isAccent ? accent : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

/** A white card like the site's .card. */
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 28, boxShadow: cardShadow, fontFamily, color: C.text, ...style }}>
      {children}
    </div>
  );
}

export function Pill({ children, bg, color, style }: { children: ReactNode; bg: string; color: string; style?: CSSProperties }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 999, background: bg, color, fontSize: 22, fontWeight: 600, fontFamily, ...style }}>
      {children}
    </span>
  );
}

/** Fades and lifts a block in at `start`. */
export function Rise({ start, children, distance = 28, duration = 24, style }: { start: number; children: ReactNode; distance?: number; duration?: number; style?: CSSProperties }) {
  const p = useProgress(start, duration);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * distance}px)`, ...style }}>{children}</div>;
}

/** Text that types itself, with a soft caret while typing. */
export function Typed({ text, start, perFrame = 1.6, caret = true, style }: { text: string; start: number; perFrame?: number; caret?: boolean; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const count = Math.max(0, Math.min(text.length, Math.floor((frame - start) * perFrame)));
  const typing = count > 0 && count < text.length;
  const blinkOn = Math.floor(frame / 15) % 2 === 0;
  return (
    <span style={style}>
      {text.slice(0, count)}
      {caret && (typing || (count === text.length && blinkOn)) && <span style={{ display: "inline-block", width: "0.08em", height: "1em", marginLeft: 2, background: C.purple, verticalAlign: "-0.12em" }} />}
    </span>
  );
}

/** Deterministic pseudo random number in [0, 1) for index i. */
export const rand = (i: number, seed = 1) => {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
