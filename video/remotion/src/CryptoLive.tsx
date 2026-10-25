/**
 * "Crypto markets are live" video for X. 21 s, 1920x1080, music only (the Q1 Lyria track).
 * Same style as Q1: warm white canvas, lavender accent, dark intro and outro, eased motion.
 * Facts shown, all from 2026-10-24:
 * - ETH and BTC prices and 7 day lines: stored hourly closes (every 3rd hour), Oct 18 to Oct 24.
 * - Pool vs Chainlink: ETH pool $2,367.08 vs ETH / USD feed $2,370.08 (0.13% apart), read at one block.
 * - Mixed agent: Studio backtest, NVDA + ETH, momentum, last 30 days: agent −4.8%, holding −8.3%.
 */
import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";

import { Card, Headline, Pill, rand, Rise, Typed, useProgress } from "./parts";
import { LightScene } from "./Q1";
import { C, ease, fontFamily } from "./theme";

export const CRYPTO_LIVE_FRAMES = 630;

const SCENES = { intro: [0, 125], markets: [120, 150], check: [265, 145], mix: [405, 140], outro: [540, 90] } as const;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const COINS = {
  BTC: {
    name: "Bitcoin",
    color: "#f7931a",
    icon: "icon-currency-btc.svg",
    week: [81869.74, 81670.29, 82069.67, 81821.51, 81015.32, 81045.36, 81011.84, 82350.2, 82557.45, 82600.92, 82828.42, 82543.66, 81871.64, 81930.01, 82013.19, 81548.09, 81954.06, 81786.81, 81345.61, 81593.51, 82410.07, 82402.65, 82668.23, 83118.86, 82791.52, 82756.39, 83448.91, 83482.21, 84415.5, 84209.95, 84692.97, 84229.22, 82712.04, 82437.38, 81821.06, 81764.09, 81565.69, 81210.92, 81383.16, 81397.1, 81896.2, 81697.35, 81550.37, 81757.45, 81503.98, 81322.18, 81276.53, 80598.79, 80860.71, 80717.22, 80477.73, 80664.4, 79671.66, 80449.85, 80318.45],
  },
  ETH: {
    name: "Ethereum",
    color: "#627eea",
    icon: "icon-currency-eth.svg",
    week: [2422.24, 2408.17, 2421.71, 2415.24, 2377.07, 2366.64, 2369.44, 2411.71, 2421.31, 2429.07, 2437.09, 2421.66, 2392.8, 2400.62, 2399.25, 2399.25, 2413.11, 2396.46, 2380.18, 2395.49, 2437.02, 2436.91, 2454.09, 2452.43, 2442.32, 2439.51, 2456.33, 2465.21, 2511.55, 2500.74, 2497.22, 2475.37, 2442.62, 2432.8, 2403.88, 2400.83, 2398.21, 2382.59, 2392.01, 2392.02, 2408.17, 2406.66, 2398.44, 2399.94, 2400.92, 2400.83, 2397.08, 2370.43, 2379.6, 2373.79, 2364.52, 2366.29, 2303.28, 2334.94, 2336.92],
  },
} as const;

type Coin = keyof typeof COINS;

