import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Motion } from "@/components/ui/Motion";
import { Providers } from "@/components/ui/Providers";
import { getSessionAddress } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  // Absolute URLs in share cards point at the main domain.
  metadataBase: new URL("https://zolvaagent.app"),
  // The home tab reads "Zolva | <slogan>"; other pages stay "<page> · Zolva".
  title: { default: "Zolva | Trading agents that show their work", template: "%s · Zolva" },
  description:
    "Build a trading agent in plain words. It trades stock tokens, ETH and BTC on Robinhood Chain and explains every decision. Paper trading, no code.",
  applicationName: "Zolva",
  icons: {
    // Logo set from scripts/render-brand.mjs; the SVG stays sharp at every tab size.
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/img/brand/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/img/brand/zolva-mark.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/img/brand/apple-touch-icon.png",
  },
  // Share card: public/og.png, rendered from assets/brand/og-image.html.
  openGraph: {
    type: "website",
    siteName: "Zolva",
    url: "/",
    title: "Zolva | Trading agents that show their work",
    description: "No code trading agents for stock tokens, ETH and BTC on Robinhood Chain. Every decision explained.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Zolva: trading agents that show their work" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@zolva_agent",
    title: "Zolva | Trading agents that show their work",
    description: "No code trading agents for stock tokens, ETH and BTC on Robinhood Chain. Every decision explained.",
    images: ["/og.png"],
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const address = await getSessionAddress();
  // Public value; null keeps login wallet-only until Privy is configured.
  const privyAppId = env.privy?.appId ?? null;
  return (
    // The theme script sets data-theme before React hydrates, so the attribute may differ from the server HTML.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Phosphor icon font (same build as the approved prototype). */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/regular/style.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/fill/style.css" />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Providers initialAddress={address} privyAppId={privyAppId}>{children}</Providers>
        <Motion />
      </body>
    </html>
  );
}
