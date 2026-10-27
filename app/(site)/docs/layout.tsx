import type { ReactNode } from "react";

import { DocsNav, DocsToc } from "@/components/site/Docs";

/** Docs pages: topics on the left, the page in the middle, its sections on the right. */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container page docs">
      <aside className="docs__side">
        <DocsNav />
      </aside>
      <div className="docs__main">{children}</div>
      <aside className="docs__toc">
        <DocsToc />
      </aside>
    </div>
  );
}
