/**
 * "Crypto is live" video, version 2 (2026-10-27). 16 s, 1920x1080, music only.
 * Cut to the beat: the Lyria track runs at 120 BPM, so a beat is 15 frames and
 * a bar 60 frames; every scene starts on a bar line and every pop on a beat.
 * Facts shown (all real, from the database):
 * - ETH hourly closes, every 2nd hour, Oct 20 12:00 to Oct 27 08:00 UTC.
 * - Three real decisions by Zolva Lab crypto agents on ETH: Mean Reversion bought
 *   Oct 24 14:00 at $2,339.20 (z −3.01); RSI Dip bought Oct 24 15:00 at $2,303.28
 *   (24h RSI 27) and sold Oct 25 15:00 at $2,341.27 (24h RSI 61): +1.6% on price.
 */
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";

import { CoinAvatar } from "./CryptoLive";
import { Headline, Pill, Rise, Typed, useProgress } from "./parts";
import { C, cardShadow, ease, fontFamily } from "./theme";

export const CRYPTO_BEAT_FRAMES = 480;

const BEAT = 15;
const BAR = 60;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** ETH closes every 2 hours from Oct 20 12:00 UTC (index 0) to Oct 27 08:00 UTC. */
const ETH = [
  2395.49, 2468.08, 2450.89, 2436.91, 2446.05, 2455.61, 2452.43, 2447.42, 2441.07, 2439.51, 2453.94, 2456.08, 2465.21, 2492.27, 2510.38, 2500.74, 2492.29, 2486.25, 2475.37, 2437.68,
  2444.36, 2432.8, 2408.41, 2404.84, 2400.83, 2406.84, 2381.3, 2382.59, 2376.48, 2382.49, 2392.02, 2411.27, 2391.31, 2406.66, 2404.8, 2394.52, 2399.94, 2408.94, 2407.74, 2400.83,
  2401.83, 2359.97, 2370.43, 2381.35, 2381.71, 2373.79, 2368.21, 2367.01, 2366.29, 2339.2, 2315.64, 2335.45, 2345.39, 2342, 2359.51, 2363.59, 2366.27, 2337.72, 2332.26, 2322,
  2330.39, 2338.79, 2353.75, 2352.33, 2344.34, 2339.26, 2326.79, 2301.81, 2318.56, 2317.2, 2322.3, 2324.92, 2320.6, 2323.37, 2317.91, 2310.94, 2302.57, 2309.99, 2323.02, 2309.77,
];
const START_MS = Date.UTC(2026, 9, 20, 12);

/** The line's points: every 2nd hour, plus the two odd hours where trades happened, so their dots sit on the line. */
const LINE = [
  ...ETH.map((price, index) => ({ at: index, price })),
  { at: 49.5, price: 2303.28 },
  { at: 61.5, price: 2341.27 },
].sort((a, b) => a.at - b.at);

/** The three decisions, placed by hour (index in 2 hour steps, so .5 is an odd hour). */
const DECISIONS = [
  { at: 49, price: 2339.2, side: "BUY", agent: "Mean Reversion", reason: "Unusually far below its 48h average (z −3.01)", beat: 1, card: { left: 120, top: 330 } },
  { at: 49.5, price: 2303.28, side: "BUY", agent: "RSI Dip", reason: "24h RSI 27, below 30. Buying the dip.", beat: 3, card: { left: 690, top: 330 } },
  { at: 61.5, price: 2341.27, side: "SELL", agent: "RSI Dip", reason: "24h RSI 61, above 55. Taking the rebound.", beat: 5, card: { left: 1260, top: 330 } },
] as const;

const SCENES = { night: [0, 2 * BAR], log: [2 * BAR, 2 * BAR], mix: [4 * BAR, 2 * BAR], outro: [6 * BAR, 2 * BAR] } as const;

