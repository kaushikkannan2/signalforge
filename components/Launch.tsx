"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "./Logo";
import type { ThinkingStep } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The launch screen.

   One input. Everything the old intake form demanded — company, product,
   capability list, contract value — is already in a paragraph a founder writes
   naturally, so the system extracts it rather than making the user do the
   parsing.

   The forging state is doing real work for the demo: a twenty-second wait with
   a spinner is dead air, and dead air is where attention goes. Instead the
   trace streams here, full width, with the mark lit — so the wait is the part
   that proves the system is reasoning rather than stalling.
   --------------------------------------------------------------------------- */

const EXAMPLES = [
  {
    label: "Close management",
    text: "We sell a close-management and reconciliation tool to mid-market finance teams. Controllers use it to cut month-end close from nine days to three, and it plugs into NetSuite and Sage Intacct. Our best customers are 80 to 300 person SaaS companies with a real accounting team — two or three people in finance, a controller who owns the close, and enough transaction volume that spreadsheets have started breaking. We charge about $34,000 a year and sell to the controller with the CFO signing off.",
  },
  {
    label: "Dev tooling",
    text: "We build an observability platform for backend engineering teams running distributed systems. It traces requests across services, surfaces the specific span that caused a latency regression, and ties it back to the deploy that introduced it. Our users are platform and SRE teams at Series A to Series C companies — usually the first infra hire who has just been handed an on-call rotation and no tooling. Self-serve starts at $400 a month and lands around $45,000 a year at the team tier.",
  },
  {
    label: "Healthcare ops",
    text: "We sell patient-intake automation to multi-site specialty clinics — dermatology, orthopaedics, ophthalmology. It replaces clipboard intake and manual insurance verification, cutting front-desk time per patient from eleven minutes to under three. We sell to practice administrators and the COO, with committee buying and a six-month cycle. Contracts run per-location, typically $90,000 a year across eight to twenty sites.",
  },
];

const PHASE_ORDER = ["Intake", "ICP inference", "ICP clarification", "ICP expansion"];

