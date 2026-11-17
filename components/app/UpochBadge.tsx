"use client";

import { useState } from "react";

import { upochMirror } from "@/lib/upoch";

/**
 * Upoch's small "Verified" badge, only on agents Upoch mirrors (lib/upoch.ts). The image comes from
 * our own cached route, and the badge hides itself if that route can't get it.
 */
export function UpochBadge({ agentId }: { agentId: string }) {
  const [failed, setFailed] = useState(false);
  const mirror = upochMirror(agentId);
  if (!mirror || failed) return null;
  return (
    <a
      className="upoch-badge"
      href={mirror.pageUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Upoch checkpoints this agent's published hourly decisions on Robinhood Chain. It checks the record wasn't edited later, not the results."
    >
      {/* Plain <img>: an SVG loaded as an image can't run scripts. */}
      <img src={mirror.badgePath} alt="Upoch checkpoints" width={220} height={20} loading="lazy" onError={() => setFailed(true)} />
    </a>
  );
}
