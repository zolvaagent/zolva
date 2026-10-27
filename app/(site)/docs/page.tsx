import { redirect } from "next/navigation";

import { DOC_PAGES, docHref } from "@/lib/docs";

/** /docs opens the first page. */
export default function DocsIndex() {
  redirect(docHref(DOC_PAGES[0].slug));
}
