"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/ui/Providers";
import { HISTORY_MAX_TURNS, QUESTION_MAX_LENGTH, type AskTurn } from "@/lib/ai/ask-agent";
import { formatCredits } from "@/lib/ai/models";

const OPEN_EVENT = "zolva:ask-agent";

/**
 * Opens the Ask panel with a question typed in but not sent (sending spends AI credits, so the
 * visitor presses Ask). Used by "Ask why" on a decision; the page's AskAgent listens.
 */
export function openAskAgent(question: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { question } }));
}

/** One answered question, with the next questions the agent suggested. */
type Turn = AskTurn & { followUps: string[] };

type Props = {
  agentId: string;
  agentName: string;
  /** First market, for the "what if it falls" suggestion. */
  market: string | null;
};

/**
 * Agent page: a floating "Ask this agent" button that opens a side panel (a bottom sheet on
 * phones) to ask the agent about its own decisions. A Lite model answers from the agent's record
 * only (lib/ai/ask-service.ts), paid from the asker's AI credits. The conversation stays while
 * the page is open, also when the panel closes, and is never stored.
 */
export function AskAgent({ agentId, agentName, market }: Props) {
  const { address, openLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  /** AI credits left (USD), loaded when the panel first opens and updated after each answer. */
  const [credits, setCredits] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const fab = useRef<HTMLButtonElement>(null);

  const suggestions = ["Why did you make your last trade?", "What are you waiting for right now?", market ? `What would you do if ${market} fell 10%?` : "When do you sell?"];
  // One conversation keeps the last few turns; past that, Clear starts a new one.
  const full = turns.length >= HISTORY_MAX_TURNS + 1;

  const close = useCallback(() => {
    setOpen(false);
    fab.current?.focus();
  }, []);

  // "Ask why" on a decision opens the panel with its question ready to send.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const question = (event as CustomEvent<{ question?: string }>).detail?.question;
      setOpen(true);
      setError(null);
      if (question) setDraft(question.slice(0, QUESTION_MAX_LENGTH));
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Credits left, once per page view, when a logged-in visitor first opens the panel.
  useEffect(() => {
    if (!open || !address || credits !== null) return;
    let cancelled = false;
    fetch(`/api/agents/${agentId}/ask`)
      .then((response) => (response.ok ? (response.json() as Promise<{ creditsUsd?: number }>) : null))
      .then((body) => {
        if (!cancelled && typeof body?.creditsUsd === "number") setCredits(body.creditsUsd);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, address, agentId, credits]);

  // Keep the newest answer in view.
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!address) return openLogin();
    if (text.length < 3 || pending) return;
    setError(null);
    setPending(text);
    setDraft("");
    const response = await fetch(`/api/agents/${agentId}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text, history: turns.slice(-HISTORY_MAX_TURNS).map(({ question, answer }) => ({ question, answer })) }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { answer?: string; followUps?: string[]; creditsUsd?: number; error?: string } | null;
    setPending(null);
    if (!response?.ok || !body?.answer) {
      setDraft(text);
      setError(body?.error ?? "Something went wrong. Please try again.");
      return;
    }
    setTurns((previous) => [...previous, { question: text, answer: body.answer!, followUps: Array.isArray(body.followUps) ? body.followUps : [] }]);
    if (typeof body.creditsUsd === "number") setCredits(body.creditsUsd);
    inputRef.current?.focus();
  };

  return (
    <>
      <button
        ref={fab}
        className="ask-fab"
        type="button"
        data-hidden={open || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <i className="ph ph-chat-circle-dots" aria-hidden="true" />
        Ask this agent
        {turns.length > 0 && <span className="ask-fab__count">{turns.length}</span>}
      </button>

      <div className="agent-scrim ask-scrim" data-open={open || undefined} onClick={close} aria-hidden="true" />
      <aside className="agent-panel ask-panel" data-open={open || undefined} role="dialog" aria-modal="true" aria-labelledby="ask-panel-title" aria-hidden={!open} inert={!open}>
        <span className="agent-panel__grabber" aria-hidden="true" />
        <div className="agent-panel__head">
          <div>
            <h2 className="agent-panel__name" id="ask-panel-title">
              Ask {agentName}
            </h2>
            <p className="agent-panel__meta">It answers from its own rules, decisions and trades. Explanations only, not advice.</p>
          </div>
          <div className="ask-panel__head-actions">
            {turns.length > 0 && (
              <button className="button button--ghost" type="button" onClick={() => (setTurns([]), setError(null))}>
                Clear
              </button>
            )}
            <button className="agent-panel__close" type="button" aria-label="Close" onClick={close}>
              <i className="ph ph-x" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="agent-panel__body ask-panel__body" aria-live="polite">
          {turns.length === 0 && !pending ? (
            <div className="ask-panel__start">
              <p className="muted">Try one of these, or ask your own:</p>
              <div className="ask-agent__suggestions">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} className="pill ask-agent__suggestion" type="button" onClick={() => void ask(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="ask-agent__log">
              {turns.map((turn, index) => (
                <li key={index}>
                  <p className="ask-agent__question">{turn.question}</p>
                  <p className="ask-agent__answer">{turn.answer}</p>
                  {/* Next questions the agent suggested: only under the latest answer, while there is room to ask. */}
                  {index === turns.length - 1 && !pending && !full && turn.followUps.length > 0 && (
                    <div className="ask-agent__suggestions ask-agent__followups" aria-label="Suggested next questions">
                      {turn.followUps.map((followUp) => (
                        <button key={followUp} className="pill ask-agent__suggestion" type="button" onClick={() => void ask(followUp)}>
                          {followUp}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
              {pending && (
                <li>
                  <p className="ask-agent__question">{pending}</p>
                  <p className="ask-agent__answer muted">Thinking…</p>
                </li>
              )}
            </ol>
          )}
          <div ref={logEnd} />
        </div>

        <div className="ask-panel__foot">
          <form
            className="ask-agent__form"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(draft);
            }}
          >
            <label className="sr-only" htmlFor={`ask-${agentId}`}>
              Your question for {agentName}
            </label>
            <input
              ref={inputRef}
              id={`ask-${agentId}`}
              className="input"
              placeholder={full ? "Clear to start a new conversation" : "Ask about a trade, a rule or what it waits for"}
              value={draft}
              maxLength={QUESTION_MAX_LENGTH}
              disabled={Boolean(pending) || full}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button className="button button--primary" type="submit" disabled={address ? Boolean(pending) || full || draft.trim().length < 3 : false}>
              {address ? "Ask" : "Log in to ask"}
            </button>
          </form>
          {error && (
            <p className="ask-agent__error" role="alert">
              {error}
              {error.includes("AI credits") && (
                <>
                  {" "}
                  <Link className="text-link" href="/settings">
                    Settings
                  </Link>
                </>
              )}
            </p>
          )}
          <p className="ask-agent__note muted">
            {address && credits !== null && (
              <>
                <span className={credits < 0.01 ? "ask-agent__credits--low" : undefined}>AI credits left: {formatCredits(credits)}</span>
                {credits < 0.01 && (
                  <>
                    {" "}
                    <Link className="text-link" href="/settings">
                      Top up
                    </Link>
                  </>
                )}
                {" · "}
              </>
            )}
            Well under a cent a question. Paper trading, not investment advice.
          </p>
        </div>
      </aside>
    </>
  );
}
