import { ImageResponse } from "next/og";

import { getAgentShare, type AgentShare } from "@/lib/share/agent-share";
import { dayAt, percent, signedUsd } from "@/lib/format";
import { db } from "@/lib/supabase";

/**
 * The per agent share card (Open Graph and X card), drawn on request from the agent's own
 * numbers. Design: assets/brand/share-mockup.html. Private or unknown agents get a plain
 * Zolva card, so nothing about them leaks through the image URL.
 */

export const alt = "Zolva agent: return, P&L and value against holding";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const COLORS = {
  bg: "#121116",
  text: "#f6f7f4",
  muted: "rgba(246, 247, 244, 0.6)",
  faint: "rgba(246, 247, 244, 0.45)",
  gain: "#2fcf78",
  loss: "#ff7a45",
  purple: "#9a91ff",
  hold: "#77757f",
};

const BACKGROUND =
  "radial-gradient(70% 90% at 100% 100%, rgba(128, 117, 255, 0.45) 0%, rgba(128, 117, 255, 0) 70%), radial-gradient(50% 60% at 0% 0%, rgba(152, 150, 255, 0.18) 0%, rgba(152, 150, 255, 0) 70%)";

/** public/icon.svg, inlined so the card needs no request back to the site. */
const LOGO = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjI1LjA3IDI1LjgyIDk1MC4zNiA5NTAuMzYiPgo8ZGVmcz4KPGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjMTUxMDNhIi8+PHN0b3Agb2Zmc2V0PSIwLjUiIHN0b3AtY29sb3I9IiMyZTI0OTAiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM2YTVlZjUiLz48L2xpbmVhckdyYWRpZW50Pgo8cmFkaWFsR3JhZGllbnQgaWQ9Imdsb3ciIGN4PSIxIiBjeT0iMSIgcj0iMS4yIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiM5ODk2ZmYiLz48c3RvcCBvZmZzZXQ9IjAuNDUiIHN0b3AtY29sb3I9IiM5ODk2ZmYiIHN0b3Atb3BhY2l0eT0iMCIvPjwvcmFkaWFsR3JhZGllbnQ+CjwvZGVmcz4KPHJlY3QgeD0iMjUuMDciIHk9IjI1LjgyIiB3aWR0aD0iOTUwLjM2IiBoZWlnaHQ9Ijk1MC4zNiIgcng9IjIwOS4wOCIgZmlsbD0idXJsKCNnKSIvPgo8cmVjdCB4PSIyNS4wNyIgeT0iMjUuODIiIHdpZHRoPSI5NTAuMzYiIGhlaWdodD0iOTUwLjM2IiByeD0iMjA5LjA4IiBmaWxsPSJ1cmwoI2dsb3cpIi8+CjxwYXRoIGQ9Ik04MDEuMzc2IDM3MS4zNzNMNzE4LjM3NiAyODguMzczQzcxMi4zNzQgMjgyLjM3MSA3MDQuMjM1IDI3OSA2OTUuNzQ4IDI3OUgzMDguMjU4QzI5OS43NzEgMjc5IDI5MS42MzIgMjgyLjM3MSAyODUuNjMgMjg4LjM3M0wyMDEuMTMgMzcyLjg3M0MxODguNjM0IDM4NS4zNjkgMTg4LjYzNCA0MDUuNjMxIDIwMS4xMyA0MTguMTI3TDI1OS4zNzYgNDc2LjM3M0MyNzEuODcyIDQ4OC44NjkgMjcxLjg3MiA1MDkuMTMxIDI1OS4zNzYgNTIxLjYyN0wxOTkuMTMgNTgxLjg3M0MxODYuNjM0IDU5NC4zNjkgMTg2LjYzNCA2MTQuNjMxIDE5OS4xMyA2MjcuMTI3TDI4NS42MyA3MTMuNjI3QzI5MS42MzIgNzE5LjYyOSAyOTkuNzcxIDcyMyAzMDguMjU4IDcyM0g2OTQuNzQ4QzcwMy4yMzUgNzIzIDcxMS4zNzQgNzE5LjYyOSA3MTcuMzc2IDcxMy42MjdMODAxLjM3NiA2MjkuNjI3QzgxMy44NzIgNjE3LjEzMSA4MTMuODcyIDU5Ni44NjkgODAxLjM3NiA1ODQuMzczTDc0MC4xMyA1MjMuMTI3QzcyNy42MzQgNTEwLjYzMSA3MjcuNjM0IDQ5MC4zNjkgNzQwLjEzIDQ3Ny44NzNMODAxLjM3NiA0MTYuNjI3QzgxMy44NzIgNDA0LjEzMSA4MTMuODcyIDM4My44NjkgODAxLjM3NiAzNzEuMzczWiBNMzA2LjMxNyAzMTEuNjg2TDI1NC4wNzQgMzYzLjkyOUMyNDcuNzc0IDM3MC4yMjkgMjUyLjIzNiAzODEgMjYxLjE0NSAzODFINDAyLjM3NkM0MTYuNjMgMzgxIDQyMy43NjkgMzk4LjIzNCA0MTMuNjg5IDQwOC4zMTRMMjMwLjk3IDU5MS4wMzNDMjI0LjQ3MiA1OTcuNTMxIDIyNC43NyA2MDguMTU0IDIzMS42MjMgNjE0LjI3N0wzMDEuNzI0IDY3Ni45MjFDMzA4LjA1MyA2ODIuNTc3IDMxNy42OTcgNjgyLjMwNiAzMjMuNjk5IDY3Ni4zMDRMNjY1LjY4OSAzMzQuMzE0QzY3NS43NjkgMzI0LjIzNCA2NjguNjMgMzA3IDY1NC4zNzYgMzA3SDMxNy42M0MzMTMuMzg3IDMwNyAzMDkuMzE3IDMwOC42ODYgMzA2LjMxNyAzMTEuNjg2WiIgZmlsbC1ydWxlPSJldmVub2RkIiBmaWxsPSIjZmZmZmZmIi8+Cjwvc3ZnPgo=";

