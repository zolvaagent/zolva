"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Scroll animations for server-rendered markup: fade-ups (.reveal), word
 * headlines (.words), rising phones ([data-phones]), rolling digits
 * ([data-odometer]) and the word-by-word tagline. It only adds classes and
 * transforms; the CSS does the motion. Re-runs after every navigation.
 */
export function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          // Odometer digits roll to their value: one digit column is 10 rows tall.
          entry.target.querySelectorAll<HTMLElement>("[data-digit]").forEach((digit) => {
            digit.style.transform = `translateY(-${Number(digit.dataset.digit)}em)`;
          });
          reveal.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    document.querySelectorAll(".reveal, .words, [data-phones], [data-odometer]").forEach((element) => reveal.observe(element));

    // Tagline words light up as they cross a line 40% up from the bottom.
    const words = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-lit");
          words.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -40% 0px" },
    );
    document.querySelectorAll(".tagline__word").forEach((word) => words.observe(word));

    return () => {
      reveal.disconnect();
      words.disconnect();
    };
  }, [pathname]);

  return null;
}

/** Adds a class to <body> while mounted (e.g. "is-app" for the app shell styles). */
export function BodyClass({ name }: { name: string }) {
  useEffect(() => {
    document.body.classList.add(name);
    return () => document.body.classList.remove(name);
  }, [name]);
  return null;
}
