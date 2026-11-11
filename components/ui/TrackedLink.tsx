"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { track, type FunnelEvent } from "@/lib/funnel";

/** A Link that records one funnel step when clicked (lib/funnel.ts); usable from server components. */
export function TrackedLink({ event, detail, onClick, ...props }: ComponentProps<typeof Link> & { event: FunnelEvent; detail?: string }) {
  return (
    <Link
      {...props}
      onClick={(clickEvent) => {
        track(event, detail);
        onClick?.(clickEvent);
      }}
    />
  );
}
