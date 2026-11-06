"use client";

import { useEffect, useRef, useState } from "react";

export interface ClarifyQuestion {
  field: string;
  question: string;
  why: string;
  exampleAnswer: string;
}

/**
 * The few questions that would most improve the profile.
 *
 * Built on the native <dialog>, which supplies focus trapping, Escape handling
 * and focus return. Every question is optional: one answer is enough to submit,
 * and skipping leaves the profile as it was. Answers survive a failed
 * submission, so a provider error never costs the founder their typing.
 */
export function ClarifyDialog({
  questions,
  loading,
  submitting,
  onSubmit,
  onClose,
}: {
  questions: ClarifyQuestion[];
  loading: boolean;
  submitting: boolean;
  onSubmit: (answers: { question: string; answer: string }[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const filled = questions
    .map((q, i) => ({ question: q.question, answer: (answers[i] ?? "").trim() }))
    .filter((a) => a.answer);
  const canSubmit = filled.length > 0 && !submitting;
  const submit = () => canSubmit && onSubmit(filled);

  return (
    <dialog
      ref={ref}
      aria-labelledby="clarify-title"
      className="clarify-dialog surface m-auto p-0"
      style={{
        width: "min(34rem, calc(100vw - 2rem))",
        maxHeight: "85vh",
        color: "var(--color-ink)",
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (!submitting) onClose();
      }}
    >
      <div className="p-5 flex flex-col gap-4">
        <header>
          <h2 id="clarify-title" className="display" style={{ fontSize: "1.25rem" }}>
            Fill the gaps in your profile
          </h2>
          <p className="mt-1" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
            Answer what you know and leave the rest blank. Your answers are treated as facts.
          </p>
        </header>

        {loading && (
          <p role="status" style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)" }}>
            Finding the questions that would help most…
          </p>
        )}

        {!loading && questions.length === 0 && (
          <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)" }}>
            No questions to ask right now.
          </p>
        )}

        {questions.map((q, i) => (
          <label key={q.question} className="flex flex-col gap-1">
            <span style={{ fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.4 }}>{q.question}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", lineHeight: 1.45 }}>
              {q.why}
            </span>
            <textarea
              rows={2}
              autoFocus={i === 0}
              disabled={submitting}
              value={answers[i] ?? ""}
              placeholder={`e.g. ${q.exampleAnswer}`}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
              }}
              className="mt-1 w-full rounded-md px-3 py-2"
              style={{ fontSize: "0.875rem", resize: "vertical" }}
            />
          </label>
        ))}

        {/* Sticky so the action stays in reach when the questions scroll on a phone. */}
        <footer
          className="sticky bottom-0 -mb-5 py-3 flex items-center justify-end gap-2 flex-wrap"
          style={{ background: "var(--color-surface)" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-quiet px-3 py-2 rounded-md disabled:opacity-50"
            style={{ fontSize: "0.875rem" }}
          >
            {questions.length ? "Skip for now" : "Close"}
          </button>
          {questions.length > 0 && (
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="btn-primary px-4 py-2 rounded-md disabled:opacity-50"
              style={{ fontSize: "0.875rem" }}
            >
              {submitting ? "Updating your profile…" : "Update profile"}
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
