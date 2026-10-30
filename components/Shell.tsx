"use client";

import { useEffect, useState } from "react";

/* ---------------------------------------------------------------------------
   App shell.

   Borrowed patterns, not borrowed pixels: a persistent left rail with
   view switching (Clay, Attio), a run-state top bar with live usage counters
   (Clay's credit header), and a stage stepper so an operator can see where a
   run is without reading a log. The visual language stays ours — warm paper,
   editorial serif headings, dense tabular grids — rather than the cool
   white-and-violet that category has converged on.
   --------------------------------------------------------------------------- */

export type ViewKey =
  | "intake"
  | "accounts"
  | "buyers"
  | "graph"
  | "outreach"
  | "pipeline"
  | "billing"
  | "agents"
  | "learning";

export interface NavItem {
  key: ViewKey;
  label: string;
  glyph: string;
  count?: number;
  /** Blocked views are visibly locked, with the reason on hover. */
  lockedReason?: string;
}

export function Rail({
  items,
  active,
  onSelect,
}: {
  items: NavItem[];
  active: ViewKey;
  onSelect: (key: ViewKey) => void;
}) {
  return (
    <nav
      className="flex flex-col gap-0.5 p-2.5 border-r shrink-0"
      style={{
        borderColor: "var(--color-rule)",
        width: "14rem",
        background: "linear-gradient(180deg, #121823 0%, #0c1017 100%)",
      }}
    >
      <div className="px-1.5 py-3 mb-2 flex items-center gap-2.5">
        <span
          className="shrink-0 rounded-md flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            background: "linear-gradient(145deg, #3ee0a6, #1d9b74)",
            boxShadow: "0 2px 10px rgba(52,211,153,0.35)",
            color: "#042018",
            fontWeight: 700,
            fontSize: "0.9375rem",
            fontFamily: "var(--font-display)",
          }}
        >
          V
        </span>
        <span>
          <span className="display block" style={{ fontSize: "1.0625rem", lineHeight: 1.1 }}>
            Vouch
          </span>
          <span className="rule-label" style={{ fontSize: "0.5625rem" }}>
            vouched pipeline
          </span>
        </span>
      </div>

      {items.map((item) => {
        const isActive = item.key === active;
        const locked = Boolean(item.lockedReason);
        return (
          <button
            key={item.key}
            onClick={() => !locked && onSelect(item.key)}
            disabled={locked}
            title={item.lockedReason}
            className="flex items-center gap-2.5 px-2 py-2 rounded-md text-left relative"
            style={{
              background: isActive
                ? "linear-gradient(90deg, var(--color-vine-soft), transparent)"
                : "transparent",
              boxShadow: isActive ? "inset 2px 0 0 var(--color-vine)" : undefined,
              color: locked
                ? "var(--color-ink-faint)"
                : isActive
                  ? "var(--color-vine)"
                  : "var(--color-ink-soft)",
              fontSize: "0.8125rem",
              fontWeight: isActive ? 600 : 400,
              cursor: locked ? "not-allowed" : "pointer",
              transition: "background 150ms, color 150ms",
            }}
          >
            <span className="mono shrink-0" style={{ width: "1rem", textAlign: "center" }}>
              {locked ? "·" : item.glyph}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            {item.count !== undefined && item.count > 0 && (
              <span
                className="mono grid-surface px-1 rounded shrink-0"
                style={{
                  background: isActive ? "white" : "var(--color-rule)",
                  color: "var(--color-ink-soft)",
                  fontSize: "0.625rem",
                }}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}

      <div className="mt-auto px-2 py-2">
        <kbd
          className="mono px-1.5 py-0.5 rounded border"
          style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.625rem", color: "var(--color-ink-faint)" }}
        >
          ⌘K
        </kbd>{" "}
        <span style={{ fontSize: "0.625rem", color: "var(--color-ink-faint)" }}>commands</span>
      </div>
    </nav>
  );
}

export interface Stage {
  label: string;
  done: boolean;
  active?: boolean;
  blocked?: boolean;
  /** Jumping to the view this stage represents — the stepper is navigation. */
  onClick?: () => void;
}

/** Horizontal run progress. Gives a viewer the narrative without narration. */
export function Stepper({ stages }: { stages: Stage[] }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scroll-x">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1 shrink-0">
          {i > 0 && (
            <span
              style={{
                width: "1rem",
                height: 1,
                background: stages[i - 1].done ? "var(--color-vine)" : "var(--color-rule-strong)",
              }}
            />
          )}
          <button
            onClick={s.onClick}
            disabled={!s.onClick}
            className={`rule-label px-2 py-1 rounded-md whitespace-nowrap ${s.active ? "working" : ""}`}
            style={{
              background: s.active
                ? "var(--color-signal-soft)"
                : s.done
                  ? "var(--color-vine-soft)"
                  : "var(--color-surface-2)",
              color: s.active
                ? "var(--color-signal)"
                : s.done
                  ? "var(--color-vine)"
                  : "var(--color-ink-faint)",
              border: `1px solid ${
                s.active
                  ? "rgba(251,191,36,0.5)"
                  : s.done
                    ? "rgba(52,211,153,0.35)"
                    : "var(--color-rule)"
              }`,
            }}
          >
            {s.done ? "✓ " : s.active ? "◆ " : ""}
            {s.label}
          </button>
        </div>
      ))}
    </div>
  );
}

