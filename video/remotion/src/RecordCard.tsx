/**
 * Image for the "11 days on the record" tweet (1600x900 PNG).
 * Numbers are the live leaderboard on 2026-10-26 (agent_stats, public agents only):
 * - Lab · Gold & Oil Momentum: +2.28%, holding +1.44%, 1 trade
 * - Meme Rebound: −0.38%, holding −3.55%, 4 trades
 * - Lab · Trio Breakout: −4.04%, holding −0.25%, 7 trades
 * Shown rounded half up to one decimal, and the gap is taken from the rounded
 * values so every row adds up on the card.
 */
import { AbsoluteFill, Img, staticFile } from "remotion";

import { Pill } from "./parts";
import { C, cardShadow, fontFamily } from "./theme";

type Row = { label: string; tone: "gain" | "warn" | "loss"; name: string; tickers: string[]; agent: number; hold: number; trades: number };

const ROWS: Row[] = [
  { label: "Best so far", tone: "gain", name: "Gold & Oil Momentum", tickers: ["GLD", "USO"], agent: 2.3, hold: 1.4, trades: 1 },
  { label: "Best defense", tone: "warn", name: "Meme Rebound", tickers: ["GME", "AMC"], agent: -0.4, hold: -3.6, trades: 4 },
  { label: "Worst vs holding", tone: "loss", name: "Trio Breakout", tickers: ["NVDA", "TSLA", "AAPL"], agent: -4.0, hold: -0.3, trades: 7 },
];

const TONES = {
  gain: { bg: C.gainSoft, color: C.gain },
  warn: { bg: C.lavenderSoft, color: C.purple },
  loss: { bg: "#fdecec", color: C.loss },
} as const;

const pct = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;

export function RecordCard() {
  return (
    <AbsoluteFill style={{ background: C.light, fontFamily, color: C.text, padding: "64px 80px" }}>
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(37, 34, 40, 0.07) 1.2px, transparent 1.6px)", backgroundSize: "28px 28px" }} />
      <AbsoluteFill style={{ background: "radial-gradient(50% 60% at 85% 0%, rgba(152, 150, 255, 0.22), transparent 70%)" }} />

      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 16 }}>
        <Img src={staticFile("orb.png")} style={{ width: 52, height: 52 }} />
        <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>Zolva</span>
        <span style={{ marginLeft: "auto" }}>
          <Pill bg="#fff" color={C.muted} style={{ border: `1px solid ${C.borderStrong}`, fontSize: 20 }}>
            Paper trading · Oct 15 to Oct 26
          </Pill>
        </span>
      </div>

      <div style={{ position: "relative", marginTop: 40, fontSize: 68, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.05 }}>
        11 days on the record. <span style={{ color: C.purple }}>Losses included.</span>
      </div>

      <div style={{ position: "relative", marginTop: 52, display: "flex", flexDirection: "column", gap: 24 }}>
        {ROWS.map((row) => {
          const edge = row.agent - row.hold;
          return (
            <div key={row.name} style={{ display: "flex", alignItems: "center", gap: 28, padding: "30px 36px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 26, boxShadow: cardShadow }}>
              <span style={{ width: 230 }}>
                <Pill bg={TONES[row.tone].bg} color={TONES[row.tone].color} style={{ fontSize: 20 }}>
                  {row.label}
                </Pill>
              </span>
              <span style={{ flex: 1 }}>
                <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em" }}>{row.name}</div>
                <div style={{ marginTop: 4, fontSize: 21, color: C.faint }}>
                  {row.tickers.join(" · ")} · {row.trades} {row.trades === 1 ? "trade" : "trades"}
                </div>
              </span>
              <span style={{ width: 190, textAlign: "right" }}>
                <div style={{ fontSize: 18, color: C.faint }}>Agent</div>
                <div style={{ fontSize: 44, fontWeight: 600, color: row.agent >= 0 ? C.gain : C.loss, fontVariantNumeric: "tabular-nums" }}>{pct(row.agent)}</div>
              </span>
              <span style={{ width: 190, textAlign: "right" }}>
                <div style={{ fontSize: 18, color: C.faint }}>Holding instead</div>
                <div style={{ fontSize: 44, fontWeight: 600, color: C.faint, fontVariantNumeric: "tabular-nums" }}>{pct(row.hold)}</div>
              </span>
              <span style={{ width: 170, textAlign: "right", fontSize: 24, fontWeight: 600, color: edge >= 0 ? C.gain : C.loss }}>
                {edge >= 0 ? "+" : "−"}
                {Math.abs(Math.round(edge * 10) / 10).toFixed(1)} pts
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ position: "relative", marginTop: "auto", display: "flex", justifyContent: "space-between", fontSize: 21, color: C.faint }}>
        <span>Live results since each agent launched · hourly onchain prices on Robinhood Chain · past results do not predict future ones</span>
        <span style={{ color: C.purple, fontWeight: 600 }}>zolvaagent.app</span>
      </div>
    </AbsoluteFill>
  );
}
