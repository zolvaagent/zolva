"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { useAuth, useToast } from "@/components/ui/Providers";

const LINKS = [
  { href: "/markets", label: "Markets" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/forge", label: "Forge" },
  { href: "/app", label: "Dashboard" },
];

/** "Go to app": straight to the dashboard when logged in, otherwise log in first. */
export function GoToAppButton({ className = "button button--primary button--small", label }: { className?: string; label?: string }) {
  const { address, openLogin } = useAuth();
  const router = useRouter();
  return (
    <button className={className} type="button" onClick={() => (address ? router.push("/app") : openLogin(() => router.push("/app")))}>
      {label ?? (address ? "Open app" : "Go to app")}
      <i className="ph ph-arrow-right" />
    </button>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Transparent at the top, blurred white once the page scrolls.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > 8));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);
    return () => document.body.classList.remove("menu-open");
  }, [menuOpen]);

  return (
    <>
      <header className={`nav${scrolled ? " is-scrolled" : ""}`}>
        <nav className="container nav__bar" aria-label="Main">
          <Link className="brand" href="/">
            <img className="brand__mark" src="/img/icons/app.png" alt="" width={28} height={28} />
            Sita
          </Link>
          <ul className="nav__links">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link className="nav__link" href={link.href} aria-current={pathname === link.href ? "page" : undefined}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="nav__actions">
            <GoToAppButton />
            <button className="nav__menu-button" type="button" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="menu-overlay" onClick={() => setMenuOpen((open) => !open)}>
              <span className="nav__menu-line" />
              <span className="nav__menu-line" />
            </button>
          </div>
        </nav>
      </header>
      <div className="menu-overlay" id="menu-overlay" onClick={(event) => (event.target as HTMLElement).closest("a") && setMenuOpen(false)}>
        <Link href="/">Home</Link>
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
    </>
  );
}

export function SiteFooter() {
  const toast = useToast();
  const [error, setError] = useState(false);

  // Newsletter: not connected to an email provider yet, so nothing is stored.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("email") as HTMLInputElement;
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
    setError(!valid);
    if (!valid) return input.focus();
    input.value = "";
    toast("Thanks. Updates by email start soon.");
  };

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__news">
          <div>
            <h2 className="footer__news-title">Stay updated</h2>
            <p>New strategies, live trading news and the best agents of the week. One email a month.</p>
          </div>
          <form className="footer__form" noValidate onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="newsletter-email">
              Email address
            </label>
            <input className="input" id="newsletter-email" name="email" type="email" placeholder="your@email.com" autoComplete="email" aria-invalid={error} />
            <button className="button button--primary" type="submit">
              Notify me
            </button>
            {error && <span className="field-error">Enter a valid email address.</span>}
          </form>
        </div>

        <div className="footer__grid">
          <div className="footer__brand">
            <Link className="brand" href="/">
              <img className="brand__mark" src="/img/icons/app.png" alt="" width={28} height={28} />
              Sita
            </Link>
            <p>No code trading agents for tokenized US stocks on Robinhood Chain.</p>
            <span className="footer__status">
              <span className="pulse" />
              Prices updated hourly
            </span>
          </div>
          <div className="footer__col">
            <h3>Product</h3>
            <Link href="/app">Dashboard</Link>
            <Link href="/markets">Markets</Link>
            <Link href="/forge">Forge</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/activity">Activity</Link>
          </div>
          <div className="footer__col">
            <h3>Strategies</h3>
            <Link href="/forge?strategy=momentum">Momentum</Link>
            <Link href="/forge?strategy=mean_reversion">Mean reversion</Link>
            <Link href="/forge?strategy=custom">Build your own</Link>
          </div>
          <div className="footer__col">
            <h3>Legal</h3>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>

        <div className="footer__bottom">
          <span>© 2026 Sita. Paper trading only. Nothing here is investment advice.</span>
          <span>Not available to US persons or residents of sanctioned countries.</span>
        </div>
      </div>
      <div className="footer__wordmark" aria-hidden="true">
        Sita
      </div>
    </footer>
  );
}
