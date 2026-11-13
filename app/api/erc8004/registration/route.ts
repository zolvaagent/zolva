import { registrationFile } from "@/lib/erc8004";

/**
 * Zolva's ERC-8004 registration file. Public at /.well-known/agent-registration.json through a
 * rewrite in next.config.ts (a route under a dot folder is not reliable, and static dotfiles may be
 * skipped by the asset upload).
 */
export function GET() {
  return Response.json(registrationFile(), {
    headers: {
      "Cache-Control": "public, max-age=300",
      // Registries and scanners fetch this from anywhere.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
