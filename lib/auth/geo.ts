/**
 * Who may use Zolva. Robinhood Stock Tokens may not be offered to US persons
 * (Regulation S), and comprehensively sanctioned countries are excluded.
 *
 * UK, Canada, Switzerland and UAE also restrict stock tokens; they are NOT
 * blocked yet because Zolva is paper trading only. Decide before live trading
 * (docs/tasks.md).
 */
export const BLOCKED_COUNTRIES = new Set(["US", "CU", "IR", "KP", "SY"]);

/** Cloudflare sets cf-ipcountry on every request; it is missing in local dev. */
export function countryFromHeaders(headers: Headers): string | null {
  const country = headers.get("cf-ipcountry");
  return country && /^[A-Z]{2}$/.test(country) ? country : null;
}

export function isBlockedCountry(country: string | null): boolean {
  return country !== null && BLOCKED_COUNTRIES.has(country);
}

export const BLOCKED_MESSAGE = "Zolva is not available in your country. Stock tokens are not offered to US persons or in sanctioned countries.";
