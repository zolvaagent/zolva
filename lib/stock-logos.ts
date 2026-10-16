/**
 * Company logos for the stock tokens, shown to identify each stock (the way
 * finance sites do). Files live in public/img/stocks and were checked by eye
 * one by one on 2026-10-16, because logo services look up by ticker and can
 * pick the wrong company (a ticker lookup for SPCX can return a SPAC ETF
 * instead of SpaceX).
 *
 * Source: financialmodelingprep.com/image-stock/<SYMBOL>.png. Robinhood's own
 * logo CDN was unreachable from our network, and GeckoTerminal only has the
 * Robinhood feather for every token.
 *
 * ETFs (SPY, QQQ, GLD, USO) keep the monogram: their issuer logos (SPDR,
 * Invesco, USCF) don't tell one fund from another.
 *
 * `background` sits behind logos drawn in white or for dark backgrounds.
 */
export const STOCK_LOGOS: Record<string, { src: string; background?: string }> = {
  AAPL: { src: "/img/stocks/AAPL.png" },
  AMC: { src: "/img/stocks/AMC.png" },
  AMZN: { src: "/img/stocks/AMZN.png", background: "#232f3e" },
  BABA: { src: "/img/stocks/BABA.png" },
  CRCL: { src: "/img/stocks/CRCL.png" },
  GME: { src: "/img/stocks/GME.png", background: "#000000" },
  GOOGL: { src: "/img/stocks/GOOGL.png" },
  META: { src: "/img/stocks/META.png" },
  MSTR: { src: "/img/stocks/MSTR.png" },
  MU: { src: "/img/stocks/MU.png" },
  NVDA: { src: "/img/stocks/NVDA.png" },
  PLTR: { src: "/img/stocks/PLTR.png" },
  RDDT: { src: "/img/stocks/RDDT.png" },
  SPCX: { src: "/img/stocks/SPCX.png", background: "#000000" },
  TSLA: { src: "/img/stocks/TSLA.png" },
  TSM: { src: "/img/stocks/TSM.png" },
};
