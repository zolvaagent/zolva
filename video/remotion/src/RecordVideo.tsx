/**
 * Video version of the "11 days on the record" tweet (U1). 18 s, 1920x1080, music only.
 * Uses the same rows as RecordCard (live leaderboard on 2026-10-26, public agents only):
 * one scene per agent with agent and holding bars, then all three together.
 */
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";

import { Card, Headline, Pill, rand, Rise, Typed, useProgress } from "./parts";
import { LightScene } from "./Q1";
import { pct, ROWS, TONES, type Row } from "./RecordCard";
import { C, ease, fontFamily } from "./theme";

export const RECORD_VIDEO_FRAMES = 550;

const SCENES = { intro: [0, 105], best: [100, 95], defense: [195, 95], worst: [290, 95], all: [385, 95], outro: [475, 75] } as const;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Rounded gap in points, so it matches the rounded numbers on screen. */
const gapOf = (row: Row) => Math.round((row.agent - row.hold) * 10) / 10;

export function RecordVideo() {
  return (
    <AbsoluteFill style={{ background: C.light, fontFamily }}>
      <Audio src={staticFile("music-lyria.wav")} volume={(f) => interpolate(f, [0, 20, RECORD_VIDEO_FRAMES - 40, RECORD_VIDEO_FRAMES], [0, 0.85, 0.85, 0], clamp)} />
      <Sequence from={SCENES.best[0]} durationInFrames={SCENES.best[1]}>
        <LightScene duration={SCENES.best[1]} fadeIn={false}>
          <RowScene row={ROWS[0]} title="Best so far: *one trade.*" />
        </LightScene>
      </Sequence>
      <Sequence from={SCENES.defense[0]} durationInFrames={SCENES.defense[1]}>
        <LightScene duration={SCENES.defense[1]}>
          <RowScene row={ROWS[1]} title="Best defense: *lost less.*" />
        </LightScene>
      </Sequence>
      <Sequence from={SCENES.worst[0]} durationInFrames={SCENES.worst[1]}>
        <LightScene duration={SCENES.worst[1]}>
          <RowScene row={ROWS[2]} title="And the worst. *It stays up.*" />
        </LightScene>
      </Sequence>
      <Sequence from={SCENES.all[0]} durationInFrames={SCENES.all[1]}>
        <LightScene duration={SCENES.all[1]} fadeOut={false}>
          <AllRows />
        </LightScene>
      </Sequence>
      <Sequence from={SCENES.intro[0]} durationInFrames={SCENES.intro[1]}>
        <Intro />
      </Sequence>
      <Sequence from={SCENES.outro[0]} durationInFrames={SCENES.outro[1]}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
}

/** Hourly ticks drifting upward in the dark, like the agents' runs. */
function HourField({ opacity = 1 }: { opacity?: number }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity }}>
      {Array.from({ length: 140 }, (_, i) => {
        const x = rand(i, 1) * 1920 + Math.sin(frame / 50 + rand(i, 3) * 6) * 12;
        const y = rand(i, 2) * 1080 - frame * (0.15 + rand(i, 4) * 0.25);
        const kind = rand(i, 6);
        const label = kind > 0.82 ? "BUY" : kind > 0.66 ? "SELL" : "HOLD";
        const color = label === "BUY" ? C.gain : label === "SELL" ? C.loss : C.onDark;
        return (
          <span key={i} style={{ position: "absolute", left: x, top: y, color, opacity: 0.1 + rand(i, 5) * 0.3, fontSize: 14 + Math.round(rand(i, 7) * 8), fontWeight: 600, letterSpacing: "0.08em" }}>
            {label}
          </span>
        );
      })}
    </AbsoluteFill>
  );
}

