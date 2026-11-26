"use client";

import { useEffect, useState } from "react";

const VERSIONS = [
  { id: "v1", label: "v1", note: "live" },
  { id: "v2", label: "v2", note: "next" },
];

/**
 * Sticky v1 / v2 anchors on /roadmap. aria-current marks the last section whose top has
 * passed a line 40% down the screen, and falls back to v1 above both (the hero).
 */
export function RoadmapSwitch() {
  const [current, setCurrent] = useState(VERSIONS[0].id);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const line = window.innerHeight * 0.4;
      let next = VERSIONS[0].id;
      for (const { id } of VERSIONS) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= line) next = id;
      }
      setCurrent(next);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <nav className="roadmap-switch" aria-label="Roadmap version">
      {VERSIONS.map((version) => (
        <a key={version.id} href={`#${version.id}`} aria-current={current === version.id ? "true" : undefined}>
          {version.label} <small>{version.note}</small>
        </a>
      ))}
    </nav>
  );
}