// Inter from Google Fonts (TTF, which the renderer needs), fetched once per Worker instance.
// If it fails, the card still renders in the renderer's built in font.
let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 500 | 700; style: "normal" }[]> | null = null;

async function loadFont(weight: 500 | 700): Promise<ArrayBuffer> {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`)).text();
  const url = css.match(/src: url\((https:[^)]+\.ttf)\)/)?.[1];
  if (!url) throw new Error("Inter TTF not found in the Google Fonts CSS");
  return (await fetch(url)).arrayBuffer();
}

function interFonts() {
  fonts ??= Promise.all([loadFont(500), loadFont(700)])
    .then(([medium, bold]) => [
      { name: "Inter", data: medium, weight: 500 as const, style: "normal" as const },
      { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
    ])
    .catch((error) => {
      console.error("Share card font failed", error);
      fonts = null;
      return [];
    });
  return fonts;
}

const tone = (value: number) => (value > 0.005 ? COLORS.gain : value < -0.005 ? COLORS.loss : COLORS.text);

/** SVG paths for the agent (with its fill) and holding lines, scaled to the chart box. */
function chartPaths(curve: [number, number][], width: number, height: number) {
  const values = curve.flat();
  const pad = (Math.max(...values) - Math.min(...values)) * 0.08 || 1;
  const min = Math.min(...values) - pad;
  const max = Math.max(...values) + pad;
  const x = (index: number) => (curve.length === 1 ? width : (index / (curve.length - 1)) * width);
  const y = (value: number) => height - ((value - min) / (max - min)) * height;
  const line = (key: 0 | 1) => curve.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point[key]).toFixed(1)}`).join(" ");
  const agent = line(0);
  return { agent, hold: line(1), fill: `${agent} L${width} ${height} L0 ${height} Z` };
}