function Intro() {
  const frame = useCurrentFrame();
  const textOut = interpolate(frame, [76, 88], [1, 0], clamp);
  const reveal = interpolate(frame, [84, 105], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: C.dark }}>
      <AbsoluteFill style={{ background: "radial-gradient(60% 55% at 50% 45%, rgba(128, 117, 255, 0.24), transparent 70%)" }} />
      <HourField />
      <AbsoluteFill style={{ background: `radial-gradient(50% 50% at 50% 50%, rgba(18, 17, 22, ${0.9 * textOut}), transparent 80%)` }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 18, opacity: textOut }}>
        <Headline text="11 days on the *record.*" start={6} size={110} color={C.onDark} accent={C.lavender} align="center" />
        <Headline text="Agents trading paper money on Robinhood Chain." start={26} size={40} color={C.onDarkMuted} align="center" stagger={3} style={{ fontWeight: 500, letterSpacing: "-0.02em" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 2400 * reveal, height: 2400 * reveal, borderRadius: "50%", background: C.light, opacity: reveal > 0 ? 1 : 0 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/**
 * Two bars from a shared zero line: right for gains, left for losses.
 * `scale` is pixels per percent, the same in every scene so sizes compare.
 */
function Bar({ label, value, color, grow, scale }: { label: string; value: number; color: string; grow: number; scale: number }) {
  const width = Math.abs(value) * scale * grow;
  const shown = value * grow;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", alignItems: "center", gap: 24 }}>
      <span style={{ fontSize: 26, color: C.muted, textAlign: "right" }}>{label}</span>
      <div style={{ position: "relative", height: 64 }}>
        <div style={{ position: "absolute", left: "50%", top: -10, bottom: -10, width: 2, background: C.borderStrong }} />
        <div
          style={{
            position: "absolute",
            top: 8,
            height: 48,
            width,
            borderRadius: 14,
            background: color,
            ...(value >= 0 ? { left: "50%" } : { right: "50%" }),
          }}
        />
        <span
          style={{
            position: "absolute",
            top: 6,
            fontSize: 44,
            fontWeight: 600,
            color,
            fontVariantNumeric: "tabular-nums",
            ...(value >= 0 ? { left: `calc(50% + ${width + 18}px)` } : { right: `calc(50% + ${width + 18}px)` }),
          }}
        >
          {pct(shown)}
        </span>
      </div>
    </div>
  );
}

function RowScene({ row, title }: { row: Row; title: string }) {
  const frame = useCurrentFrame();
  const grow = useProgress(26, 34);
  const gap = useProgress(58, 18);
  const edge = gapOf(row);
  const tone = TONES[row.tone];
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ marginTop: 220 }}>
        <Headline text={title} start={4} size={80} align="center" />
      </div>
      <Rise start={10} style={{ marginTop: 56 }}>
        <Card style={{ width: 1400, padding: "40px 56px 48px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Pill bg={tone.bg} color={tone.color} style={{ fontSize: 22 }}>
              {row.label}
            </Pill>
            <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em" }}>{row.name}</span>
            <span style={{ marginLeft: "auto", fontSize: 24, color: C.faint }}>
              {row.tickers.join(" · ")} · {row.trades} {row.trades === 1 ? "trade" : "trades"}
            </span>
          </div>
          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 22 }}>
            <Bar label="Agent" value={row.agent} color={row.agent >= 0 ? C.gain : C.loss} grow={grow} scale={80} />
            <Bar label="Holding instead" value={row.hold} color="#b9b8b8" grow={grow} scale={80} />
          </div>
          <div style={{ marginTop: 30, display: "flex", justifyContent: "flex-end", opacity: gap, transform: `translateY(${(1 - gap) * 12}px)` }}>
            <Pill bg={edge >= 0 ? C.gainSoft : "#fdecec"} color={edge >= 0 ? C.gain : C.loss} style={{ fontSize: 26, padding: "10px 22px" }}>
              {edge >= 0 ? "+" : "−"}
              {Math.abs(edge).toFixed(1)} pts {edge >= 0 ? "better" : "worse"} than holding
            </Pill>
          </div>
        </Card>
      </Rise>
      <div style={{ marginTop: 26, fontSize: 22, color: C.faint, opacity: interpolate(frame, [40, 52], [0, 1], clamp) }}>Paper trading · live since Oct 15 · leaderboard on Oct 26</div>
    </AbsoluteFill>
  );
}