export function CryptoBeat() {
  return (
    <AbsoluteFill style={{ background: C.dark, fontFamily }}>
      <Audio src={staticFile("music-crypto-beat.wav")} volume={(f) => interpolate(f, [0, 6, CRYPTO_BEAT_FRAMES - 30, CRYPTO_BEAT_FRAMES], [0, 0.9, 0.9, 0], clamp)} />
      <Sequence from={SCENES.night[0]} durationInFrames={SCENES.night[1] + SCENES.log[1]}>
        <ChartScenes />
      </Sequence>
      <Sequence from={SCENES.mix[0]} durationInFrames={SCENES.mix[1]}>
        <Mix />
      </Sequence>
      <Sequence from={SCENES.outro[0]} durationInFrames={SCENES.outro[1]}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
}

/** A soft lavender glow that breathes on every beat (no movement, only light). */
function BeatGlow({ strength = 1 }: { strength?: number }) {
  const frame = useCurrentFrame();
  const pulse = Math.exp(-((frame % BEAT) / 5));
  return <AbsoluteFill style={{ background: `radial-gradient(60% 55% at 50% 60%, rgba(128, 117, 255, ${(0.14 + pulse * 0.1) * strength}), transparent 70%)` }} />;
}

const W = 1920;
const H = 1080;
/** Chart geometry for the zoom: `from`/`to` are the visible index range, `min`/`max` the price range. */
function project(index: number, price: number, from: number, to: number, min = 2290, max = 2520) {
  const left = 120;
  const right = W - 120;
  const top = 360;
  const bottom = H - 140;
  return { x: left + ((index - from) / (to - from)) * (right - left), y: bottom - ((price - min) / (max - min)) * (bottom - top) };
}

const hourLabel = (index: number) => {
  const date = new Date(START_MS + index * 2 * 3600 * 1000);
  return `${date.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${String(date.getUTCHours()).padStart(2, "0")}:00 UTC`;
};

/** Bars 1 and 2: the line draws across the night. Bars 3 and 4: it zooms to the trades and they pop on the beat. */
function ChartScenes() {
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [4, 2 * BAR - 6], [0, 1], { ...clamp, easing: ease });
  const zoom = interpolate(frame, [2 * BAR, 2 * BAR + 24], [0, 1], { ...clamp, easing: ease });
  const from = interpolate(zoom, [0, 1], [0, 44]);
  const to = interpolate(zoom, [0, 1], [ETH.length - 1, 66]);
  // The zoomed window only spans about $100, so the price axis tightens with it.
  const min = interpolate(zoom, [0, 1], [2290, 2290]);
  const max = interpolate(zoom, [0, 1], [2520, 2400]);
  const shown = Math.max(1, Math.floor(draw * (ETH.length - 1)));
  const points = LINE.filter((point) => point.at <= shown).map((point) => project(point.at, point.price, from, to, min, max));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const head = points[points.length - 1];
  const nightText = interpolate(frame, [2 * BAR - 10, 2 * BAR], [1, 0], clamp);
  const logText = frame >= 2 * BAR;

  return (
    <AbsoluteFill>
      <BeatGlow />
      {/* Hour grid */}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1={120} x2={W - 120} y1={360 + i * 82} y2={360 + i * 82} stroke="rgba(255, 255, 255, 0.05)" strokeWidth={1} />
        ))}
        <defs>
          <linearGradient id="eth-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(152, 150, 255, 0.28)" />
            <stop offset="100%" stopColor="rgba(152, 150, 255, 0)" />
          </linearGradient>
          <clipPath id="plot">
            <rect x={110} y={300} width={W - 220} height={H - 420} />
          </clipPath>
        </defs>
        <g clipPath="url(#plot)">
          <path d={`${path} L${head.x},${H - 140} L${points[0].x},${H - 140} Z`} fill="url(#eth-fill)" />
          <path d={path} fill="none" stroke={C.lavender} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
        </g>
        {!logText && <circle cx={head.x} cy={head.y} r={10} fill="#fff" style={{ filter: "drop-shadow(0 0 14px rgba(152, 150, 255, 0.9))" }} />}
      </svg>

      {/* Header: coin and the hour the line has reached */}
      <div style={{ position: "absolute", left: 120, top: 96, display: "flex", alignItems: "center", gap: 18 }}>
        <CoinAvatar coin="ETH" size={56} />
        <span style={{ color: C.onDark, fontSize: 34, fontWeight: 600 }}>ETH</span>
        <span style={{ color: C.onDarkMuted, fontSize: 26 }}>hourly, onchain</span>
      </div>
      <div style={{ position: "absolute", right: 120, top: 104, color: C.onDark, fontSize: 30, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
        {hourLabel(logText ? 61.5 : shown)}
      </div>

      {/* Bars 1 and 2 headline */}
      <div style={{ position: "absolute", left: 120, top: 190, opacity: nightText }}>
        <Headline text="Crypto never *sleeps.*" start={6} size={92} color={C.onDark} accent={C.lavender} />
      </div>
      {frame >= BAR && (
        <div style={{ position: "absolute", right: 120, top: 210, opacity: nightText }}>
          <Headline text="Neither does your *agent.*" start={BAR} size={52} color={C.onDarkMuted} accent={C.lavender} stagger={3} style={{ fontWeight: 500 }} />
        </div>
      )}

      {/* Bars 3 and 4: the agents' real decisions pop in on the beat */}
      {logText && (
        <div style={{ position: "absolute", left: 120, top: 190 }}>
          <Headline text="Every move, *explained.*" start={2 * BAR + 2} size={80} color={C.onDark} accent={C.lavender} />
        </div>
      )}
      {logText &&
        DECISIONS.map((decision, i) => {
          const start = 2 * BAR + 24 + decision.beat * BEAT - BEAT;
          const pop = interpolate(frame, [start, start + 10], [0, 1], { ...clamp, easing: ease });
          const point = project(decision.at, decision.price, from, to, min, max);
          const buy = decision.side === "BUY";
          const color = buy ? "#2fcf78" : "#ff7a45";
          const cardLeft = decision.card.left;
          const cardTop = decision.card.top;
          return (
            <div key={i} style={{ opacity: pop }}>
              {/* Dashed connector from the card to its point on the line. */}
              <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
                <path d={`M${cardLeft + 270},${cardTop + 112} L${point.x},${point.y - 16}`} stroke={color} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="4 8" />
              </svg>
              <div style={{ position: "absolute", left: point.x - 14, top: point.y - 14, width: 28, height: 28, borderRadius: "50%", background: color, transform: `scale(${0.4 + pop * 0.6})`, boxShadow: `0 0 0 ${8 * pop}px ${color}33` }} />
              <div
                style={{
                  position: "absolute",
                  left: cardLeft,
                  top: cardTop,
                  width: 540,
                  padding: "18px 24px",
                  borderRadius: 20,
                  background: "rgba(30, 29, 36, 0.92)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  transform: `translateY(${(1 - pop) * 18}px)`,
                  color: C.onDark,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Pill bg={`${color}26`} color={color} style={{ fontSize: 20, padding: "4px 12px" }}>
                    {decision.side}
                  </Pill>
                  <span style={{ fontSize: 22, fontWeight: 600 }}>${decision.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ marginLeft: "auto", fontSize: 18, color: C.onDarkMuted }}>{decision.agent}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 22, lineHeight: "30px", color: "rgba(246, 247, 244, 0.85)" }}>{decision.reason}</div>
              </div>
            </div>
          );
        })}
      {logText && (
        <div style={{ position: "absolute", right: 120, bottom: 60, opacity: interpolate(frame, [3 * BAR + 30, 3 * BAR + 40], [0, 1], clamp) }}>
          <Pill bg="rgba(47, 207, 120, 0.16)" color="#2fcf78" style={{ fontSize: 24, padding: "8px 18px" }}>
            RSI Dip, buy to sell: +1.6% on price · paper trading
          </Pill>
        </div>
      )}
    </AbsoluteFill>
  );
}