const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CryptoLive() {
  return (
    <AbsoluteFill style={{ background: C.light, fontFamily }}>
      <Audio
        src={staticFile("music-lyria.wav")}
        volume={(f) => interpolate(f, [0, 20, CRYPTO_LIVE_FRAMES - 40, CRYPTO_LIVE_FRAMES], [0, 0.85, 0.85, 0], clamp)}
      />
      <Sequence from={SCENES.markets[0]} durationInFrames={SCENES.markets[1]}>
        <LightScene duration={SCENES.markets[1]} fadeIn={false}>
          <Markets />
        </LightScene>
      </Sequence>
      <Sequence from={SCENES.check[0]} durationInFrames={SCENES.check[1]}>
        <LightScene duration={SCENES.check[1]}>
          <Check />
        </LightScene>
      </Sequence>
      <Sequence from={SCENES.mix[0]} durationInFrames={SCENES.mix[1]}>
        <LightScene duration={SCENES.mix[1]} fadeOut={false}>
          <Mix />
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

/** The coin's Phosphor icon on its color, like the app's ticker avatar. */
function CoinAvatar({ coin, size }: { coin: Coin; size: number }) {
  return (
    <span style={{ display: "inline-grid", placeItems: "center", width: size, height: size, borderRadius: "50%", background: COINS[coin].color, flex: "none" }}>
      <Img src={staticFile(COINS[coin].icon)} style={{ width: size * 0.66, height: size * 0.66, filter: "invert(1)" }} />
    </span>
  );
}

/** Stock tickers drifting in the dark; ETH and BTC glow in their colors and come forward. */
function TokenField({ focus = 0, opacity = 1 }: { focus?: number; opacity?: number }) {
  const frame = useCurrentFrame();
  const stocks = "NVDA TSLA AAPL META GOOGL AMZN SPY QQQ PLTR MU TSM GME AMC MSTR CRCL RDDT BABA USO GLD SPCX".split(" ");
  return (
    <AbsoluteFill style={{ opacity }}>
      {Array.from({ length: 150 }, (_, i) => {
        const coin: Coin | null = i % 25 === 0 ? "ETH" : i % 25 === 12 ? "BTC" : null;
        const x = rand(i, 1) * 1920 + Math.sin(frame / 50 + rand(i, 3) * 6) * 14;
        const y = rand(i, 2) * 1080 - frame * (0.15 + rand(i, 4) * 0.25);
        const alpha = coin ? 0.25 + focus * 0.7 : (0.12 + rand(i, 5) * 0.35) * (1 - focus * 0.6);
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              color: coin ? COINS[coin].color : C.onDark,
              opacity: alpha,
              fontSize: (coin ? 22 : 15 + Math.round(rand(i, 7) * 10)) * (coin ? 1 + focus * 0.4 : 1),
              fontWeight: coin ? 600 : 500,
              letterSpacing: "0.04em",
            }}
          >
            {coin ?? stocks[i % stocks.length]}
          </span>
        );
      })}
    </AbsoluteFill>
  );
}

