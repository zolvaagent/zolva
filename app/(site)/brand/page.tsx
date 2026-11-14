import type { Metadata } from "next";
import type { ReactNode } from "react";

import { BrandCopyButton, BrandSwatch } from "@/components/site/BrandKit";
import { X_HANDLE, X_URL } from "@/lib/social";

export const metadata: Metadata = {
  title: "Brand kit",
  description: "Zolva logos, colors and copy for listings, press and partners.",
};

/** Press contact. null hides the row until a real mailbox exists. */
const PRESS_EMAIL: string | null = null;

// Files live in public/brand/, mirroring the folders of zolva-logos.zip.
// Sources and rebuild scripts: assets/brand/logo-v2/ (build-zip.py rebuilds the zip).
type Asset = { name: string; use: string; svg: string; png: string; ground: "light" | "dark" | "panel"; alt: string };

const MARKS: Asset[] = [
  { name: "Ink", use: "Default, on light backgrounds", svg: "/brand/mark/zolva-mark-ink.svg", png: "/brand/mark/zolva-mark-ink-1024.png", ground: "light", alt: "Zolva mark in ink on white" },
  { name: "White", use: "On dark backgrounds and photos", svg: "/brand/mark/zolva-mark-white.svg", png: "/brand/mark/zolva-mark-white-1024.png", ground: "dark", alt: "Zolva mark in white on dark" },
  { name: "Black", use: "One-color print", svg: "/brand/mark/zolva-mark-black.svg", png: "/brand/mark/zolva-mark-black-1024.png", ground: "light", alt: "Zolva mark in black on white" },
  { name: "Lavender", use: "Accent, on dark only", svg: "/brand/mark/zolva-mark-lavender.svg", png: "/brand/mark/zolva-mark-lavender-1024.png", ground: "dark", alt: "Zolva mark in lavender on dark" },
  { name: "Gradient", use: "Large sizes, app and token icons", svg: "/brand/mark/zolva-mark-gradient.svg", png: "/brand/mark/zolva-mark-gradient-1024.png", ground: "panel", alt: "Zolva mark with the indigo gradient" },
  { name: "Small sizes", use: "Favicons and anything under 32px", svg: "/brand/mark-small-sizes/logo-zolva-small-s1.svg", png: "/brand/mark-small-sizes/logo-zolva-small-s1-1024.png", ground: "light", alt: "Zolva mark drawn for small sizes" },
];

const SQUARES: Asset[] = [
  { name: "Square, black", use: "Listing forms that crop to a square", svg: "/brand/mark-square/logo-zolva-black.svg", png: "/brand/mark-square/logo-zolva-black-1024.png", ground: "light", alt: "Zolva mark in black on a padded square canvas" },
  { name: "Square, white", use: "The same, on dark", svg: "/brand/mark-square/logo-zolva-white.svg", png: "/brand/mark-square/logo-zolva-white-1024.png", ground: "dark", alt: "Zolva mark in white on a padded square canvas" },
];

const LOCKUPS: Asset[] = [
  { name: "Lockup, ink", use: "Mark with the name in Inter Semibold", svg: "/brand/lockup/zolva-lockup-ink.svg", png: "/brand/lockup/zolva-lockup-ink-2400.png", ground: "light", alt: "Zolva lockup in ink" },
  { name: "Lockup, white", use: "The same, on dark", svg: "/brand/lockup/zolva-lockup-white.svg", png: "/brand/lockup/zolva-lockup-white-2400.png", ground: "dark", alt: "Zolva lockup in white" },
];

// Values from app/globals.css :root.
const COLORS = [
  { name: "Ink", hex: "#252228", role: "Text and the mark" },
  { name: "White", hex: "#FFFFFF", role: "Canvas" },
  { name: "Night", hex: "#121116", role: "Dark panels and dark mode" },
  { name: "Lavender", hex: "#9896FF", role: "Accent" },
  { name: "Deep lavender", hex: "#8075FF", role: "Accent on light, glows" },
  { name: "Lavender tint", hex: "#E5E5FF", role: "Highlights and badges" },
];

const COPY = [
  {
    id: "one-line",
    label: "One line",
    variant: "lead",
    text: "Zolva lets anyone build trading agents for tokenized US stocks and crypto on Robinhood Chain, without writing code.",
  },
  {
    id: "about",
    label: "About Zolva",
    variant: "",
    text: "Zolva is open-source trading agent software on Robinhood Chain. You describe a strategy for tokenized US stocks, ETFs or crypto, test it on the last 30 days of real onchain prices, and run it on paper. Each agent decides once an hour and writes down why in plain words. Published agents show every trade, and each one is compared with simply holding the same markets. Zolva is built on Robinhood Chain but is not affiliated with or endorsed by Robinhood.",
  },
  {
    id: "disclaimer",
    label: "Disclaimer",
    variant: "legal",
    text: "Paper trading on Zolva uses virtual money at real prices. Paper results and backtests are hypothetical and do not show real trades or future returns. Nothing on Zolva is investment advice.",
  },
];

