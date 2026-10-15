import "server-only";

import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison, so response timing never leaks how much of a secret matched. */
export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
