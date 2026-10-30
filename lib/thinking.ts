// ============================================================================
// The Agent Thinking feed.
//
// Every reasoning step, provider call, graph query and gate decision is
// emitted here. The collapsible panel in the UI subscribes over SSE, and the
// same steps are persisted so the audit trail and the live view agree.
// ============================================================================

import { db } from "./db";
import { id as mkId, now } from "./ids";
import type { ThinkingStep } from "./types";

type Listener = (step: ThinkingStep) => void;

const bus = globalThis as unknown as { __gvListeners?: Set<Listener> };
const listeners: Set<Listener> = bus.__gvListeners ?? (bus.__gvListeners = new Set());

export function emit(
  runId: string,
  phase: string,
  kind: ThinkingStep["kind"],
  label: string,
  extra: Partial<Pick<ThinkingStep, "detail" | "query" | "durationMs">> = {},
): ThinkingStep {
  const step: ThinkingStep = {
    id: mkId("think"),
    runId,
    phase,
    kind,
    label,
    at: now(),
    ...extra,
  };
  db.thinking.push(step);
  // Keep the in-memory feed bounded; the panel only renders a window anyway.
  if (db.thinking.length > 2000) db.thinking.splice(0, db.thinking.length - 2000);
  for (const l of listeners) {
    try {
      l(step);
    } catch {
      // A broken SSE connection must never fail the run that is emitting.
    }
  }
  return step;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Wraps a unit of work so its duration and failure land in the feed. */
export async function traced<T>(
  runId: string,
  phase: string,
  kind: ThinkingStep["kind"],
  label: string,
  fn: () => Promise<T>,
  extra: { query?: string; detail?: string } = {},
): Promise<T> {
  const t0 = Date.now();
  emit(runId, phase, kind, label, extra);
  try {
    const result = await fn();
    emit(runId, phase, kind, `${label} — done`, { durationMs: Date.now() - t0 });
    return result;
  } catch (err) {
    emit(runId, phase, "error", `${label} — failed`, {
      detail: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - t0,
    });
    throw err;
  }
}

export function stepsFor(runId: string): ThinkingStep[] {
  return db.thinking.filter((s) => s.runId === runId);
}
