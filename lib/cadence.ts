// ============================================================================
// Follow-up cadence.
//
// A sequence is three touches, and until now nothing said WHEN touches 2 and 3
// go out, or that they must stop once the prospect has answered. The second
// gap is the dangerous one: a "just bumping this" note to someone who replied
// yesterday is the fastest way to turn a warm reply cold.
//
// Two rules, both enforced inside dispatch() as extra preconditions. Neither
// replaces the approval check; a touch needs its own human approval AND has
// to be due.
//
//   1. Order and spacing. Touch N may only go out after touch N-1 was
//      delivered, and not before CADENCE_DAYS[N] - CADENCE_DAYS[N-1] days
//      have passed. The rep can choose to send early; that overrides timing
//      only, never approval.
//   2. Stop on reply. Once the lead reaches a stage where the conversation is
//      live or decided (replied, meeting booked, closed), every unsent touch
//      in the sequence is halted. Halted is derived from the lead's stage
//      rather than stored, so a human who moves the lead back reopens the
//      sequence without anyone having to clean up flags.
//
// The core function is pure (no db import) so the approval queue can show the
// same status the server enforces.
// ============================================================================

import type { DispatchRecord, LeadStage, OutreachMessage } from "./types";

/** Days after touch 1 is delivered at which each touch becomes due. */
export const CADENCE_DAYS: Record<number, number> = { 1: 0, 2: 3, 3: 7 };

/** Lead stages at which the remaining touches must not go out. */
export const HALTING_STAGES: readonly LeadStage[] = [
  "replied",
  "meeting_booked",
  "closed_won",
  "closed_lost",
];

const DAY_MS = 24 * 60 * 60 * 1000;

export type CadenceState = "ready" | "waiting" | "blocked" | "halted" | "sent";

export interface CadenceStatus {
  state: CadenceState;
  /** ISO time the touch becomes due. Set when state is "waiting" or "ready" after a gap. */
  dueAt?: string;
  reason: string;
}

/** Delivered means a dispatch the provider accepted or that was recorded as simulated. */
function deliveredAt(messageId: string, dispatches: DispatchRecord[]): string | undefined {
  return dispatches
    .filter((d) => d.messageId === messageId && d.status !== "failed")
    .map((d) => d.dispatchedAt)
    .sort()
    .at(-1);
}

export function gapDays(touch: number): number {
  const current = CADENCE_DAYS[touch] ?? CADENCE_DAYS[3];
  const previous = CADENCE_DAYS[touch - 1] ?? 0;
  return Math.max(0, current - previous);
}

export function computeCadence(
  message: OutreachMessage,
  ctx: {
    messages: OutreachMessage[];
    dispatches: DispatchRecord[];
    leadStage?: LeadStage;
    nowMs: number;
  },
): CadenceStatus {
  if (message.status === "sent") return { state: "sent", reason: "Already sent." };

  if (ctx.leadStage && HALTING_STAGES.includes(ctx.leadStage)) {
    return {
      state: "halted",
      reason: `Sequence stopped: the lead is at "${ctx.leadStage.replace(/_/g, " ")}". Move the lead back to reopen it.`,
    };
  }

  if (message.touch <= 1) return { state: "ready", reason: "First touch." };

  const previous = ctx.messages.find(
    (m) => m.sequenceId === message.sequenceId && m.touch === message.touch - 1,
  );
  // A sequence missing its earlier touch (e.g. trimmed by the drafter) has no
  // ordering to enforce.
  if (!previous) return { state: "ready", reason: `No touch ${message.touch - 1} in this sequence.` };

  if (previous.status !== "sent") {
    return { state: "blocked", reason: `Touch ${previous.touch} has not been sent yet.` };
  }

  const sentAt = deliveredAt(previous.id, ctx.dispatches);
  if (!sentAt) {
    // Seeded or imported data can mark a touch sent without a dispatch
    // record. There is no send time to space from, so don't invent one.
    return { state: "ready", reason: `Touch ${previous.touch} is sent; its send time is unknown.` };
  }

  const gap = gapDays(message.touch);
  const dueMs = Date.parse(sentAt) + gap * DAY_MS;
  const dueAt = new Date(dueMs).toISOString();
  if (ctx.nowMs < dueMs) {
    const days = Math.ceil((dueMs - ctx.nowMs) / DAY_MS);
    return {
      state: "waiting",
      dueAt,
      reason: `Due in ${days} day${days === 1 ? "" : "s"}: touch ${message.touch} follows touch ${previous.touch} by ${gap} days.`,
    };
  }
  return { state: "ready", dueAt, reason: `Due since ${dueAt.slice(0, 10)}.` };
}