export function TopBar({
  stages,
  providers,
  credits,
  cost,
  graph,
  mode,
  busyLabel,
  onReset,
}: {
  stages: Stage[];
  providers: Record<string, boolean>;
  credits: { balance: number; granted: number };
  cost: number;
  graph: { nodeCount: number; edgeCount: number };
  mode: string;
  busyLabel: string | null;
  onReset?: () => void;
}) {
  const live = Object.entries(providers).filter(([, v]) => v);
  return (
    <header
      className="glass px-4 py-2.5 flex items-center gap-4 flex-wrap shrink-0 z-10"
    >
      <Stepper stages={stages} />

      <div className="flex items-center gap-3 ml-auto grid-surface" style={{ fontSize: "0.6875rem" }}>
        {busyLabel && (
          <span className="flex items-center gap-1.5" style={{ color: "var(--color-signal)" }}>
            <span
              className="inline-block w-1.5 h-1.5 rounded-full live-dot"
              style={{ background: "var(--color-signal)", color: "var(--color-signal)" }}
            />
            {busyLabel}
          </span>
        )}
        <Meter
          label="credits"
          value={`${credits.balance}/${credits.granted}`}
          tone={credits.balance < 50 ? "var(--color-alarm)" : undefined}
          hint="Flexprice-metered. Enrichment is gated when this runs out."
        />
        <Meter label="graph" value={`${graph.nodeCount}n·${graph.edgeCount}e`} hint="Nodes and edges in the knowledge graph" />
        <Meter label="spend" value={`$${cost.toFixed(4)}`} hint="Cumulative LLM cost at list rates" />
        <span
          className="rule-label px-1.5 py-0.5 rounded"
          style={{
            background: mode === "live" ? "var(--color-vine-soft)" : "var(--color-rule)",
            color: mode === "live" ? "var(--color-vine)" : "var(--color-ink-soft)",
          }}
          title={
            mode === "live"
              ? "Calling real providers; citations are fetched URLs."
              : "Synthetic dataset for UI work. Labelled as such everywhere."
          }
        >
          {mode}
        </span>
        <span
          className="mono"
          style={{ color: "var(--color-ink-faint)" }}
          title={`Configured: ${live.map(([k]) => k).join(", ") || "none"}`}
        >
          {live.length}/7 wired
        </span>
        {onReset && (
          <button
            onClick={onReset}
            title="Clear everything and start from an empty workspace"
            className="mono px-2 py-1 rounded"
            style={{
              fontSize: "0.625rem",
              color: "var(--color-ink-faint)",
              border: "1px solid var(--color-rule)",
            }}
          >
            reset
          </button>
        )}
      </div>
    </header>
  );
}

function Meter({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <span className="flex items-baseline gap-1" title={hint}>
      <span className="rule-label" style={{ fontSize: "0.5625rem" }}>
        {label}
      </span>
      <span className="mono" style={{ color: tone, fontSize: "0.6875rem" }}>
        {value}
      </span>
    </span>
  );
}

/* --- toasts ---------------------------------------------------------------- */

export interface Toast {
  id: string;
  kind: "ok" | "warn" | "error";
  title: string;
  detail?: string;
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50" style={{ maxWidth: "22rem" }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className="step-in rounded-lg border px-3 py-2.5 cursor-pointer"
          style={{
            background: "linear-gradient(180deg, #1a212e, #141a25)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            borderColor:
              t.kind === "error"
                ? "var(--color-alarm)"
                : t.kind === "warn"
                  ? "var(--color-tier-b)"
                  : "var(--color-vine)",
          }}
        >
          <div className="flex items-start gap-2">
            <span
              className="mono shrink-0"
              style={{
                color:
                  t.kind === "error"
                    ? "var(--color-alarm)"
                    : t.kind === "warn"
                      ? "var(--color-tier-b)"
                      : "var(--color-vine)",
              }}
            >
              {t.kind === "error" ? "✕" : t.kind === "warn" ? "!" : "✓"}
            </span>
            <div className="min-w-0">
              <p style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{t.title}</p>
              {t.detail && (
                <p style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)" }}>{t.detail}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --- command palette ------------------------------------------------------- */

export interface Command {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  run: () => void;
}

export function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-28"
      style={{ background: "rgba(3,6,12,0.66)" }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg border shadow-lg overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #1a212e 0%, #11161f 100%)",
          borderColor: "var(--color-rule-strong)",
          width: "34rem",
          boxShadow: "0 24px 70px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Run a step, jump to a view…"
          className="w-full px-4 py-3 border-b outline-none"
          style={{ borderColor: "var(--color-rule)", fontSize: "0.9375rem", background: "transparent" }}
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.map((c) => (
            <button
              key={c.id}
              disabled={c.disabled}
              onClick={() => {
                c.run();
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 disabled:opacity-40 row-hover"
            >
              <span style={{ fontSize: "0.875rem" }}>{c.label}</span>
              {c.hint && (
                <span className="mono ml-auto" style={{ color: "var(--color-ink-faint)", fontSize: "0.6875rem" }}>
                  {c.hint}
                </span>
              )}
            </button>
          ))}
          {!filtered.length && (
            <p className="px-4 py-6 text-center" style={{ color: "var(--color-ink-faint)", fontSize: "0.8125rem" }}>
              Nothing matches “{query}”.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <div
      className="surface px-8 py-12 text-center"
      style={{ borderColor: "var(--color-rule)" }}
    >
      <h3 className="display" style={{ fontSize: "1.125rem" }}>
        {title}
      </h3>
      <p
        className="mt-1.5 mx-auto"
        style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)", maxWidth: "28rem" }}
      >
        {body}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.disabled}
          className="btn-primary mt-4 px-4 py-2 rounded-md disabled:opacity-40"
          style={{ fontSize: "0.875rem" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
