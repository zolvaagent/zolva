/** Display formatting shared by server and client components. */

const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const usd = (value: number) => usdFormat.format(value);

/** Token price: cents above $10, four significant digits below. */
export const price = (value: number) => (value >= 10 ? usd(value) : `$${value.toPrecision(4)}`);

/** "+4.5%", "−2.0%" (true minus sign), "0.0%". */
export function percent(value: number, { signed = true, digits = 1 }: { signed?: boolean; digits?: number } = {}): string {
  const fixed = Math.abs(value).toFixed(digits);
  if (!signed || Number(fixed) === 0) return `${fixed}%`;
  return `${value > 0 ? "+" : "−"}${fixed}%`;
}

/** Percentage points versus holding: "+1.3 pts". */
export const points = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)} pts`;

/** CSS class for a gain or loss; empty for roughly zero. */
export const tone = (value: number) => (value > 0.05 ? "gain" : value < -0.05 ? "loss" : "");

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** "Oct 15, 07:00 UTC" from unix seconds. */
export const dateAt = (unixSeconds: number) => `${dateFormat.format(unixSeconds * 1000)} UTC`;

/** "Oct 15" from unix seconds. */
export const dayAt = (unixSeconds: number) => dayFormat.format(unixSeconds * 1000);

export const STRATEGY_NAMES: Record<string, string> = { momentum: "Momentum", mean_reversion: "Mean reversion", custom: "Custom" };

/** US regular session is roughly 13:30 to 20:00 UTC on weekdays; outside it prices come from DEX trading only. */
export function isMarketHours(unixSeconds: number): boolean {
  const date = new Date(unixSeconds * 1000);
  const day = date.getUTCDay();
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return day >= 1 && day <= 5 && minutes >= 13 * 60 + 30 && minutes < 20 * 60;
}

/** Stable color per ticker for monogram avatars (stock logos are trademarks). */
export function tickerColor(symbol: string): string {
  const palette = ["#8075ff", "#252228", "#1c4886", "#0a9a4c", "#e04400", "#4c1f5e", "#2775ca", "#c18fff", "#26a17b", "#9c8cff"];
  const hash = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

/** SVG polyline points for a sparkline in a 100 x height box. */
export function sparkline(values: number[], height = 40, every = 1): string {
  const list = values.filter((_, i) => i % every === 0 || i === values.length - 1);
  if (list.length < 2) return "";
  const min = Math.min(...list);
  const max = Math.max(...list);
  return list
    .map((value, i) => `${((i / (list.length - 1)) * 100).toFixed(1)},${(height - 2 - ((value - min) / (max - min || 1)) * (height - 6)).toFixed(1)}`)
    .join(" ");
}