function Intro() {
  const frame = useCurrentFrame();
  const focus = interpolate(frame, [40, 70], [0, 1], { ...clamp, easing: ease });
  const first = interpolate(frame, [36, 46], [1, 0], clamp);
  const textOut = interpolate(frame, [92, 106], [1, 0], clamp);
  const coins = useProgress(56, 24);
  const reveal = interpolate(frame, [104, 125], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: C.dark }}>
      <AbsoluteFill style={{ background: "radial-gradient(60% 55% at 50% 45%, rgba(128, 117, 255, 0.24), transparent 70%)" }} />
      <TokenField focus={focus} />
      <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(18, 17, 22, ${0.92 * textOut}) 0%, rgba(18, 17, 22, ${0.75 * textOut}) 45%, transparent 75%)` }} />
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 160, opacity: textOut }}>
        <div style={{ position: "relative", height: 220 }}>
          <div style={{ position: "absolute", opacity: first }}>
            <Headline text="Stock tokens were *step one.*" start={6} size={96} color={C.onDark} accent={C.lavender} />
          </div>
          {frame >= 44 && (
            <div style={{ position: "absolute" }}>
              <Headline text="Now: *ETH and BTC.*" start={46} size={96} color={C.onDark} accent={C.lavender} />
            </div>
          )}
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", right: 220, top: 400, display: "flex", gap: 36, opacity: coins * textOut, transform: `translateY(${(1 - coins) * 30}px)` }}>
        {(["ETH", "BTC"] as const).map((coin) => (
          <div key={coin} style={{ filter: `drop-shadow(0 24px 50px ${COINS[coin].color}88)` }}>
            <CoinAvatar coin={coin} size={170} />
          </div>
        ))}
      </div>
      {/* The light canvas opens from the centre, like Q1. */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 2400 * reveal, height: 2400 * reveal, borderRadius: "50%", background: C.light, opacity: reveal > 0 ? 1 : 0 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Spark({ values, color, draw, width, height }: { values: readonly number[]; color: string; draw: number; width: number; height: number }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${(i / (values.length - 1)) * width},${height - ((v - min) / (max - min)) * height}`).join(" ");
  const id = `spark-${color.slice(1)}`;
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        <clipPath id={id}>
          <rect x={-10} y={-20} width={(width + 20) * draw} height={height + 40} />
        </clipPath>
      </defs>
      <path d={d} clipPath={`url(#${id})`} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Markets() {
  const frame = useCurrentFrame();
  const press = interpolate(frame, [30, 34, 40], [1, 0.95, 1], clamp);
  const cryptoOn = frame >= 34;
  const header = (label: string, align: "left" | "right" = "left", width?: number) => (
    <span style={{ width, textAlign: align, fontSize: 22, color: C.faint, fontWeight: 500 }}>{label}</span>
  );
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ marginTop: 220 }}>
        <Headline text="Crypto markets are *live.*" start={6} size={84} align="center" />
      </div>
      <Rise start={12} style={{ marginTop: 50 }}>
        <div style={{ display: "flex", gap: 14, marginBottom: 22 }}>
          <span style={{ display: "inline-flex", gap: 4, padding: 6, borderRadius: 999, background: "#efefee" }}>
            <span style={{ padding: "10px 24px", borderRadius: 999, fontSize: 24, fontWeight: 500, color: cryptoOn ? C.faint : C.text, background: cryptoOn ? "transparent" : "#fff" }}>Stocks</span>
            <span style={{ padding: "10px 24px", borderRadius: 999, fontSize: 24, fontWeight: 600, color: cryptoOn ? C.text : C.faint, background: cryptoOn ? "#fff" : "transparent", transform: `scale(${press})`, boxShadow: cryptoOn ? "0 4px 14px -6px rgba(37, 34, 40, 0.25)" : "none" }}>
              Crypto
            </span>
          </span>
        </div>
        <Card style={{ width: 1360, padding: "26px 44px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24, paddingBottom: 18, borderBottom: `1px solid ${C.border}` }}>
            {header("Coin", "left", 330)}
            {header("Price", "right", 230)}
            {header("7d", "right", 150)}
            <span style={{ width: 70 }} />
            {header("Last 7 days", "left", 330)}
            <span style={{ flex: 1, textAlign: "right", fontSize: 22, color: C.faint, fontWeight: 500 }}>Checked</span>
          </div>
          {(["BTC", "ETH"] as const).map((coin, row) => {
            const appear = useProgress(42 + row * 10, 22);
            const draw = useProgress(52 + row * 10, 46);
            const week = COINS[coin].week;
            const price = week[week.length - 1];
            const change = (price / week[0] - 1) * 100;
            return (
              <div key={coin} style={{ display: "flex", alignItems: "center", gap: 24, padding: "26px 0", borderBottom: row === 0 ? `1px solid ${C.border}` : "none", opacity: appear, transform: `translateY(${(1 - appear) * 20}px)` }}>
                <span style={{ width: 330, display: "flex", alignItems: "center", gap: 20 }}>
                  <CoinAvatar coin={coin} size={60} />
                  <span>
                    <div style={{ fontSize: 34, fontWeight: 600 }}>{coin}</div>
                    <div style={{ fontSize: 22, color: C.faint }}>{COINS[coin].name}</div>
                  </span>
                </span>
                <span style={{ width: 230, textAlign: "right", fontSize: 34, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{usd(price)}</span>
                <span style={{ width: 150, textAlign: "right", fontSize: 30, color: change >= 0 ? C.gain : C.loss, fontVariantNumeric: "tabular-nums" }}>
                  {change >= 0 ? "+" : "−"}
                  {Math.abs(change).toFixed(1)}%
                </span>
                <span style={{ width: 70 }} />
                <span style={{ width: 330 }}>
                  <Spark values={week} color={change >= 0 ? C.gain : C.loss} draw={draw} width={300} height={56} />
                </span>
                <span style={{ flex: 1, display: "flex", justifyContent: "flex-end", opacity: interpolate(frame, [96 + row * 8, 108 + row * 8], [0, 1], clamp) }}>
                  <Pill bg={C.lavenderSoft} color={C.purple} style={{ whiteSpace: "nowrap" }}>✓ Chainlink</Pill>
                </span>
              </div>
            );
          })}
        </Card>
      </Rise>
      <Rise start={110} distance={12} style={{ marginTop: 26 }}>
        <span style={{ fontSize: 24, color: C.faint }}>Hourly closes from each coin&apos;s USDG pool on Robinhood Chain · Oct 18 to Oct 24</span>
      </Rise>
    </AbsoluteFill>
  );
}

function Check() {
  const frame = useCurrentFrame();
  const flow = frame * 1.4;
  const gap = useProgress(62, 30);
  const box = (label: string, sub: string, value: string, start: number) => (
    <Rise start={start}>
      <Card style={{ width: 520, padding: "32px 40px" }}>
        <div style={{ fontSize: 20, color: C.faint, fontWeight: 500, letterSpacing: "0.06em" }}>{label}</div>
        <div style={{ marginTop: 6, fontSize: 24, color: C.muted }}>{sub}</div>
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 16 }}>
          <CoinAvatar coin="ETH" size={52} />
          <span style={{ fontSize: 56, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</span>
        </div>
      </Card>
    </Rise>
  );
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ marginTop: 300 }}>
        <Headline text="Every price, checked against *Chainlink.*" start={6} size={80} align="center" />
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 260, marginTop: 70 }}>
        {box("UNISWAP POOL", "WETH / USDG on Robinhood Chain", "$2,367.08", 14)}
        {box("CHAINLINK FEED", "ETH / USD, same block", "$2,370.08", 26)}
        {/* Dotted link between the two prices, with the gap in the middle. */}
        <svg width={260} height={20} style={{ position: "absolute", left: 520, top: "50%", marginTop: -10, opacity: interpolate(frame, [40, 50], [0, 1], clamp) }}>
          <path d="M0,10 L260,10" stroke={C.lavender} strokeWidth={4} strokeLinecap="round" strokeDasharray="2 14" strokeDashoffset={-flow} />
        </svg>
        <div style={{ position: "absolute", left: 520, width: 260, top: "50%", marginTop: -36, display: "flex", justifyContent: "center", opacity: gap, transform: `scale(${0.85 + gap * 0.15})` }}>
          <Pill bg={C.gainSoft} color={C.gain} style={{ fontSize: 26, padding: "10px 22px", boxShadow: "0 12px 30px -14px rgba(10, 154, 76, 0.5)" }}>
            0.13% apart ✓
          </Pill>
        </div>
      </div>
      <Rise start={86} distance={16} style={{ marginTop: 64 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: "18px 30px", borderRadius: 999, background: "#fff", border: `1px solid ${C.border}`, fontSize: 32, color: C.text }}>
          <span style={{ color: C.warn, fontWeight: 600 }}>More than 2% apart?</span> That hour is skipped, never traded.
        </span>
      </Rise>
    </AbsoluteFill>
  );
}

