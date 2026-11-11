"use client";

import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ui/Providers";

/**
 * The Share button on an agent page: post on X with a prefilled text, copy the link, or save
 * the share card. The card is the page's own og:image (opengraph-image.tsx), read from the
 * meta tag because its URL carries a build hash.
 */
export function ShareMenu({ text, fileName }: { text: (url: string) => string; fileName: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on a click outside or Escape, like any menu.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pageUrl = () => `${window.location.origin}${window.location.pathname}`;

  const postOnX = () => {
    setOpen(false);
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text(pageUrl()))}`, "_blank", "noopener,noreferrer");
  };

  const copyLink = () => {
    setOpen(false);
    navigator.clipboard?.writeText(pageUrl()).then(
      () => toast("Link copied"),
      () => toast("Copy failed. Copy the address bar instead."),
    );
  };

  const downloadImage = async () => {
    const imageUrl = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
    if (!imageUrl) return toast("The share image is not available for this agent.");
    setSaving(true);
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await response.blob());
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);
      setOpen(false);
    } catch {
      toast("Could not make the image. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="share-menu" ref={rootRef}>
      <button className="button button--ghost" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <i className="ph ph-share-network" aria-hidden="true" />
        Share
      </button>
      {open && (
        <div className="share-menu__panel" role="menu">
          <button className="share-menu__item" type="button" role="menuitem" onClick={postOnX}>
            <i className="ph ph-x-logo" aria-hidden="true" />
            <span>
              Post on X<small>Opens X with the text and link filled in</small>
            </span>
          </button>
          <button className="share-menu__item" type="button" role="menuitem" onClick={copyLink}>
            <i className="ph ph-link" aria-hidden="true" />
            <span>Copy link</span>
          </button>
          <button className="share-menu__item" type="button" role="menuitem" onClick={downloadImage} disabled={saving}>
            <i className={`ph ${saving ? "ph-spinner-gap" : "ph-download-simple"}`} aria-hidden="true" />
            <span>
              Download image<small>{saving ? "Making the image…" : "The share card as a PNG"}</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