const SECTIONS = [
  { id: "logo", label: "Logo" },
  { id: "colors", label: "Colors" },
  { id: "copy", label: "Copy" },
  { id: "usage", label: "Usage" },
  { id: "contact", label: "Contact" },
];

/** The mark's path (assets/brand/logo-v2/marks/zolva-mark-ink.svg), drawn in currentColor for the usage examples. */
function Mark({ className = "" }: { className?: string }) {
  return (
    <svg className={`brand-kit-mark ${className}`.trim()} viewBox="186.63 187.38 627.24 627.24" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M801.376 371.373L718.376 288.373C712.374 282.371 704.235 279 695.748 279H308.258C299.771 279 291.632 282.371 285.63 288.373L201.13 372.873C188.634 385.369 188.634 405.631 201.13 418.127L259.376 476.373C271.872 488.869 271.872 509.131 259.376 521.627L199.13 581.873C186.634 594.369 186.634 614.631 199.13 627.127L285.63 713.627C291.632 719.629 299.771 723 308.258 723H694.748C703.235 723 711.374 719.629 717.376 713.627L801.376 629.627C813.872 617.131 813.872 596.869 801.376 584.373L740.13 523.127C727.634 510.631 727.634 490.369 740.13 477.873L801.376 416.627C813.872 404.131 813.872 383.869 801.376 371.373ZM306.317 311.686L254.074 363.929C247.774 370.229 252.236 381 261.145 381H402.376C416.63 381 423.769 398.234 413.689 408.314L230.97 591.033C224.472 597.531 224.77 608.154 231.623 614.277L301.724 676.921C308.053 682.577 317.697 682.306 323.699 676.304L665.689 334.314C675.769 324.234 668.63 307 654.376 307H317.63C313.387 307 309.317 308.686 306.317 311.686ZM691.846 526.657L642.16 576.343C637.12 581.383 640.689 590 647.817 590H747.189C754.317 590 757.886 581.383 752.846 576.343L703.16 526.657C700.036 523.533 694.97 523.533 691.846 526.657Z"
      />
    </svg>
  );
}