function Brand({ size: logoSize = 48 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: logoSize * 0.625, fontWeight: 700, letterSpacing: "-0.03em" }}>
      <img src={LOGO} width={logoSize} height={logoSize} alt="" />
      Zolva
    </div>
  );
}

function AgentCard({ share }: { share: AgentShare }) {
  const chart = chartPaths(share.curve, 600, 190);
  const chip = share.live ? "Real money" : share.perps ? "Paper · Perps" : "Paper";
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Brand />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 40,
            padding: "0 18px",
            borderRadius: 999,
            fontSize: 20,
            fontWeight: 500,
            background: share.live ? "rgba(47, 207, 120, 0.14)" : "rgba(152, 150, 255, 0.16)",
            color: share.live ? COLORS.gain : "#b8b3ff",
          }}
        >
          {chip}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 32 }}>
        <div style={{ fontSize: share.name.length > 26 ? 44 : 56, lineHeight: 1.05, fontWeight: 700, letterSpacing: "-0.035em" }}>{share.name}</div>
        <div style={{ marginTop: 16, fontSize: 24, color: COLORS.muted }}>
          {`${share.symbols.slice(0, 4).join(" · ")}${share.symbols.length > 4 ? ` +${share.symbols.length - 4}` : ""}  ·  since ${dayAt(share.createdAt)}`}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, alignItems: "flex-end", gap: 48, paddingBottom: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 400, gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 20, color: COLORS.muted }}>Return</div>
            <div style={{ fontSize: 64, lineHeight: 1, fontWeight: 700, letterSpacing: "-0.04em", marginTop: 6, color: tone(share.returnPct) }}>{percent(share.returnPct)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 20, color: COLORS.muted }}>P&amp;L</div>
            <div style={{ fontSize: 40, lineHeight: 1, fontWeight: 700, letterSpacing: "-0.04em", marginTop: 6, color: tone(share.pnlUsd) }}>{signedUsd(share.pnlUsd)}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <svg width="600" height="190" viewBox="0 0 600 190">
            <defs>
              <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#8075ff" stopOpacity="0.22" />
                <stop offset="1" stopColor="#8075ff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={chart.fill} fill="url(#fill)" />
            <path d={chart.hold} fill="none" stroke={COLORS.hold} strokeWidth="3" strokeDasharray="8 7" />
            <path d={chart.agent} fill="none" stroke={COLORS.purple} strokeWidth="4" strokeLinejoin="round" />
          </svg>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 22, marginTop: 10, fontSize: 18, color: COLORS.muted }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 22, height: 3, background: COLORS.purple }} />
              Agent
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 22, height: 0, borderTop: `3px dashed ${COLORS.hold}` }} />
              {`Holding ${percent(share.holdReturnPct)}`}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: COLORS.faint }}>
        <div style={{ display: "flex", gap: 10 }}>
          <span style={{ color: "rgba(246, 247, 244, 0.85)", fontWeight: 500 }}>zolvaagent.app</span>
          <span>· every decision public</span>
        </div>
        <div style={{ display: "flex" }}>Past results do not predict future results</div>
      </div>
    </div>
  );
}

/** For agents that cannot be shared: the brand and the tagline only. */
function PlainCard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 32 }}>
      <Brand size={96} />
      <div style={{ fontSize: 56, lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.035em", maxWidth: 1056 }}>Trading agents on Robinhood Chain</div>
      <div style={{ fontSize: 26, color: COLORS.muted }}>zolvaagent.app</div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [share, fontList] = await Promise.all([getAgentShare(db(), id), interFonts()]);
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: COLORS.bg, backgroundImage: BACKGROUND, color: COLORS.text, fontFamily: "Inter" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "64px 72px 56px" }}>{share ? <AgentCard share={share} /> : <PlainCard />}</div>
      </div>
    ),
    {
      ...size,
      fonts: fontList,
      // New numbers arrive hourly; let X, Telegram and the CDN reuse the image for up to an hour.
      headers: { "Cache-Control": "public, max-age=900, s-maxage=3600" },
    },
  );
}
