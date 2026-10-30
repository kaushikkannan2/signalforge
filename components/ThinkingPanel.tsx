"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ThinkingStep } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The reasoning timeline.

   This is the panel people actually watch, so it is built as a trace rather
   than a log: a spine with a node per step, grouped by phase, each phase
   collapsible and carrying its own elapsed time. Colour is the same semantic
   system as the rest of the app — amber is a decision, violet is the graph,
   sky is an external call, rose is a failure — so the shape of a run is
   legible before any text is read.

   Three things it deliberately shows that a log hides: where time actually
   went (duration bars, scaled within each phase), the verbatim query behind a
   graph step, and every point at which the system stopped and waited for a
   human.
   --------------------------------------------------------------------------- */

const KIND: Record<
  ThinkingStep["kind"],
  { glyph: string; color: string; label: string }
> = {
  reasoning: { glyph: "◆", color: "var(--color-ember)", label: "reasoning" },
  tool_call: { glyph: "↗", color: "var(--color-person)", label: "external call" },
  graph_query: { glyph: "⬡", color: "var(--color-bridge)", label: "graph query" },
  validation: { glyph: "✓", color: "var(--color-vine)", label: "validation" },
  gate: { glyph: "⏸", color: "var(--color-signal)", label: "human gate" },
  error: { glyph: "✕", color: "var(--color-alarm)", label: "error" },
};

interface Phase {
  name: string;
  steps: ThinkingStep[];
  totalMs: number;
  maxMs: number;
  hasError: boolean;
  hasGate: boolean;
}

