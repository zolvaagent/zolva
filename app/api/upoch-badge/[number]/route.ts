import { fetchUpochBadge, isUpochMirrorNumber } from "@/lib/upoch";

/**
 * Upoch's "Verified" badge for one mirrored agent, fetched server side so visitors never call
 * upoch.tech. Cached for 10 minutes at the edge; a failure returns 404 and the page hides the badge.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ number: string }> }) {
  const number = isUpochMirrorNumber((await params).number);
  if (number === null) return new Response("Not found", { status: 404 });

  const svg = await fetchUpochBadge(number);
  if (svg === null) {
    return new Response("Badge unavailable", { status: 404, headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
  }
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=600, s-maxage=600",
      // Someone could open this URL directly; the SVG must never run anything on our origin.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
