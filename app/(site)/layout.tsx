import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

/** Marketing pages: floating header and the full footer. */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
