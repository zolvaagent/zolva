import type { ReactNode } from "react";

/**
 * A headline that reveals word by word (the `.words` animation). Parts in
 * `highlight` get the lavender gradient. Rendered on the server; the Motion
 * component only adds `is-visible` when it scrolls into view.
 */
export function Words({
  as: Tag = "h2",
  className,
  text,
  highlight,
}: {
  as?: "h1" | "h2" | "h3";
  className?: string;
  text: string;
  highlight?: string;
}) {
  let index = 0;
  const words = (value: string): ReactNode[] =>
    value
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => {
        const delay = index++ * 55;
        return (
          <span key={`${word}-${delay}`} className="word" style={{ transitionDelay: `${delay}ms` }}>
            {word}
          </span>
        );
      });

  const plain = words(text);
  const highlighted = highlight ? words(highlight) : [];
  return (
    <Tag className={`${className ?? ""} words`}>
      {join(plain)}
      {highlighted.length > 0 && (
        <>
          {" "}
          <span className="highlight">{join(highlighted)}</span>
        </>
      )}
    </Tag>
  );
}

function join(nodes: ReactNode[]): ReactNode[] {
  return nodes.flatMap((node, i) => (i === 0 ? [node] : [" ", node]));
}

/** Big statement whose words light up one at a time while scrolling. */
export function Tagline({ text }: { text: string }) {
  return (
    <p className="tagline" data-tagline>
      {join(
        text.split(/\s+/).map((word, i) => (
          <span key={i} className="tagline__word" style={{ transitionDelay: `${(i % 8) * 60}ms` }}>
            {word}
          </span>
        )),
      )}
    </p>
  );
}

/** Digits that roll into place like an odometer once visible. */
export function Odometer({ value }: { value: string }) {
  return (
    <span className="odometer" data-odometer aria-label={value}>
      {[...value].map((char, i) =>
        /\d/.test(char) ? (
          <span key={i} className="odometer__digit" data-digit={char} aria-hidden="true">
            {"0123456789".split("").map((digit) => (
              <span key={digit}>{digit}</span>
            ))}
          </span>
        ) : (
          <span key={i} aria-hidden="true">
            {char}
          </span>
        ),
      )}
    </span>
  );
}
