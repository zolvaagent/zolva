import type { ParamRow } from "@/lib/docs-reference/schema";

/** A code block for docs pages. */
export function Code({ children }: { children: string }) {
  return (
    <pre className="docs-code">
      <code>{children}</code>
    </pre>
  );
}

/** The inputs of an API action or MCP tool (lib/docs-reference/schema.ts), or a note that it takes none. */
export function ParamTable({ rows, empty = "No inputs." }: { rows: ParamRow[]; empty?: string }) {
  if (!rows.length) return <p className="docs-params__empty">{empty}</p>;
  return (
    <div className="docs-table-wrap">
      <table className="docs-table">
        <thead>
          <tr>
            <th>Input</th>
            <th>What it is</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="docs-params__name">
                <code>{row.name}</code>
                <span className="docs-params__type">
                  {row.type}
                  {row.required && <strong> · required</strong>}
                </span>
              </td>
              <td>{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
