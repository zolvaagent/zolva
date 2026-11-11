import Image from "./opengraph-image";

// X reads twitter:image first, and the root layout sets the generic one, so agent pages override
// it with the same card. Next.js needs these route settings written here, not re-exported.
export const alt = "Zolva agent: return, P&L and value against holding";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default Image;
