/**
 * Q1 video for X (quote of @RobinhoodCrypto "100 days"). 25 s, 1920x1080, music only.
 * Style follows the website: warm white canvas, lavender accent, dark panels,
 * Inter, soft cards; motion is eased, never shaken.
 * Facts shown: 190+ stock tokens (from the quoted post); backtest numbers from the
 * Studio on 2026-10-19 (NVDA, mean reversion, last 30 days); the GME decision is a
 * real one from 2026-10-18 16:00 UTC where the AI co-pilot passed.
 */
import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";

import { Card, Headline, Pill, rand, Rise, Typed, useProgress } from "./parts";
import { C, ease, fontFamily } from "./theme";

export const Q1_FRAMES = 750;

const SCENES = { intro: [0, 135], watch: [130, 145], build: [270, 125], test: [390, 125], why: [510, 155], outro: [660, 90] } as const;

const TICKERS = "NVDA TSLA AAPL META GOOGL AMZN MSFT SPY QQQ PLTR MU TSM GME AMC COIN MSTR CRCL RDDT BABA USO GLD SPCX NFLX AMD HOOD INTC UBER SHOP ARM AVGO".split(" ");

export function Q1() {
  return (
    <AbsoluteFill style={{ background: C.light, fontFamily }}>
      <Audio
        src={staticFile("music-lyria.wav")}
        volume={(f) => interpolate(f, [0, 20, Q1_FRAMES - 40, Q1_FRAMES], [0, 0.85, 0.85, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      />
      <Sequence from={SCENES.watch[0]} durationInFrames={SCENES.watch[1]}>
        <LightScene duration={SCENES.watch[1]} fadeIn={false}>
          <Watch />
        </LightScene>
      </Sequence>
      <Sequence from={SCENES.build[0]} durationInFrames={SCENES.build[1]}>
        <LightScene duration={SCENES.build[1]}>
          <Build />
        </LightScene>
      </Sequence>
      <Sequence from={SCENES.test[0]} durationInFrames={SCENES.test[1]}>
        <LightScene duration={SCENES.test[1]}>
          <Test />
        </LightScene>
      </Sequence>
      <Sequence from={SCENES.why[0]} durationInFrames={SCENES.why[1]}>
        <LightScene duration={SCENES.why[1]} fadeOut={false}>
          <Why />
        </LightScene>
      </Sequence>
      {/* Dark scenes sit on top: the intro hands over with a white circle, the outro grows a dark one. */}
      <Sequence from={SCENES.intro[0]} durationInFrames={SCENES.intro[1]}>
        <Intro />
      </Sequence>
      <Sequence from={SCENES.outro[0]} durationInFrames={SCENES.outro[1]}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
}

/** Light scenes cross fade with a small lift. */
export function LightScene({ children, duration, fadeIn = true, fadeOut = true }: { children: ReactNode; duration: number; fadeIn?: boolean; fadeOut?: boolean }) {
  const frame = useCurrentFrame();
  const inP = fadeIn ? interpolate(frame, [0, 14], [0, 1], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const outP = fadeOut ? interpolate(frame, [duration - 12, duration], [1, 0], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  return (
    <AbsoluteFill style={{ background: C.light, opacity: Math.min(inP, outP), transform: `translateY(${(1 - inP) * 24 - (1 - outP) * 24}px)` }}>
      <DotGrid color="rgba(37, 34, 40, 0.07)" />
      {children}
    </AbsoluteFill>
  );
}

export function DotGrid({ color }: { color: string }) {
  return <AbsoluteFill style={{ backgroundImage: `radial-gradient(${color} 1.2px, transparent 1.6px)`, backgroundSize: "28px 28px" }} />;
}

/** Ticker symbols drifting like particles; `gather` (0 to 1) pulls them into the centre. */
function TickerField({ gather = 0, opacity = 1 }: { gather?: number; opacity?: number }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity }}>
      {Array.from({ length: 190 }, (_, i) => {
        const x0 = rand(i, 1) * 1920;
        const y0 = rand(i, 2) * 1080;
        const drift = Math.sin(frame / 50 + rand(i, 3) * 6) * 14;
        const x = x0 + drift + (960 - x0) * gather;
        const y = y0 - frame * (0.15 + rand(i, 4) * 0.25) + (540 - y0) * gather;
        const a = (0.12 + rand(i, 5) * 0.4) * (1 - gather * 0.9);
        return (
          <span key={i} style={{ position: "absolute", left: x, top: y, color: rand(i, 6) > 0.85 ? C.lavender : C.onDark, opacity: a, fontSize: 15 + Math.round(rand(i, 7) * 10), fontWeight: 500, fontFamily, letterSpacing: "0.04em" }}>
            {TICKERS[i % TICKERS.length]}
          </span>
        );
      })}
    </AbsoluteFill>
  );
}

function Intro() {
  const frame = useCurrentFrame();
  const gather = interpolate(frame, [82, 112], [0, 1], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const orb = interpolate(frame, [96, 116], [0, 1], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const textOut = interpolate(frame, [80, 96], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const reveal = interpolate(frame, [114, 135], [0, 1], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.dark }}>
      <AbsoluteFill style={{ background: "radial-gradient(60% 55% at 50% 45%, rgba(128, 117, 255, 0.28), transparent 70%)" }} />
      <TickerField gather={gather} />
      <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(18, 17, 22, ${0.92 * textOut}) 0%, rgba(18, 17, 22, ${0.75 * textOut}) 45%, transparent 75%)` }} />
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 160, opacity: textOut }}>
        <Headline text="190+ stock tokens." start={10} size={96} color={C.onDark} accent={C.lavender} />
        <Headline text="Trading *24/7.*" start={34} size={96} color={C.onDark} accent={C.lavender} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Img src={staticFile("orb.png")} style={{ width: 260, height: 260, opacity: orb, transform: `scale(${0.4 + orb * 0.6})`, filter: "drop-shadow(0 30px 60px rgba(128, 117, 255, 0.55))" }} />
      </AbsoluteFill>
      {/* The light canvas opens from the orb. */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 2400 * reveal, height: 2400 * reveal, borderRadius: "50%", background: C.light, opacity: reveal > 0 ? 1 : 0 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Watch() {
  const frame = useCurrentFrame();
  const first = interpolate(frame, [70, 82], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scan = interpolate(frame, [88, 132], [-1, 20], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const orb = useProgress(80, 22);
  const cols = 19;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 140, top: 400, width: 760 }}>
        <div style={{ opacity: first, position: "absolute" }}>
          <Headline text="Nobody can *watch* them all." start={8} size={84} />
        </div>
        {frame >= 80 && <Headline text="An agent *can.*" start={82} size={84} />}
      </div>
      <div style={{ position: "absolute", left: 1000, top: 330, display: "grid", gridTemplateColumns: `repeat(${cols}, 34px)`, gap: 8 }}>
        {Array.from({ length: 190 }, (_, i) => {
          const col = i % cols;
          const appear = interpolate(frame, [4 + col * 1.2, 20 + col * 1.2], [0, 1], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          // Each square pulses smoothly, like a price ticking up or down.
          const pulse = Math.max(0, Math.sin((frame + rand(i, 8) * 90) / 9)) ** 6;
          const up = rand(i, 9) > 0.45;
          const watched = scan > col;
          const base = watched ? "rgba(152, 150, 255, 0.22)" : C.border;
          const tint = up ? `rgba(10, 154, 76, ${0.15 + pulse * 0.75})` : `rgba(229, 72, 77, ${0.15 + pulse * 0.75})`;
          return (
            <div
              key={i}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: pulse > 0.05 ? tint : base,
                outline: watched && Math.abs(scan - col) < 1.2 ? `2px solid ${C.purple}` : "none",
                opacity: appear,
                transform: `scale(${0.6 + appear * 0.4})`,
              }}
            />
          );
        })}
      </div>
      <Img
        src={staticFile("orb-look-right.png")}
        style={{ position: "absolute", left: 850, top: 105, width: 190, height: 190, opacity: orb, transform: `translateY(${(1 - orb) * 30}px)`, filter: "drop-shadow(0 20px 40px rgba(128, 117, 255, 0.45))" }}
      />
    </AbsoluteFill>
  );
}

function Build() {
  const press = interpolate(useCurrentFrame(), [58, 62, 68], [1, 0.96, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const chips = ["Buy when 48h z score is below −2", "Sell when price is above the 48h average", "Exit after 72 hours at most"];
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ marginTop: 150 }}>
        <Headline text="Build one in *plain words.*" start={6} size={80} align="center" />
      </div>
      <Rise start={12} style={{ marginTop: 56 }}>
        <Card style={{ width: 1280, padding: "40px 48px" }}>
          <Pill bg={C.lavenderSoft} color={C.purple}>✦ Prompt</Pill>
          <div style={{ marginTop: 24, minHeight: 116, fontSize: 42, lineHeight: "58px", color: C.text }}>
            <Typed text="Buy big tech after a sharp drop. Sell when it recovers, or after 3 days." start={22} perFrame={2.1} />
          </div>
          <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
            <span style={{ transform: `scale(${press})`, display: "inline-flex", padding: "14px 26px", borderRadius: 999, background: C.text, color: "#fff", fontSize: 24, fontWeight: 600 }}>✦ Generate rules</span>
          </div>
        </Card>
      </Rise>
      <div style={{ display: "flex", gap: 18, marginTop: 34 }}>
        {chips.map((chip, i) => (
          <Rise key={chip} start={70 + i * 7} distance={20}>
            <span style={{ display: "inline-flex", padding: "16px 24px", borderRadius: 999, background: "#fff", border: `1px solid ${C.lavender}`, color: C.text, fontSize: 28, fontWeight: 500, boxShadow: "0 12px 30px -16px rgba(128, 117, 255, 0.6)" }}>
              {chip}
            </span>
          </Rise>
        ))}
      </div>
    </AbsoluteFill>
  );
}

/** Smooth illustrative series that end at the real totals (agent −0.7%, holding −2.7%). */
function series(seed: number, end: number, points = 60) {
  return Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    const wave = Math.sin(t * 7 + seed) * 0.9 + Math.sin(t * 17 + seed * 2) * 0.35;
    return end * t + wave * (seed === 1 ? 0.35 : 1) * Math.sin(Math.PI * t);
  });
}

function Test() {
  const frame = useCurrentFrame();
  const draw = useProgress(18, 48);
  const count = useProgress(40, 40);
  const W = 1144;
  const H = 320;
  const toPath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${(i / (values.length - 1)) * W},${H / 2 - v * 40}`).join(" ");
  const agent = toPath(series(1, -0.7));
  const hold = toPath(series(4, -2.7));
  const stat = (label: string, value: string, color: string) => (
    <div style={{ flex: 1, padding: "20px 24px", borderRadius: 20, background: C.light }}>
      <div style={{ fontSize: 24, color: C.faint }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 48, fontWeight: 600, color }}>{value}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ marginTop: 130 }}>
        <Headline text="Test it *before* it trades." start={6} size={80} align="center" />
      </div>
      <Rise start={10} style={{ marginTop: 50 }}>
        <Card style={{ width: 1240, padding: "34px 48px 40px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: C.faint }}>
            <span>Backtest · NVDA · Mean reversion · last 30 days</span>
            <span style={{ display: "flex", gap: 22 }}>
              <span style={{ color: C.purple }}>━ Your agent</span>
              <span>┅ Holding</span>
            </span>
          </div>
          <svg width={W} height={H} style={{ marginTop: 18, overflow: "visible" }}>
            <defs>
              <clipPath id="reveal">
                <rect x={-10} y={-40} width={(W + 20) * draw} height={H + 80} />
              </clipPath>
            </defs>
            <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke={C.border} strokeWidth={2} />
            <g clipPath="url(#reveal)">
              <path d={hold} fill="none" stroke="#b9b8b8" strokeWidth={4} strokeDasharray="10 10" />
              <path d={agent} fill="none" stroke={C.purple} strokeWidth={6} strokeLinecap="round" />
            </g>
          </svg>
          <div style={{ display: "flex", gap: 16, marginTop: 20, opacity: interpolate(frame, [36, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            {stat("Your agent", `−${(0.7 * count).toFixed(1)}%`, C.text)}
            {stat("Holding instead", `−${(2.7 * count).toFixed(1)}%`, C.text)}
            {stat("Versus holding", `+${(2.0 * count).toFixed(1)} pts`, C.gain)}
          </div>
        </Card>
      </Rise>
    </AbsoluteFill>
  );
}

function Why() {
  const frame = useCurrentFrame();
  const flow = frame * 1.4;
  const orb = useProgress(52, 20);
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ marginTop: 130 }}>
        <Headline text="Read *why* it made every move." start={6} size={80} align="center" />
      </div>
      <div style={{ position: "relative", width: 1300, height: 560, marginTop: 40 }}>
        <Rise start={16} style={{ position: "absolute", left: 40, top: 30 }}>
          <Card style={{ width: 660, padding: "34px 40px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 20, color: C.faint, fontWeight: 500, letterSpacing: "0.06em" }}>RULE SIGNAL</span>
              <Pill bg={C.gainSoft} color={C.gain}>BUY</Pill>
            </div>
            <div style={{ marginTop: 14, fontSize: 52, fontWeight: 600, letterSpacing: "-0.02em" }}>GME</div>
            <div style={{ marginTop: 6, fontSize: 30, color: C.muted }}>Near its 3 day low, RSI crosses above 30.</div>
          </Card>
        </Rise>
        {/* Dotted line from the rule to the AI review, flowing. */}
        <svg width={260} height={140} style={{ position: "absolute", left: 330, top: 230, opacity: interpolate(frame, [30, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <path d="M10,0 C10,90 120,70 250,130" fill="none" stroke={C.lavender} strokeWidth={4} strokeLinecap="round" strokeDasharray="2 14" strokeDashoffset={-flow} />
        </svg>
        <Rise start={40} style={{ position: "absolute", left: 560, top: 290 }}>
          <Card style={{ width: 760, padding: "34px 40px", border: `2px solid ${C.lavender}`, boxShadow: "0 30px 70px -28px rgba(128, 117, 255, 0.6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 20, color: C.faint, fontWeight: 500, letterSpacing: "0.06em" }}>AI CO-PILOT</span>
              <Pill bg={C.warnSoft} color={C.warn}>PASSED</Pill>
            </div>
            <div style={{ marginTop: 16, minHeight: 116, fontSize: 40, lineHeight: "56px", fontWeight: 500 }}>
              <Typed text={"“Not a clear higher-low bounce. Looks like a falling knife.”"} start={56} perFrame={1.5} />
            </div>
            <div style={{ marginTop: 12, fontSize: 21, color: C.faint, opacity: interpolate(frame, [104, 118], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              DeepSeek V4.1 Flash · Oct 18, 16:00 UTC · paper trading
            </div>
          </Card>
        </Rise>
        <Img
          src={staticFile(frame > 120 && frame < 128 ? "orb-blink.png" : "orb-look-left.png")}
          style={{ position: "absolute", left: 1150, top: 170, width: 150, height: 150, opacity: orb, transform: `translateY(${(1 - orb) * 24}px)`, filter: "drop-shadow(0 18px 36px rgba(128, 117, 255, 0.45))" }}
        />
      </div>
    </AbsoluteFill>
  );
}

function Outro() {
  const frame = useCurrentFrame();
  const cover = interpolate(frame, [0, 22], [0, 1], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const orb = useProgress(10, 22);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", width: 2400 * cover, height: 2400 * cover, borderRadius: "50%", background: C.dark }} />
      <AbsoluteFill style={{ opacity: cover }}>
        <AbsoluteFill style={{ background: "radial-gradient(55% 50% at 50% 40%, rgba(128, 117, 255, 0.3), transparent 70%)" }} />
        <TickerField opacity={0.35} />
        <AbsoluteFill style={{ background: "radial-gradient(42% 46% at 50% 52%, rgba(18, 17, 22, 0.95), rgba(18, 17, 22, 0.6) 60%, transparent 100%)" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 20 }}>
        <Img src={staticFile("orb.png")} style={{ width: 190, height: 190, opacity: orb, transform: `scale(${0.7 + orb * 0.3})`, filter: "drop-shadow(0 30px 60px rgba(128, 117, 255, 0.55))" }} />
        <Headline text="Zolva" start={18} size={128} color={C.onDark} align="center" />
        <Headline text="Trading agents that *show their work.*" start={28} size={44} color={C.onDarkMuted} accent={C.lavender} align="center" stagger={3} style={{ fontWeight: 500, letterSpacing: "-0.02em" }} />
        <Rise start={44} distance={16} style={{ marginTop: 16 }}>
          <span style={{ display: "inline-flex", padding: "14px 30px", borderRadius: 999, border: "1px solid rgba(152, 150, 255, 0.5)", background: "rgba(255, 255, 255, 0.04)", color: "#d0ceff", fontSize: 32, fontWeight: 500 }}>
            <Typed text="zolvaagent.app" start={48} perFrame={0.8} />
          </span>
        </Rise>
        <Rise start={64} distance={12} style={{ marginTop: 10 }}>
          <span style={{ color: C.onDarkMuted, fontSize: 24 }}>Paper trading · No code · Onchain prices</span>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