function AllRows() {
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ marginTop: 200 }}>
        <Headline text="Small sample. *Losses stay on the record.*" start={4} size={72} align="center" />
      </div>
      <div style={{ marginTop: 48, display: "flex", flexDirection: "column", gap: 20 }}>
        {ROWS.map((row, i) => {
          const edge = gapOf(row);
          return (
            <Rise key={row.name} start={14 + i * 8} distance={24}>
              <Card style={{ width: 1500, padding: "26px 40px", display: "flex", alignItems: "center", gap: 28 }}>
                <span style={{ width: 240 }}>
                  <Pill bg={TONES[row.tone].bg} color={TONES[row.tone].color} style={{ fontSize: 22 }}>
                    {row.label}
                  </Pill>
                </span>
                <span style={{ flex: 1 }}>
                  <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em" }}>{row.name}</div>
                  <div style={{ marginTop: 4, fontSize: 22, color: C.faint }}>{row.tickers.join(" · ")}</div>
                </span>
                <span style={{ width: 200, textAlign: "right", fontSize: 46, fontWeight: 600, color: row.agent >= 0 ? C.gain : C.loss, fontVariantNumeric: "tabular-nums" }}>{pct(row.agent)}</span>
                <span style={{ width: 200, textAlign: "right", fontSize: 46, fontWeight: 600, color: C.faint, fontVariantNumeric: "tabular-nums" }}>{pct(row.hold)}</span>
                <span style={{ width: 170, textAlign: "right", fontSize: 26, fontWeight: 600, color: edge >= 0 ? C.gain : C.loss }}>
                  {edge >= 0 ? "+" : "−"}
                  {Math.abs(edge).toFixed(1)} pts
                </span>
              </Card>
            </Rise>
          );
        })}
      </div>
      <Rise start={44} distance={12} style={{ marginTop: 24, width: 1500, display: "flex", justifyContent: "flex-end", gap: 150, paddingRight: 210, fontSize: 22, color: C.faint }}>
        <span>Agent</span>
        <span>Holding instead</span>
      </Rise>
    </AbsoluteFill>
  );
}

function Outro() {
  const frame = useCurrentFrame();
  const cover = interpolate(frame, [0, 22], [0, 1], { ...clamp, easing: ease });
  const orb = useProgress(10, 22);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", width: 2400 * cover, height: 2400 * cover, borderRadius: "50%", background: C.dark }} />
      <AbsoluteFill style={{ opacity: cover }}>
        <AbsoluteFill style={{ background: "radial-gradient(55% 50% at 50% 40%, rgba(128, 117, 255, 0.3), transparent 70%)" }} />
        <HourField opacity={0.4} />
        <AbsoluteFill style={{ background: "radial-gradient(42% 46% at 50% 52%, rgba(18, 17, 22, 0.95), rgba(18, 17, 22, 0.6) 60%, transparent 100%)" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 20 }}>
        <Img src={staticFile("orb.png")} style={{ width: 170, height: 170, opacity: orb, transform: `scale(${0.7 + orb * 0.3})`, filter: "drop-shadow(0 30px 60px rgba(128, 117, 255, 0.55))" }} />
        <Headline text="Zolva" start={16} size={120} color={C.onDark} align="center" />
        <Headline text="Trading agents that *show their work.*" start={26} size={44} color={C.onDarkMuted} accent={C.lavender} align="center" stagger={3} style={{ fontWeight: 500, letterSpacing: "-0.02em" }} />
        <Rise start={38} distance={16} style={{ marginTop: 16 }}>
          <span style={{ display: "inline-flex", padding: "14px 30px", borderRadius: 999, border: "1px solid rgba(152, 150, 255, 0.5)", background: "rgba(255, 255, 255, 0.04)", color: "#d0ceff", fontSize: 32, fontWeight: 500 }}>
            <Typed text="zolvaagent.app/leaderboard" start={42} perFrame={1.4} />
          </span>
        </Rise>
        <Rise start={54} distance={12} style={{ marginTop: 10, opacity: interpolate(frame, [54, 64], [0, 1], clamp) }}>
          <span style={{ color: C.onDarkMuted, fontSize: 24 }}>Paper trading · Past results do not predict future ones</span>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
