"use client";

import Link from "next/link";
import { useState } from "react";

import { useToast } from "@/components/ui/Providers";
import { API_KEY_SCOPES, DEFAULT_SCOPES, MAX_KEYS_PER_ACCOUNT, SCOPE_LABELS, type ApiKeyScope } from "@/lib/api-keys/keys";
import type { ApiKeyEventRow, ApiKeyRow } from "@/lib/api-keys/server";
import { dateAt } from "@/lib/format";

/** Plain words for the audit log's action names. */
const ACTION_LABELS: Record<string, string> = {
  create_paper_agent: "Create agent",
  pause_agent: "Pause",
  resume_agent: "Resume",
  publish_agent: "Publish",
  unpublish_agent: "Unpublish",
  set_ai_limit: "AI limit",
  write_strategy: "AI strategy",
  backtest: "Backtest",
  pause_live_agent: "Stop real money agent",
};

const RESULT_LABELS: Record<string, string> = { ok: "Done", preview: "Preview", error: "Refused", pending: "Running" };

const at = (iso: string) => dateAt(Date.parse(iso) / 1000);

/**
 * Dashboard "API keys" card: make a key with scopes (its secret is shown once), revoke
 * one, see when each was last used and what keys did lately (api_key_events).
 */
export function ApiKeysCard({ initialKeys, initialEvents }: { initialKeys: ApiKeyRow[]; initialEvents: ApiKeyEventRow[] }) {
  const toast = useToast();
  const [keys, setKeys] = useState(initialKeys);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(DEFAULT_SCOPES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const toggleScope = (scope: ApiKeyScope, on: boolean) => setScopes((current) => (on ? [...current, scope] : current.filter((item) => item !== scope)));

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, scopes }) });
      const body = (await response.json().catch(() => ({}))) as { key?: ApiKeyRow; secret?: string; error?: string };
      if (!response.ok || !body.key || !body.secret) throw new Error(body.error ?? "Making the key failed. Please try again.");
      setKeys((current) => [body.key!, ...current]);
      setSecret(body.secret);
      setCreating(false);
      setName("");
      setScopes(DEFAULT_SCOPES);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Revoking failed. Please try again.");
      setKeys((current) => current.filter((key) => key.id !== id));
      setConfirmRevoke(null);
      toast("Key revoked. It stops working right away.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      toast("Key copied.");
    } catch {
      toast("Copy failed. Select the key and copy it by hand.");
    }
  };

  return (
    <section className="card stack stack--tight" aria-labelledby="api-keys-title">
      <div className="card-head" style={{ margin: 0 }}>
        <h2 className="card__title" id="api-keys-title">
          API keys
        </h2>
        <i className="ph ph-key" style={{ color: "var(--color-purple-rich)", fontSize: 22 }} aria-hidden="true" />
      </div>
      <p className="muted api-keys__note">
        Let an AI assistant (Claude Code, Cursor) or your own script use your account through the <Link href="/docs/mcp">MCP server</Link> or the{" "}
        <Link href="/docs/public-api">API</Link>. Paper agents only; the one real money action is stopping an agent.
      </p>

      {secret && (
        <div className="api-keys__secret" role="status">
          <strong>Copy your key now. It is shown only once.</strong>
          <code className="mono">{secret}</code>
          <div className="topup-actions">
            <button type="button" className="button button--primary" onClick={copySecret}>
              <i className="ph ph-copy" aria-hidden="true" />
              Copy
            </button>
            <button type="button" className="button button--ghost" onClick={() => setSecret(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {keys.length > 0 ? (
        <ul className="api-keys__list">
          {keys.map((key) => (
            <li key={key.id} className="api-keys__row">
              <div className="api-keys__row-head">
                <span>
                  <strong>{key.name}</strong>
                  <span className="muted mono api-keys__prefix">{key.prefix}…</span>
                </span>
                {confirmRevoke === key.id ? (
                  <span className="topup-actions">
                    <button type="button" className="button button--ghost" disabled={busy} onClick={() => setConfirmRevoke(null)}>
                      Keep
                    </button>
                    <button type="button" className="button" disabled={busy} onClick={() => revoke(key.id)}>
                      Revoke
                    </button>
                  </span>
                ) : (
                  <button type="button" className="button button--ghost" disabled={busy} onClick={() => setConfirmRevoke(key.id)} aria-label={`Revoke ${key.name}`}>
                    Revoke
                  </button>
                )}
              </div>
              <span className="api-keys__scopes">
                {key.scopes.map((scope) => (
                  <span key={scope} className="pill">
                    {SCOPE_LABELS[scope]?.title ?? scope}
                  </span>
                ))}
              </span>
              <span className="muted api-keys__meta">{key.lastUsedAt ? `Last used ${at(key.lastUsedAt)}` : "Never used"}</span>
            </li>
          ))}
        </ul>
      ) : (
        !creating && <p className="muted api-keys__meta">No keys yet.</p>
      )}

      {creating ? (
        <form className="stack stack--tight" onSubmit={create}>
          <label className="stack stack--tight">
            <span className="stat__label">Name</span>
            <input className="input" value={name} maxLength={40} required placeholder="Claude Code on my laptop" onChange={(event) => setName(event.target.value)} />
          </label>
          <fieldset className="api-keys__fieldset">
            <legend className="stat__label">What the key may do</legend>
            {API_KEY_SCOPES.map((scope) => (
              <label key={scope} className="check">
                <input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => toggleScope(scope, event.target.checked)} />
                <span>
                  {SCOPE_LABELS[scope].title}
                  <span className="muted api-keys__meta" style={{ display: "block" }}>
                    {SCOPE_LABELS[scope].detail}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {error && <span className="field-error">{error}</span>}
          <div className="topup-actions">
            <button type="submit" className="button button--primary" disabled={busy || !name.trim() || scopes.length === 0}>
              Make key
            </button>
            <button type="button" className="button button--ghost" disabled={busy} onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {error && <span className="field-error">{error}</span>}
          <button type="button" className="button" disabled={keys.length >= MAX_KEYS_PER_ACCOUNT} onClick={() => setCreating(true)}>
            <i className="ph ph-plus" aria-hidden="true" />
            {keys.length >= MAX_KEYS_PER_ACCOUNT ? `${MAX_KEYS_PER_ACCOUNT} keys, the most` : "New key"}
          </button>
        </>
      )}

      {initialEvents.length > 0 && (
        <details className="api-keys__events">
          <summary className="stat__label">Recent key activity</summary>
          <ul className="api-keys__list">
            {initialEvents.map((event) => (
              <li key={event.id} className="api-keys__event">
                <span>
                  {ACTION_LABELS[event.action] ?? event.action}
                  {event.agentId && (
                    <>
                      {" · "}
                      <Link href={`/agents/${event.agentId}`}>agent</Link>
                    </>
                  )}
                  <span className="muted api-keys__meta" style={{ display: "block" }}>
                    {event.keyName} · {at(event.createdAt)}
                  </span>
                </span>
                <span className={`pill${event.result === "error" ? " pill--paused" : ""}`} title={event.detail ?? undefined}>
                  {RESULT_LABELS[event.result] ?? event.result}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
