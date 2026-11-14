"use client";

import { useState } from "react";

import { useToast } from "@/components/ui/Providers";

/** Clipboard API first; falls back to a hidden textarea where the API is blocked (older browsers, some webviews). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  }
}

/** A color chip that copies its hex on click. */
export function BrandSwatch({ name, hex, role }: { name: string; hex: string; role: string }) {
  const toast = useToast();
  return (
    <button
      className="brand-kit-swatch"
      type="button"
      onClick={async () => toast((await copyText(hex)) ? `Copied ${hex}` : "Couldn't copy, select the text instead")}
    >
      <span className="brand-kit-swatch__chip" style={{ background: hex }} />
      <span className="brand-kit-swatch__info">
        <span className="brand-kit-swatch__name">{name}</span>
        <span className="brand-kit-swatch__hex">{hex}</span>
        <span className="brand-kit-swatch__role">{role}</span>
      </span>
      <span className="sr-only">Copy {hex}</span>
    </button>
  );
}

/** "Copy" button for a block of press copy; shows "Copied" for a moment. */
export function BrandCopyButton({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`brand-kit-copy${copied ? " is-copied" : ""}`}
      type="button"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        if (!(await copyText(text))) {
          toast("Couldn't copy, select the text instead");
          return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
