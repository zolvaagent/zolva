import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site/SiteChrome";

/** Docs: the site header without the marketing footer, so reading pages stay quiet. */
export default function DocsGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