function Mix() {
  const frame = useCurrentFrame();
  const count = useProgress(78, 36);
  const chip = (symbol: string, picked: boolean, start: number, coin?: Coin) => {
    const on = picked && frame >= start + 14;
    return (
      <Rise key={symbol} start={start} distance={14}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 24px",
            borderRadius: 18,
            background: on ? C.lavenderSoft : "#fff",
            border: `2px solid ${on ? C.purple : C.border}`,
            fontSize: 30,
            fontWeight: 600,
            color: C.text,
          }}
        >
          {coin && <CoinAvatar coin={coin} size={34} />}
          {symbol}
        </span>
      </Rise>
    );
  };
  const group = (label: string, children: ReactNode) => (
    <div>
      <div style={{ fontSize: 22, color: C.faint, fontWeight: 600, marginBottom: 14 }}>{label}</div>
      <div style={{ display: "flex", gap: 14 }}>{children}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ marginTop: 270 }}>
        <Headline text="Mix stocks and *crypto* in one agent." start={6} size={80} align="center" />
      </div>
      <Rise start={12} style={{ marginTop: 50 }}>
        <Card style={{ width: 1300, padding: "36px 48px", display: "flex", gap: 56, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            {group("Stocks", [chip("NVDA", true, 18), chip("TSLA", false, 22), chip("AAPL", false, 26)])}
            {group("Crypto", [chip("ETH", true, 34, "ETH"), chip("BTC", false, 38, "BTC")])}
          </div>
          <div style={{ flex: 1, borderRadius: 24, background: C.light, padding: "28px 32px", opacity: interpolate(frame, [64, 76], [0, 1], clamp) }}>
            <div style={{ fontSize: 22, color: C.faint }}>Backtest · last 30 days · momentum</div>
            <div style={{ display: "flex", gap: 40, marginTop: 14 }}>
              <div>
                <div style={{ fontSize: 22, color: C.muted }}>NVDA + ETH agent</div>
                <div style={{ fontSize: 60, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>−{(4.8 * count).toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 22, color: C.muted }}>Holding instead</div>
                <div style={{ fontSize: 60, fontWeight: 600, color: C.faint, fontVariantNumeric: "tabular-nums" }}>−{(8.3 * count).toFixed(1)}%</div>
              </div>
            </div>
            <div style={{ marginTop: 14, fontSize: 24, color: C.gain, fontWeight: 600, opacity: interpolate(frame, [110, 120], [0, 1], clamp) }}>Lost less than holding: 3.5 points better</div>
          </div>
        </Card>
      </Rise>
      <Rise start={96} distance={12} style={{ marginTop: 26 }}>
        <span style={{ fontSize: 24, color: C.faint }}>Zolva Studio backtest, Oct 24 · paper trading · past results do not predict future ones</span>
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
        <TokenField focus={0.6} opacity={0.35} />
        <AbsoluteFill style={{ background: "radial-gradient(42% 46% at 50% 52%, rgba(18, 17, 22, 0.95), rgba(18, 17, 22, 0.6) 60%, transparent 100%)" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 20 }}>
        <Img src={staticFile("orb.png")} style={{ width: 170, height: 170, opacity: orb, transform: `scale(${0.7 + orb * 0.3})`, filter: "drop-shadow(0 30px 60px rgba(128, 117, 255, 0.55))" }} />
        <Headline text="Zolva" start={16} size={120} color={C.onDark} align="center" />
        <Headline text="Stocks *and crypto* agents, no code." start={26} size={44} color={C.onDarkMuted} accent={C.lavender} align="center" stagger={3} style={{ fontWeight: 500, letterSpacing: "-0.02em" }} />
        <Rise start={40} distance={16} style={{ marginTop: 16 }}>
          <span style={{ display: "inline-flex", padding: "14px 30px", borderRadius: 999, border: "1px solid rgba(152, 150, 255, 0.5)", background: "rgba(255, 255, 255, 0.04)", color: "#d0ceff", fontSize: 32, fontWeight: 500 }}>
            <Typed text="zolvaagent.app/markets" start={44} perFrame={1.2} />
          </span>
        </Rise>
        <Rise start={58} distance={12} style={{ marginTop: 10 }}>
          <span style={{ color: C.onDarkMuted, fontSize: 24 }}>Paper trading · ETH and BTC live · Onchain prices</span>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
