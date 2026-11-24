"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { useAuth } from "@/components/ui/Providers";
import { HISTORY_MAX_TURNS, QUESTION_MAX_LENGTH, type AskTurn } from "@/lib/ai/ask-agent";

type Props = {
  agentId: string;
  agentName: string;
  /** First market, for the "what if it falls" suggestion. */
  market: string | null;
};

/**
 * Agent page: ask the agent about its own decisions ("Why did you sell TSLA?"). A Lite model answers
 * from the agent's record only (lib/ai/ask-service.ts), paid from the asker's AI credits. The
 * conversation lives in this component and is gone when the page closes.
 */
export function AskAgent({ agentId, agentName, market }: Props) {
  const { address, openLogin } = useAuth();
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = ["Why did you make your last trade?", "What are you waiting for right now?", market ? `What would you do if ${market} fell 10%?` : "When do you sell?"];
  // One conversation keeps the last few turns; past that, a new question starts fresh context.
  const full = turns.length >= HISTORY_MAX_TURNS + 1;

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || pending) return;
    if (!address) return openLogin();
    setError(null);
    setPending(text);
    setDraft("");
    const response = await fetch(`/api/agents/${agentId}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text, history: turns.slice(-HISTORY_MAX_TURNS) }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { answer?: string; error?: string } | null;
    setPending(null);
    if (!response?.ok || !body?.answer) {
      setDraft(text);
      setError(body?.error ?? "Something went wrong. Please try again.");
      return;
    }
    setTurns((previous) => [...previous, { question: text, answer: body.answer! }]);
    inputRef.current?.focus();
  };

  return (
    <section className="card ask-agent" aria-labelledby="ask-agent-title">
      <div className="card-head" style={{ marginBottom: "var(--space-100)" }}>
        <h2 className="card__title" id="ask-agent-title">
          <i className="ph ph-chat-circle-dots" aria-hidden="true" /> Ask {agentName}
        </h2>
        {turns.length > 0 && (
          <button className="button button--ghost" type="button" onClick={() => (setTurns([]), setError(null))}>
            Clear
          </button>
        )}
      </div>
      <p className="muted ask-agent__lead">It answers from its own rules, decisions and trades. Explanations only, not advice.</p>

      {(turns.length > 0 || pending) && (
        <ol className="ask-agent__log" aria-live="polite">
          {turns.map((turn, index) => (
            <li key={index}>
              <p className="ask-agent__question">{turn.question}</p>
              <p className="ask-agent__answer">{turn.answer}</p>
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

      {!turns.length && !pending && (
        <div className="ask-agent__suggestions">
          {suggestions.map((suggestion) => (
            <button key={suggestion} className="pill ask-agent__suggestion" type="button" onClick={() => void ask(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form
        className="ask-agent__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!address) return openLogin();
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
      <p className="ask-agent__note muted">Uses your AI credits, well under a cent a question. Paper trading, not investment advice.</p>
    </section>
  );
}