export function Launch({
  onSubmit,
  running,
  error,
  onSkipToDemo,
}: {
  onSubmit: (description: string) => void;
  running: boolean;
  error: string | null;
  onSkipToDemo: () => void;
}) {
  const [text, setText] = useState("");
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  // The trace is subscribed to only while forging, so the landing screen is
  // not holding an SSE connection open before it has anything to show.
  useEffect(() => {
    if (!running) return;
    setSteps([]);
    const es = new EventSource("/api/thinking");
    es.onmessage = (e) => {
      const step = JSON.parse(e.data) as ThinkingStep;
      if (!PHASE_ORDER.includes(step.phase)) return;
      setSteps((prev) => (prev.some((s) => s.id === step.id) ? prev : [...prev, step].slice(-40)));
    };
    return () => es.close();
  }, [running]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [steps.length]);

  const tooShort = text.trim().length > 0 && text.trim().length < 40;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full" style={{ maxWidth: running ? "46rem" : "41rem" }}>
        {/* --- hero --- */}
        <div className="flex flex-col items-center text-center">
          <span className={running ? "forging rounded-2xl" : undefined} style={{ borderRadius: 18 }}>
            <Mark size={running ? 108 : 96} />
          </span>

          <h1
            className="display mt-4"
            style={{ fontSize: "2.875rem", lineHeight: 1.05, letterSpacing: "-0.028em" }}
          >
            Signal<span style={{ color: "var(--color-ember)", fontWeight: 600 }}>Forge</span>
          </h1>

          <p
            className="mt-2.5"
            style={{ fontSize: "1.0625rem", color: "var(--color-ink-soft)", maxWidth: "31rem" }}
          >
            Describe what you sell. Get back an evidence-cited pipeline — every account
            sourced, every warm path traced, and nothing sent without your approval.
          </p>
        </div>

        {/* --- forging --- */}
        {running ? (
          <div className="mt-7 surface overflow-hidden">
            <div
              className="px-4 py-2.5 border-b flex items-center gap-2.5"
              style={{
                borderColor: "var(--color-rule)",
                background: "linear-gradient(180deg, rgba(255,122,69,0.1), transparent)",
              }}
            >
              <span
                className="inline-block rounded-full live-dot shrink-0"
                style={{ width: 7, height: 7, background: "var(--color-ember)", color: "var(--color-ember)" }}
              />
              <span className="rule-label" style={{ color: "var(--color-ember)" }}>
                forging
              </span>
              <span className="mono ml-auto" style={{ fontSize: "0.625rem", color: "var(--color-ink-faint)" }}>
                {steps.length} steps
              </span>
            </div>

            <div ref={scroller} className="px-4 py-3 flex flex-col gap-1.5" style={{ maxHeight: "17rem", overflowY: "auto" }}>
              {steps.length === 0 && (
                <p className="mono py-3" style={{ fontSize: "0.6875rem", color: "var(--color-ink-faint)" }}>
                  Starting three concurrent inference passes…
                </p>
              )}
              {steps.map((s) => (
                <div key={s.id} className="step-in flex items-baseline gap-2">
                  <span
                    className="mono shrink-0"
                    style={{
                      fontSize: "0.6875rem",
                      color:
                        s.kind === "error"
                          ? "var(--color-alarm)"
                          : s.kind === "validation"
                            ? "var(--color-tempered)"
                            : "var(--color-ember)",
                    }}
                  >
                    {s.kind === "error" ? "✕" : s.kind === "validation" ? "✓" : "◆"}
                  </span>
                  <span style={{ fontSize: "0.8125rem", lineHeight: 1.4 }}>{s.label}</span>
                  {s.durationMs !== undefined && (
                    <span className="mono ml-auto shrink-0" style={{ fontSize: "0.5625rem", color: "var(--color-ink-faint)" }}>
                      {s.durationMs < 1000 ? `${s.durationMs}ms` : `${(s.durationMs / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <p
              className="px-4 py-2.5 border-t"
              style={{ borderColor: "var(--color-rule)", fontSize: "0.6875rem", color: "var(--color-ink-faint)" }}
            >
              Three passes run concurrently — firmographics, buyers, filters — so this takes
              about as long as the slowest one rather than the sum of all three.
            </p>
          </div>
        ) : (
          /* --- the one input --- */
          <div className="mt-7">
            <label className="flex flex-col gap-2">
              <span className="rule-label">What do you sell, and who has bought it?</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !tooShort && text.trim()) {
                    onSubmit(text.trim());
                  }
                }}
                rows={7}
                autoFocus
                placeholder="We sell a close-management tool to mid-market finance teams. Controllers use it to cut month-end close from nine days to three. Our best customers are 80–300 person SaaS companies with a real accounting team…"
                className="px-3.5 py-3 rounded-lg border resize-y"
                style={{
                  borderColor: "var(--color-rule-strong)",
                  fontSize: "0.9375rem",
                  lineHeight: 1.55,
                  background: "var(--color-void)",
                }}
              />
            </label>

            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="rule-label" style={{ fontSize: "0.5625rem" }}>
                or try
              </span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => setText(ex.text)}
                  className="px-2.5 py-1 rounded-md border"
                  style={{
                    borderColor: "var(--color-rule-strong)",
                    color: "var(--color-ink-soft)",
                    fontSize: "0.75rem",
                    background: "var(--color-surface-2)",
                  }}
                >
                  {ex.label}
                </button>
              ))}
            </div>

            {error && (
              <p
                className="mt-3 px-3 py-2 rounded-md"
                style={{ background: "var(--color-alarm-soft)", color: "var(--color-alarm)", fontSize: "0.8125rem" }}
              >
                {error}
              </p>
            )}

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => onSubmit(text.trim())}
                disabled={tooShort || !text.trim()}
                className="btn-primary px-5 py-2.5 rounded-md disabled:opacity-40"
                style={{ fontSize: "0.9375rem" }}
              >
                Forge my pipeline
              </button>
              <span className="mono" style={{ fontSize: "0.6875rem", color: "var(--color-ink-faint)" }}>
                ⌘↵
              </span>
              <button
                onClick={onSkipToDemo}
                className="ml-auto px-3 py-2 rounded-md"
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--color-ink-soft)",
                  border: "1px solid var(--color-rule)",
                }}
              >
                Load a prepared dataset instead →
              </button>
            </div>

            <p className="mt-3" style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)" }}>
              {tooShort
                ? "A couple of sentences at minimum — a one-liner produces a profile with honestly low confidence, and the engine will tell you so."
                : "That's the only field. Company, product, capabilities and contract value are extracted from what you wrote rather than asked for separately."}
            </p>
          </div>
        )}

        {/* --- what happens next --- */}
        {!running && (
          <div
            className="mt-8 pt-6 border-t grid gap-4"
            style={{ borderColor: "var(--color-rule)", gridTemplateColumns: "repeat(auto-fit, minmax(10.5rem, 1fr))" }}
          >
            {[
              { n: "01", t: "Infer", d: "A buyer profile with a confidence score and a reason on every field." },
              { n: "02", t: "Discover", d: "Accounts and named buyers, each with a source link you can open." },
              { n: "03", t: "Connect", d: "A graph that finds who already knows them, and who's in-market now." },
              { n: "04", t: "Approve", d: "Copy grounded in a dated signal. Nothing sends until you say so." },
            ].map((s) => (
              <div key={s.n}>
                <span className="mono" style={{ fontSize: "0.625rem", color: "var(--color-ember)" }}>
                  {s.n}
                </span>
                <p style={{ fontSize: "0.875rem", fontWeight: 600, marginTop: 2 }}>{s.t}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)", lineHeight: 1.45 }}>{s.d}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
