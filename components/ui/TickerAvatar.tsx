import { tickerColor } from "@/lib/format";

/** Colored monogram for a stock (real logos are trademarks, so we do not use them). */
export function TickerAvatar({ symbol, size }: { symbol: string; size?: number }) {
  return (
    <span className="ticker-avatar" style={{ background: tickerColor(symbol), ...(size ? { width: size, height: size, fontSize: Math.round(size / 3.2) } : {}) }} aria-hidden="true">
      {symbol.slice(0, 4)}
    </span>
  );
}
