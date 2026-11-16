/**
 * "How it trades": an agent's rules in plain words (lib/engine/summary.ts), built from its params,
 * so it always matches what the engine does. Used in the Studio launch dialog and on agent pages.
 */
export function RulesSummary({ lines, title = "How it trades" }: { lines: string[]; title?: string }) {
  return (
    <section className="rules-summary" aria-label={title}>
      <h3 className="rules-summary__title">{title}</h3>
      <ul className="rules-summary__list">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
