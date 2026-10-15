"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/ui/Providers";
import { shortAddress } from "@/lib/format";

const NAV = [
  { href: "/app", label: "Dashboard", icon: "squares-four" },
  { href: "/markets", label: "Markets", icon: "chart-line-up" },
  { href: "/forge", label: "Forge", icon: "sliders-horizontal" },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
  { href: "/activity", label: "Activity", icon: "pulse" },
];

function isCurrent(pathname: string, href: string) {
  return pathname === href || (href === "/app" && pathname.startsWith("/agents/")) || (href === "/markets" && pathname.startsWith("/markets/"));
}

function Avatar({ address }: { address: string | null }) {
  return address ? (
    <span className="avatar" aria-hidden="true">
      {address.slice(2, 3).toUpperCase()}
    </span>
  ) : (
    <span className="avatar avatar--empty" aria-hidden="true">
      <i className="ph ph-user" />
    </span>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { address, openLogin, logout } = useAuth();
  return (
    <aside className="app-side" aria-label="App">
      <Link className="brand" href="/">
        <img className="brand__mark" src="/img/icons/app.png" alt="" width={28} height={28} />
        Zolva
      </Link>
      <nav className="app-side__nav">
        {NAV.map((item, i) => (
          <span key={item.href} style={{ display: "contents" }}>
            {i === 1 && <span className="app-side__group">Explore</span>}
            <Link className="app-link" href={item.href} aria-current={isCurrent(pathname, item.href) ? "page" : undefined}>
              <i className={`ph ph-${item.icon}`} />
              {item.label}
            </Link>
          </span>
        ))}
        <span className="app-side__group">Zolva</span>
        <Link className="app-link" href="/">
          <i className="ph ph-house" />
          Home
        </Link>
        <Link className="app-link" href="/terms">
          <i className="ph ph-file-text" />
          Terms
        </Link>
      </nav>
      <div className="app-side__account">
        {address ? (
          <div className="account">
            <Avatar address={address} />
            <span className="account__text">
              <strong className="mono">{shortAddress(address)}</strong>
              <span>Wallet login</span>
            </span>
            <button className="privy__icon-button" type="button" aria-label="Log out" title="Log out" onClick={logout}>
              <i className="ph ph-sign-out" />
            </button>
          </div>
        ) : (
          <button className="button button--primary" type="button" style={{ width: "100%" }} onClick={() => openLogin(() => router.refresh())}>
            Log in
          </button>
        )}
      </div>
    </aside>
  );
}

export function AppTopbar() {
  const router = useRouter();
  const { address, openLogin } = useAuth();
  return (
    <header className="app-topbar">
      <Link className="brand" href="/app">
        <img className="brand__mark" src="/img/icons/app.png" alt="" width={28} height={28} />
        Zolva
      </Link>
      {address ? (
        <Link className="avatar-button" href="/app" aria-label="Open your dashboard">
          <Avatar address={address} />
        </Link>
      ) : (
        <button className="button button--primary button--small" type="button" onClick={() => openLogin(() => router.refresh())}>
          Log in
        </button>
      )}
    </header>
  );
}

export function AppTabbar() {
  const pathname = usePathname();
  return (
    <nav className="app-tabbar" aria-label="App">
      {NAV.map((item) => (
        <Link key={item.href} href={item.href} aria-current={isCurrent(pathname, item.href) ? "page" : undefined}>
          <i className={`ph ph-${item.icon}`} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
