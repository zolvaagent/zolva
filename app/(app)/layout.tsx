import { AppSidebar, AppTabbar, AppTopbar } from "@/components/app/AppShell";

/** App pages: sidebar on desktop, top bar and tab bar on phones. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="is-app">
      <AppSidebar />
      <AppTopbar />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <AppTabbar />
    </div>
  );
}
