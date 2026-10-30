"use client";

import { useEffect, useRef, useState } from "react";
import type { ThinkingStep } from "@/lib/types";

const KIND_STYLE: Record<ThinkingStep["kind"], { glyph: string; color: string; label: string }> = {
  reasoning: { glyph: "◆", color: "var(--color-vine)", label: "reasoning" },
  tool_call: { glyph: "→", color: "#1d4ed8", label: "provider call" },
  graph_query: { glyph: "⬡", color: "#7c3aed", label: "graph query" },
  validation: { glyph: "✓", color: "var(--color-tier-a)", label: "validation" },
  gate: { glyph: "⏸", color: "var(--color-signal)", label: "human gate" },
  error: { glyph: "✕", color: "var(--color-alarm)", label: "error" },
};

/**
 * The live reasoning feed. Open by default during a run, because the whole
 * argument of this product is that you can see why it did what it did.
 */
export function ThinkingPanel({ running }: { running: boolean }) {
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const [open, setOpen] = useState(true);
  const [connected, setConnected] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource("/api/thinking");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const step = JSON.parse(e.data) as ThinkingStep;
      setSteps((prev) => (prev.some((s) => s.id === step.id) ? prev : [...prev, step].slice(-400)));
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [steps.length]);

  return (
    <aside
      className="border rounded-lg bg-white flex flex-col"
      style={{ borderColor: "var(--color-rule)", maxHeight: open ? "calc(100vh - 8rem)" : undefined }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-3 px-3 py-2.5 text-left w-full border-b"
        style={{ borderColor: open ? "var(--color-rule)" : "transparent" }}
      >
        <span className="flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: running ? "var(--color-vine)" : connected ? "var(--color-ink-faint)" : "var(--color-alarm)",
              boxShadow: running ? "0 0 0 3px var(--color-vine-soft)" : undefined,
            }}
          />
          <span className="rule-label" style={{ color: "var(--color-ink-soft)" }}>
            Agent thinking
          </span>
          <span className="mono" style={{ color: "var(--color-ink-faint)" }}>
            {steps.length}
          </span>
        </span>
        <span className="mono" style={{ color: "var(--color-ink-faint)" }}>
          {open ? "collapse" : "expand"}
        </span>
      </button>

      {open && (
        <div ref={scroller} className="overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
          {steps.length === 0 && (
            <p className="mono py-6 text-center" style={{ color: "var(--color-ink-faint)" }}>
              Idle. Reasoning steps, provider calls and graph queries appear here as they happen.
            </p>
          )}
          {steps.map((s) => {
            const style = KIND_STYLE[s.kind] ?? KIND_STYLE.reasoning;
            return (
              <div key={s.id} className="step-in leading-snug">
                <div className="flex items-baseline gap-1.5">
                  <span className="mono shrink-0" style={{ color: style.color }} title={style.label}>
                    {style.glyph}
                  </span>
                  <span className="mono shrink-0" style={{ color: "var(--color-ink-faint)" }}>
                    {new Date(s.at).toLocaleTimeString("en-GB", { hour12: false })}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--color-ink)" }}>{s.label}</span>
                  {s.durationMs !== undefined && (
                    <span className="mono shrink-0" style={{ color: "var(--color-ink-faint)" }}>
                      {s.durationMs}ms
                    </span>
                  )}
                </div>
                {s.detail && (
                  <p
                    className="pl-[3.1rem] pr-1"
                    style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)" }}
                  >
                    {s.detail}
                  </p>
                )}
                {s.query && (
                  <pre
                    className="mono ml-[3.1rem] mt-1 mb-1 p-2 rounded border scroll-x whitespace-pre"
                    style={{
                      borderColor: "var(--color-rule)",
                      background: "var(--color-paper)",
                      color: "var(--color-ink-soft)",
                      fontSize: "0.6875rem",
                    }}
                  >
                    {s.query}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