const TILES: { symbol: string; name: string; logo?: string; coin?: "ETH" | "BTC" }[] = [
  { symbol: "NVDA", name: "NVIDIA", logo: "logo-NVDA.png" },
  { symbol: "ETH", name: "Ethereum", coin: "ETH" },
  { symbol: "BTC", name: "Bitcoin", coin: "BTC" },
];

/** Bars 5 and 6: three tiles (the most one agent may hold) land on three beats, then one frame wraps them into one agent. */
function Mix() {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 10], [0, 1], { ...clamp, easing: ease });
  const wrap = useProgress(BAR, 18);
  return (
    <AbsoluteFill style={{ background: C.light, alignItems: "center", opacity: enter }}>
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(37, 34, 40, 0.07) 1.2px, transparent 1.6px)", backgroundSize: "28px 28px" }} />
      <div style={{ marginTop: 200 }}>
        <Headline text="Stocks and crypto. *One agent.*" start={2} size={88} align="center" />
      </div>
      <div style={{ position: "relative", marginTop: 90, display: "flex", gap: 28, padding: 36 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 40,
            border: `3px solid ${C.purple}`,
            background: "rgba(229, 229, 255, 0.35)",
            opacity: wrap,
            transform: `scale(${1.06 - wrap * 0.06})`,
          }}
        />
        {wrap > 0 && (
          <div style={{ position: "absolute", left: 36, top: -26, opacity: wrap }}>
            <Pill bg={C.purple} color="#fff" style={{ fontSize: 24, padding: "8px 18px" }}>
              Your agent
            </Pill>
          </div>
        )}
        {TILES.map((tile, i) => {
          const land = useProgress(BEAT * (i + 1), 12);
          return (
            <div
              key={tile.symbol}
              style={{
                position: "relative",
                width: 300,
                padding: "30px 28px",
                borderRadius: 28,
                background: C.card,
                border: `1px solid ${C.border}`,
                boxShadow: cardShadow,
                opacity: land,
                transform: `translateY(${(1 - land) * 60}px) scale(${0.9 + land * 0.1})`,
                display: "flex",
                alignItems: "center",
                gap: 18,
              }}
            >
              {tile.coin ? (
                <CoinAvatar coin={tile.coin} size={64} />
              ) : (
                <span style={{ display: "grid", placeItems: "center", width: 64, height: 64, borderRadius: "50%", background: "#fff", boxShadow: `inset 0 0 0 1px ${C.border}` }}>
                  <Img src={staticFile(tile.logo!)} style={{ width: 44, height: 44, objectFit: "contain" }} />
                </span>
              )}
              <span>
                <div style={{ fontSize: 36, fontWeight: 600 }}>{tile.symbol}</div>
                <div style={{ fontSize: 22, color: C.faint }}>{tile.name}</div>
              </span>
            </div>
          );
        })}
      </div>
      <Rise start={BAR + 2 * BEAT} distance={14} style={{ marginTop: 50 }}>
        <span style={{ fontSize: 30, color: C.muted }}>Up to three markets per agent. Backtest first, then let it run.</span>
      </Rise>
    </AbsoluteFill>
  );
}

