"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Connect Zolva to your agent": a quiet text link under the "Ask about Zolva on" row that opens a
 * list of AI clients that can load Zolva's read-only MCP server (https://zolvaagent.app/mcp).
 * Cursor and VS Code take a one-click install link; the others copy the exact snippet, with where it
 * goes written on the row. Formats checked against each client's docs on 2026-11-13 (Cursor install
 * links, VS Code mcp/install, Claude Code CLI, Claude custom connectors, Antigravity mcp_config.json
 * with serverUrl, Hermes config.yaml).
 */
const MCP_URL = "https://zolvaagent.app/mcp";

/** Cursor install link: name plus the mcp.json entry, base64 encoded (Cursor docs, "MCP install links"). */
const cursorLink = () => `cursor://anysphere.cursor-deeplink/mcp/install?name=zolva&config=${encodeURIComponent(btoa(JSON.stringify({ url: MCP_URL })))}`;

/** VS Code install link: the server definition as URL-encoded JSON. */
const vscodeLink = () => `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "zolva", type: "http", url: MCP_URL }))}`;

type Client = { name: string; logo: string; mono: boolean; detail: string } & ({ kind: "install"; href: () => string } | { kind: "copy"; snippet: string });

const CLIENTS: Client[] = [
  { name: "Cursor", logo: "/ai-logos/cursor.svg", mono: true, detail: "One click install", kind: "install", href: cursorLink },
  { name: "VS Code", logo: "/ai-logos/githubcopilot.svg", mono: true, detail: "One click, for Copilot Chat", kind: "install", href: vscodeLink },
  { name: "Claude Code", logo: "/ai-logos/claudecode-color.svg", mono: false, detail: "Run in your terminal", kind: "copy", snippet: `claude mcp add --transport http zolva ${MCP_URL}` },
  { name: "Claude", logo: "/ai-logos/claude-color.svg", mono: false, detail: "Settings, Connectors, add custom connector", kind: "copy", snippet: MCP_URL },
  {
    name: "Antigravity",
    logo: "/ai-logos/antigravity-color.svg",
    mono: false,
    detail: "View raw config, add inside mcpServers",
    kind: "copy",
    snippet: `"zolva": { "serverUrl": "${MCP_URL}" }`,
  },
  { name: "Hermes", logo: "/ai-logos/hermesagent.svg", mono: true, detail: "~/.hermes/config.yaml, then /reload-mcp", kind: "copy", snippet: `mcp_servers:\n  zolva:\n    url: ${MCP_URL}` },
];

function Logo({ logo, mono }: { logo: string; mono: boolean }) {
  return mono ? (
    <span className="footer__ask-mono footer__connect-logo" style={{ maskImage: `url(${logo})`, WebkitMaskImage: `url(${logo})` }} aria-hidden="true" />
  ) : (
    <img className="footer__connect-logo" src={logo} alt="" width={20} height={20} />
  );
}

export function AddZolvaTo() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on a click outside or Escape.
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

  const copy = (client: Extract<Client, { kind: "copy" }>) =>
    navigator.clipboard?.writeText(client.snippet).then(
      () => {
        setCopied(client.name);
        setTimeout(() => setCopied(null), 2000);
      },
      () => setCopied(null),
    );

  return (
    <div className="footer__connect" ref={rootRef}>
      <button className="footer__connect-toggle" type="button" aria-expanded={open} aria-controls="connect-panel" onClick={() => setOpen((value) => !value)}>
        Connect Zolva to your agent
        <i className={`ph ${open ? "ph-x" : "ph-arrow-right"}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="footer__connect-panel" id="connect-panel">
          <p className="footer__connect-intro">
            Read only MCP server, no key: <code>{MCP_URL}</code>
          </p>
          <ul className="footer__connect-list">
            {CLIENTS.map((client) => (
              <li key={client.name} className="footer__connect-row">
                <Logo logo={client.logo} mono={client.mono} />
                <span className="footer__connect-name">{client.name}</span>
                <span className="footer__connect-detail">{client.detail}</span>
                {client.kind === "install" ? (
                  <a className="button button--small button--primary" href={client.href()}>
                    Install
                  </a>
                ) : (
                  <button className="button button--small button--ghost" type="button" onClick={() => copy(client)} title={client.snippet}>
                    <i className={`ph ${copied === client.name ? "ph-check" : "ph-copy"}`} aria-hidden="true" />
                    {copied === client.name ? "Copied" : "Copy"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
