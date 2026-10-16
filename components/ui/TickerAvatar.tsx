import { tickerColor } from "@/lib/format";
import { STOCK_LOGOS } from "@/lib/stock-logos";

/**
 * A stock's company logo in a circle, or a colored monogram when there is no
 * good logo (ETFs, new tokens). Decorative: the ticker is always written next to it.
 */
export function TickerAvatar({ symbol, size }: { symbol: string; size?: number }) {
  const logo = STOCK_LOGOS[symbol];
  const sizing = size ? { width: size, height: size } : {};
  if (logo) {
    return (
      <span className="ticker-avatar ticker-avatar--logo" style={{ ...sizing, background: logo.background ?? "#fff" }} aria-hidden="true">
        <img src={logo.src} alt="" loading="lazy" decoding="async" />
      </span>
    );
  }
  return (
    <span className="ticker-avatar" style={{ background: tickerColor(symbol), ...sizing, ...(size ? { fontSize: Math.round(size / 3.2) } : {}) }} aria-hidden="true">
      {symbol.slice(0, 4)}
    </span>
  );
}