function AssetTiles({ assets, wide = false, lockup = false }: { assets: Asset[]; wide?: boolean; lockup?: boolean }) {
  return (
    <ul className={`brand-kit-assets${wide ? " brand-kit-assets--wide" : ""}`}>
      {assets.map((asset) => (
        <li key={asset.svg} className="brand-kit-asset">
          <div className={`brand-kit-asset__preview brand-kit-asset__preview--${asset.ground}`}>
            <img className={lockup ? "is-lockup" : undefined} src={asset.svg} alt={asset.alt} width={lockup ? 240 : 96} height={lockup ? 48 : 96} />
          </div>
          <div className="brand-kit-asset__body">
            <h4 className="brand-kit-asset__name">{asset.name}</h4>
            <p className="brand-kit-asset__use">{asset.use}</p>
            <div className="brand-kit-asset__links">
              <a className="brand-kit-file" href={asset.svg} download aria-label={`${asset.name}, SVG`}>
                <i className="ph ph-download-simple" aria-hidden="true" />
                SVG
              </a>
              <a className="brand-kit-file" href={asset.png} download aria-label={`${asset.name}, PNG`}>
                <i className="ph ph-download-simple" aria-hidden="true" />
                PNG
              </a>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Section({ index, id, title, lead, children }: { index: number; id: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section className="brand-kit-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="brand-kit-section__head">
        <span className="brand-kit-section__number">{String(index).padStart(2, "0")}</span>
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{lead}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

/** /brand: press kit with logos, colors, copy and usage rules. Approved design: prototype/brand.html. */
export default function BrandPage() {
  return (
    <div className="container page brand-kit">
      <section className="brand-kit-intro" aria-labelledby="page-title">
        <span className="eyebrow">Press kit</span>
        <h1 id="page-title">Zolva brand kit</h1>
        <p className="brand-kit-intro__lead">Logos, colors and copy for listings, press and partners. Use them as they are; if you need a format that isn&apos;t here, ask us.</p>
        <div className="brand-kit-intro__actions">
          <a className="button button--primary" href="/brand/zolva-logos.zip" download>
            <i className="ph ph-download-simple" aria-hidden="true" />
            Download all (ZIP)
          </a>
          <span className="brand-kit-intro__note">SVG and PNG, every logo on this page (420 KB)</span>
        </div>
        <ol className="brand-kit-toc" aria-label="On this page">
          {SECTIONS.map((section, index) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {section.label}
              </a>
            </li>
          ))}
        </ol>
      </section>

      <Section index={1} id="logo" title="Logo" lead="The mark on its own works for avatars and token icons. Use the lockup where the name needs to read.">
        <h3 className="brand-kit-subhead">Mark</h3>
        <AssetTiles assets={MARKS} />
        <h3 className="brand-kit-subhead">Mark on a square canvas, with clear space built in</h3>
        <AssetTiles assets={SQUARES} wide />
        <h3 className="brand-kit-subhead">Lockup</h3>
        <AssetTiles assets={LOCKUPS} wide lockup />
      </Section>

      <Section index={2} id="colors" title="Colors" lead="Mostly ink and white, with lavender as the one accent. Click a swatch to copy its hex.">
        <ul className="brand-kit-swatches">
          {COLORS.map((color) => (
            <li key={color.hex}>
              <BrandSwatch {...color} />
            </li>
          ))}
        </ul>
        <p className="brand-kit-note">Type is Inter, Semibold for headings and Regular for text.</p>
      </Section>

      <Section index={3} id="copy" title="Copy" lead="Ready to paste. If you shorten it, keep the disclaimer.">
        <dl className="brand-kit-copy-list">
          {COPY.map((block) => (
            <div key={block.id} className={`brand-kit-copy-block${block.variant ? ` brand-kit-copy-block--${block.variant}` : ""}`}>
              <div className="brand-kit-copy-block__head">
                <dt>{block.label}</dt>
                <BrandCopyButton text={block.text} label={block.label} />
              </div>
              <dd>{block.text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section index={4} id="usage" title="Usage" lead="Three rules. Everything else is up to you.">
        <ol className="brand-kit-rules">
          <li className="brand-kit-rule">
            <h3>Keep the proportions</h3>
            <p>Scale the mark evenly. Never stretch, squash or rotate it.</p>
            <div className="brand-kit-compare">
              <figure>
                <div className="brand-kit-compare__stage">
                  <Mark />
                </div>
                <figcaption>
                  <span className="brand-kit-verdict brand-kit-verdict--do" />
                  Do
                </figcaption>
              </figure>
              <figure>
                <div className="brand-kit-compare__stage">
                  <Mark className="is-stretched" />
                </div>
                <figcaption>
                  <span className="brand-kit-verdict brand-kit-verdict--dont" />
                  Don&apos;t stretch
                </figcaption>
              </figure>
            </div>
          </li>
          <li className="brand-kit-rule">
            <h3>Use the colors provided</h3>
            <p>The mark comes in ink, white, black, lavender and the gradient. Don&apos;t recolor it or add effects.</p>
            <div className="brand-kit-compare">
              <figure>
                <div className="brand-kit-compare__stage">
                  <Mark />
                </div>
                <figcaption>
                  <span className="brand-kit-verdict brand-kit-verdict--do" />
                  Do
                </figcaption>
              </figure>
              <figure>
                <div className="brand-kit-compare__stage is-recolored">
                  <Mark />
                </div>
                <figcaption>
                  <span className="brand-kit-verdict brand-kit-verdict--dont" />
                  Don&apos;t recolor
                </figcaption>
              </figure>
            </div>
          </li>
          <li className="brand-kit-rule">
            <h3>Give it room</h3>
            <p>Keep clear space of at least 30% of the mark&apos;s width on every side, the same margin as the square files.</p>
            <div className="brand-kit-compare">
              <figure>
                <div className="brand-kit-compare__stage">
                  <span className="brand-kit-clear-space">
                    <Mark />
                  </span>
                </div>
                <figcaption>
                  <span className="brand-kit-verdict brand-kit-verdict--do" />
                  Do
                </figcaption>
              </figure>
              <figure>
                <div className="brand-kit-compare__stage">
                  <span className="brand-kit-crowded" aria-hidden="true">
                    <span className="brand-kit-crowded__other">Partner</span>
                    <Mark />
                    <span className="brand-kit-crowded__other">Logo</span>
                  </span>
                </div>
                <figcaption>
                  <span className="brand-kit-verdict brand-kit-verdict--dont" />
                  Don&apos;t crowd it
                </figcaption>
              </figure>
            </div>
          </li>
        </ol>
      </Section>

      <Section index={5} id="contact" title="Contact" lead="For press, listings and anything this page doesn't cover.">
        <dl className="brand-kit-contact">
          <div className="brand-kit-contact__row">
            <dt>X</dt>
            <dd>
              <a href={X_URL} target="_blank" rel="noopener noreferrer">
                @{X_HANDLE}
              </a>
            </dd>
          </div>
          {PRESS_EMAIL && (
            <div className="brand-kit-contact__row">
              <dt>Press</dt>
              <dd>
                <a href={`mailto:${PRESS_EMAIL}`}>{PRESS_EMAIL}</a>
              </dd>
            </div>
          )}
        </dl>
      </Section>
    </div>
  );
}