export function ThinkingPanel({ running }: { running: boolean }) {
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const [connected, setConnected] = useState(false);
  // Phases the operator has explicitly toggled. Everything else follows the
  // auto rule below, so a long run doesn't become an unreadable scroll.
  const [overridden, setOverridden] = useState<Map<string, boolean>>(new Map());
  const [filter, setFilter] = useState<ThinkingStep["kind"] | "all">("all");
  const [open, setOpen] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const es = new EventSource("/api/thinking");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const step = JSON.parse(e.data) as ThinkingStep;
      setSteps((prev) =>
        prev.some((s) => s.id === step.id) ? prev : [...prev, step].slice(-500),
      );
    };
    return () => es.close();
  }, []);

  // Only auto-scroll when the operator hasn't scrolled up to read something.
  useEffect(() => {
    if (!pinned.current || !scroller.current) return;
    scroller.current.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [steps.length]);

  const phases = useMemo<Phase[]>(() => {
    const visible = filter === "all" ? steps : steps.filter((s) => s.kind === filter);
    const out: Phase[] = [];
    for (const step of visible) {
      let phase = out[out.length - 1];
      if (!phase || phase.name !== step.phase) {
        phase = { name: step.phase, steps: [], totalMs: 0, maxMs: 0, hasError: false, hasGate: false };
        out.push(phase);
      }
      phase.steps.push(step);
      phase.totalMs += step.durationMs ?? 0;
      phase.maxMs = Math.max(phase.maxMs, step.durationMs ?? 0);
      if (step.kind === "error") phase.hasError = true;
      if (step.kind === "gate") phase.hasGate = true;
    }
    return out;
  }, [steps, filter]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of steps) c.set(s.kind, (c.get(s.kind) ?? 0) + 1);
    return c;
  }, [steps]);

  const elapsed = steps.reduce((t, s) => t + (s.durationMs ?? 0), 0);

  return (
    <aside className="surface flex flex-col overflow-hidden" style={{ maxHeight: "calc(100vh - 7.5rem)" }}>
      <header
        className="px-3 py-2.5 border-b shrink-0"
        style={{
          borderColor: "var(--color-rule)",
          background: "linear-gradient(180deg, rgba(255,122,69,0.09), transparent)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block rounded-full shrink-0 ${running ? "live-dot" : ""}`}
            style={{
              width: 7,
              height: 7,
              background: running
                ? "var(--color-ember)"
                : connected
                  ? "var(--color-ink-faint)"
                  : "var(--color-alarm)",
              color: "var(--color-ember)",
            }}
          />
          <span className="display" style={{ fontSize: "0.9375rem" }}>
            Reasoning trace
          </span>
          <span className="mono ml-auto grid-surface" style={{ fontSize: "0.625rem", color: "var(--color-ink-faint)" }}>
            {steps.length} steps · {(elapsed / 1000).toFixed(1)}s
          </span>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mono shrink-0"
            style={{ fontSize: "0.625rem", color: "var(--color-ink-faint)" }}
          >
            {open ? "▾" : "▸"}
          </button>
        </div>

        {open && (
          <div className="flex gap-1 mt-2 flex-wrap">
            <Chip
              active={filter === "all"}
              onClick={() => setFilter("all")}
              color="var(--color-ink-soft)"
              label={`all ${steps.length}`}
            />
            {(Object.keys(KIND) as ThinkingStep["kind"][])
              .filter((k) => counts.get(k))
              .map((k) => (
                <Chip
                  key={k}
                  active={filter === k}
                  onClick={() => setFilter(filter === k ? "all" : k)}
                  color={KIND[k].color}
                  label={`${KIND[k].glyph} ${counts.get(k)}`}
                  title={KIND[k].label}
                />
              ))}
          </div>
        )}
      </header>

      {open && (
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          }}
          className="overflow-y-auto px-2.5 py-2 flex flex-col gap-2.5"
        >
          {!phases.length && (
            <div className="py-10 text-center">
              <p className="mono" style={{ fontSize: "0.6875rem", color: "var(--color-ink-faint)" }}>
                Idle
              </p>
              <p className="mt-1.5 mx-auto" style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", maxWidth: "15rem" }}>
                Reasoning steps, provider calls, verbatim graph queries and every human gate
                stream here as they happen.
              </p>
            </div>
          )}

          {phases.map((phase, pi) => {
            const key = `${phase.name}-${pi}`;
            const isLast = pi === phases.length - 1;
            // Auto rule: the phase currently running stays open, finished ones
            // fold to a summary line. Nothing is hidden — a finished phase is
            // one click from its full detail — but a completed run reads as a
            // short list of outcomes rather than forty streamed lines.
            const auto = !(isLast && running) && phases.length > 1;
            const isCollapsed = overridden.get(key) ?? auto;
            return (
              <section key={key}>
                <button
                  onClick={() =>
                    setOverridden((prev) => {
                      const next = new Map(prev);
                      next.set(key, !isCollapsed);
                      return next;
                    })
                  }
                  className="w-full flex items-center gap-2 px-1.5 py-1 rounded row-hover text-left"
                >
                  <span
                    className="mono shrink-0"
                    style={{ fontSize: "0.5625rem", color: "var(--color-ink-faint)" }}
                  >
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                  <span
                    className="rule-label"
                    style={{
                      color: phase.hasError
                        ? "var(--color-alarm)"
                        : phase.hasGate
                          ? "var(--color-signal)"
                          : "var(--color-ink-soft)",
                      fontSize: "0.625rem",
                    }}
                  >
                    {phase.name}
                  </span>
                  <span
                    className="h-px flex-1"
                    style={{ background: "var(--color-rule)" }}
                  />
                  <span
                    className="mono grid-surface shrink-0"
                    style={{ fontSize: "0.5625rem", color: "var(--color-ink-faint)" }}
                  >
                    {phase.steps.length}
                    {phase.totalMs > 0 && ` · ${fmt(phase.totalMs)}`}
                  </span>
                </button>

                {/* A collapsed phase still reports its outcome, so folding it
                    loses nothing an operator needs at a glance. */}
                {isCollapsed && (
                  <p
                    className="pl-[1.6rem] pr-1 pb-1"
                    style={{ fontSize: "0.6875rem", color: "var(--color-ink-soft)", lineHeight: 1.4 }}
                  >
                    {outcomeOf(phase)}
                  </p>
                )}

                {!isCollapsed && (
                  <div className="relative pl-1.5">
                    {/* The spine. */}
                    <span
                      className="absolute"
                      style={{
                        left: "0.6875rem",
                        top: "0.5rem",
                        bottom: "0.5rem",
                        width: 1,
                        background:
                          "linear-gradient(180deg, var(--color-rule-strong), var(--color-rule) 85%, transparent)",
                      }}
                    />
                    <div className="flex flex-col">
                      {phase.steps.map((step, si) => (
                        <Step
                          key={step.id}
                          step={step}
                          maxMs={phase.maxMs}
                          live={running && isLast && si === phase.steps.length - 1}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function Step({ step, maxMs, live }: { step: ThinkingStep; maxMs: number; live: boolean }) {
  const [showQuery, setShowQuery] = useState(false);
  const k = KIND[step.kind] ?? KIND.reasoning;
  const share = maxMs > 0 && step.durationMs ? step.durationMs / maxMs : 0;

  return (
    <div className="step-in relative pl-5 py-1">
      {/* Node on the spine. */}
      <span
        className={`absolute rounded-full ${live ? "live-dot" : ""}`}
        style={{
          left: "0.3125rem",
          top: "0.5rem",
          width: 9,
          height: 9,
          background: step.kind === "gate" || step.kind === "error" ? k.color : "var(--color-surface)",
          border: `1.5px solid ${k.color}`,
          color: k.color,
          boxShadow: live ? undefined : `0 0 6px ${k.color}33`,
        }}
        title={k.label}
      />

      <div className="flex items-baseline gap-1.5">
        <span style={{ fontSize: "0.78125rem", color: "var(--color-ink)", lineHeight: 1.35 }}>
          {step.label}
        </span>
        {step.durationMs !== undefined && (
          <span
            className="mono grid-surface ml-auto shrink-0"
            style={{ fontSize: "0.5625rem", color: "var(--color-ink-faint)" }}
          >
            {fmt(step.durationMs)}
          </span>
        )}
      </div>

      {/* Where the time actually went, scaled within this phase. */}
      {share > 0.08 && (
        <span
          className="block mt-1 rounded-full"
          style={{
            height: 2,
            width: `${Math.max(6, share * 100)}%`,
            background: k.color,
            opacity: 0.5,
          }}
        />
      )}

      {step.detail && (
        <p
          className="mt-0.5"
          style={{ fontSize: "0.6875rem", color: "var(--color-ink-soft)", lineHeight: 1.45 }}
        >
          {step.detail}
        </p>
      )}

      {step.query && (
        <>
          <button
            onClick={() => setShowQuery((v) => !v)}
            className="mono mt-1"
            style={{ fontSize: "0.5625rem", color: k.color }}
          >
            {showQuery ? "hide" : "show"} query
          </button>
          {showQuery && (
            <pre
              className="mono mt-1 p-2 rounded-md scroll-x whitespace-pre"
              style={{
                background: "var(--color-void)",
                border: `1px solid ${k.color}33`,
                color: "var(--color-ink-soft)",
                fontSize: "0.625rem",
                lineHeight: 1.5,
              }}
            >
              {step.query}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  color,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  label: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="mono px-1.5 py-0.5 rounded"
      style={{
        fontSize: "0.5625rem",
        background: active ? `${color}22` : "var(--color-surface-2)",
        color: active ? color : "var(--color-ink-faint)",
        border: `1px solid ${active ? `${color}66` : "var(--color-rule)"}`,
      }}
    >
      {label}
    </button>
  );
}

const fmt = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

/**
 * The one line a folded phase shows. Priority order is deliberate: a failure
 * or a human gate is what an operator needs to see without unfolding
 * anything; otherwise the last validation step is the phase's result.
 */
function outcomeOf(phase: Phase): string {
  const error = phase.steps.find((s) => s.kind === "error");
  if (error) return `${error.label}${error.detail ? ` — ${error.detail}` : ""}`;
  const gate = phase.steps.find((s) => s.kind === "gate");
  if (gate) return gate.label;
  const validations = phase.steps.filter((s) => s.kind === "validation");
  const last = validations[validations.length - 1];
  if (last) return last.detail ? `${last.label} — ${last.detail}` : last.label;
  return phase.steps[phase.steps.length - 1]?.label ?? "";
}
