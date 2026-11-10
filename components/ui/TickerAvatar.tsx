import { tickerColor } from "@/lib/format";
import { STOCK_LOGOS } from "@/lib/stock-logos";

/**
 * A stock's company logo in a circle, or a colored monogram when there is no
 * good logo (ETFs, new tokens). Decorative: the ticker is always written next to it.
 */
/** Crypto coins use their Phosphor currency icon on the coin's brand color. */
const CRYPTO_ICONS: Record<string, { icon: string; background: string }> = {
  BTC: { icon: "ph-currency-btc", background: "#f7931a" },
  ETH: { icon: "ph-currency-eth", background: "#627eea" },
};

/**
 * Coins with a logo file. USDG (Global Dollar): the 32x32 token logo from
 * globaldollar.com/brand, which asks partners to use only that file. The coins behind
 * Lighter perps (SOL, HYPE, LIT, NEAR, XRP, ZEC): 250x250 images from CoinGecko's coin
 * pages (2026-11-10), checked by eye. `fill: false` keeps a bare mark (no round badge of
 * its own) inside the circle with some padding instead of filling it.
 */
const COIN_LOGOS: Record<string, { src: string; background?: string; fill?: boolean }> = {
  USDG: { src: "/img/coins/USDG.png", background: "transparent" },
  SOL: { src: "/img/coins/SOL.png", background: "#000000", fill: false },
  HYPE: { src: "/img/coins/HYPE.jpg", background: "#0f1a1f" },
  LIT: { src: "/img/coins/LIT.png", background: "#000000" },
  NEAR: { src: "/img/coins/NEAR.jpg", background: "#00ec97" },
  XRP: { src: "/img/coins/XRP.png", fill: false },
  ZEC: { src: "/img/coins/ZEC.png", background: "transparent" },
};

export function TickerAvatar({ symbol, size }: { symbol: string; size?: number }) {
  // A perp (BTC-PERP) shows its underlying's icon.
  const base = symbol.replace(/-PERP$/, "");
  const coinLogo = COIN_LOGOS[base];
  const logo = coinLogo ?? STOCK_LOGOS[base];
  const coin = CRYPTO_ICONS[base];
  const sizing = size ? { width: size, height: size } : {};
  if (coin) {
    return (
      <span className="ticker-avatar ticker-avatar--coin" style={{ ...sizing, background: coin.background, ...(size ? { fontSize: Math.round(size * 0.62) } : {}) }} aria-hidden="true">
        <i className={`ph-fill ${coin.icon}`} />
      </span>
    );
  }
  if (logo) {
    return (
      <span className={`ticker-avatar ticker-avatar--logo${coinLogo && coinLogo.fill !== false ? " ticker-avatar--token" : ""}`} style={{ ...sizing, background: logo.background ?? "#fff" }} aria-hidden="true">
        <img src={logo.src} alt="" loading="lazy" decoding="async" />
      </span>
    );
  }
  return (
    <span className="ticker-avatar" style={{ background: tickerColor(base), ...sizing, ...(size ? { fontSize: Math.round(size / 3.2) } : {}) }} aria-hidden="true">
      {base.slice(0, 4)}
    </span>
  );
}