/** Bars 7 and 8: Zolva and the link. */
function Outro() {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 10], [0, 1], { ...clamp, easing: ease });
  const orb = useProgress(4, 18);
  return (
    <AbsoluteFill style={{ background: C.dark, alignItems: "center", justifyContent: "center", gap: 20, opacity: enter }}>
      <BeatGlow strength={1.4} />
      <Img src={staticFile("orb.png")} style={{ width: 170, height: 170, opacity: orb, transform: `scale(${0.7 + orb * 0.3})`, filter: "drop-shadow(0 30px 60px rgba(128, 117, 255, 0.55))" }} />
      <Headline text="Zolva" start={BEAT} size={120} color={C.onDark} align="center" />
      <Headline text="Crypto is *live.*" start={2 * BEAT} size={52} color={C.onDarkMuted} accent={C.lavender} align="center" stagger={3} style={{ fontWeight: 500 }} />
      <Rise start={3 * BEAT} distance={16} style={{ marginTop: 16 }}>
        <span style={{ display: "inline-flex", padding: "14px 30px", borderRadius: 999, border: "1px solid rgba(152, 150, 255, 0.5)", background: "rgba(255, 255, 255, 0.04)", color: "#d0ceff", fontSize: 32, fontWeight: 500 }}>
          <Typed text="zolvaagent.app/markets" start={3 * BEAT + 4} perFrame={1.3} />
        </span>
      </Rise>
      <Rise start={5 * BEAT} distance={12} style={{ marginTop: 10 }}>
        <span style={{ color: C.onDarkMuted, fontSize: 24 }}>Paper trading · ETH and BTC · No code</span>
      </Rise>
    </AbsoluteFill>
  );
}
