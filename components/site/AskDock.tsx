"use client";

import { useEffect, useState } from "react";
import { AddZolvaTo } from "@/components/site/AddZolvaTo";
import { ASK_PROMPT, ASK_TARGETS } from "@/components/site/SiteChrome";

/** How far the visitor scrolls (px) before the dock slides in, so the hero stays clean. */
const SHOW_AFTER_SCROLL = 480;

/**
 * Landing page only: a floating, blurred dock at the bottom with the same "Ask about Zolva on"
 * tiles and "Connect Zolva to your agent" link as the footer. It hides again once the footer is
 * on screen, so the two never show at the same time.
 */
export function AskDock() {
  const [scrolled, setScrolled] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SHOW_AFTER_SCROLL);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const footer = document.querySelector(".footer");
    const observer = footer ? new IntersectionObserver(([entry]) => setFooterVisible(entry.isIntersecting)) : null;
    if (footer && observer) observer.observe(footer);

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, []);

  const visible = scrolled && !footerVisible;

  return (
    <aside className={visible ? "ask-dock is-visible" : "ask-dock"} aria-label="Ask about Zolva" aria-hidden={!visible} inert={!visible}>
      <span className="ask-dock__label">Ask Zolva</span>
      <div className="ask-dock__tiles">
        {ASK_TARGETS.map((target) => (
          <a
            key={target.name}
            className="footer__ask-link"
            href={target.href + encodeURIComponent(ASK_PROMPT)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Ask about Zolva on ${target.name}`}
            title={target.name}
          >
            {target.mono ? (
              <span className="footer__ask-mono" style={{ maskImage: `url(${target.logo})`, WebkitMaskImage: `url(${target.logo})` }} aria-hidden="true" />
            ) : (
              <img src={target.logo} alt="" width={20} height={20} />
            )}
          </a>
        ))}
      </div>
      <span className="ask-dock__divider" aria-hidden="true" />
      <AddZolvaTo floating />
    </aside>
  );
}
