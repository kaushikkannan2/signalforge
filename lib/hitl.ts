// ============================================================================
// Module 4c — The Human-in-the-Loop gateway.
//
// This file is the ONLY path to dispatch. `dispatch()` is not exported with a
// bypass, and it begins by looking up an ApprovalRecord for the message; with
// no record, or a record whose decision is a rejection, it throws before any
// transport is touched.
//
// That is the structural version of "mandatory approval checkpoint". The gate
// is not a UI convention that a future code path could forget to honour — it
// is a precondition inside the function that does the sending.
// ============================================================================

import { Resend } from "resend";
import { db, findCompany, findPerson } from "./db";
import { graph } from "./graph";
import { emit } from "./thinking";
import { meter } from "./meter";
import { id as mkId, now } from "./ids";
import type { ApprovalRecord, DispatchRecord, LeadStage, OutreachMessage } from "./types";
import { advanceLead } from "./pipeline";
import { recordReward } from "./rl";
import { assertSafeRecipient, DispatchSafetyError } from "./privacy";

export class GateViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GateViolationError";
  }
}

export function approvalFor(messageId: string): ApprovalRecord | undefined {
  return db.approvals
    .filter((a) => a.messageId === messageId)
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
}

export function decide(
  messageId: string,
  input: {
    decision: ApprovalRecord["decision"];
    decidedBy: string;
    editedBody?: string;
    editedSubject?: string;
    rejectionReason?: string;
  },
  runId: string,
): ApprovalRecord {
  const message = db.messages.find((m) => m.id === messageId);
  if (!message) throw new Error(`Message ${messageId} not found`);
  if (message.status === "sent") {
    throw new GateViolationError("Already sent — a sent message cannot be re-decided.");
  }

  const record: ApprovalRecord = {
    id: mkId("appr"),
    messageId,
    decision: input.decision,
    decidedBy: input.decidedBy,
    // Always 'human'. Recorded explicitly so the audit trail can never be
    // read as though an agent approved its own copy.
    actorType: "human",
    editedBody: input.editedBody,
    editedSubject: input.editedSubject,
    rejectionReason: input.rejectionReason,
    decidedAt: now(),
  };
  db.approvals.push(record);

  if (input.decision === "rejected") {
    message.status = "rejected";
  } else {
    message.status = "approved";
    if (input.editedBody) {
      message.body = input.editedBody;
      message.wordCount = input.editedBody.trim().split(/\s+/).length;
    }
    if (input.editedSubject) message.subject = input.editedSubject;
  }

  const person = findPerson(message.personId);

  // The gate is the reward signal. A human reading copy and approving,
  // editing or rejecting it is the cleanest preference label this system can
  // get, so it updates the policy immediately rather than waiting for a reply.
  recordReward(message, person, input.decision === "rejected" ? "rejection" : "approval", runId);

  emit(
    runId,
    "HITL gate",
    "gate",
    `${input.decision.replace(/_/g, " ")} — touch ${message.touch} to ${person?.fullName ?? message.personId}`,
    {
      detail:
        input.decision === "rejected"
          ? `Reason: ${input.rejectionReason ?? "not given"}. This message can never be dispatched.`
          : `Approved by ${input.decidedBy}${input.editedBody ? " after editing the copy" : ""}. Dispatch is now permitted for this message only.`,
    },
  );

  return record;
}

export interface DispatchOptions {
  /** Where mail actually goes in a demo. Never the prospect's real inbox. */
  redirectTo?: string;
  runId: string;
  actorName?: string;
}

/**
 * The only way a message leaves the system.
 *
 * Preconditions, checked in this order and before any transport call:
 *   1. The message exists.
 *   2. An approval record exists for it.
 *   3. That record is not a rejection.
 *   4. The message has not already been sent.
 */
export async function dispatch(
  messageId: string,
  opts: DispatchOptions,
): Promise<DispatchRecord> {
  const message = db.messages.find((m) => m.id === messageId);
  if (!message) throw new GateViolationError(`Message ${messageId} not found`);

  const approval = approvalFor(messageId);
  if (!approval) {
    emit(opts.runId, "HITL gate", "gate", "Dispatch refused — no human approval on record", {
      detail: `Message ${messageId} has never been reviewed. There is no code path that sends it.`,
    });
    throw new GateViolationError(
      "Dispatch refused: no approval record exists for this message. A human must approve it first.",
    );
  }
  if (approval.decision === "rejected") {
    emit(opts.runId, "HITL gate", "gate", "Dispatch refused — message was rejected", {
      detail: `Rejected by ${approval.decidedBy}: ${approval.rejectionReason ?? "no reason given"}`,
    });
    throw new GateViolationError("Dispatch refused: this message was rejected by a human.");
  }
  if (message.status === "sent") {
    throw new GateViolationError("Dispatch refused: already sent.");
  }

  const person = findPerson(message.personId);
  const company = findCompany(message.companyId);
  const to = opts.redirectTo ?? person?.enrichment.email;

  if (!to) {
    message.status = "failed";
    throw new GateViolationError("No deliverable address — enrich the contact first.");
  }

  // Second, independent guard. The HITL gate asks "did a human approve this?";
  // this asks "is it safe to actually deliver?". A real prospect receiving
  // unsolicited mail because of a demo misclick is a harm no approval record
  // makes acceptable.
  let safeTo: string;
  try {
    safeTo = assertSafeRecipient(to, person?.enrichment.email);
  } catch (err) {
    if (err instanceof DispatchSafetyError) {
      emit(opts.runId, "Dispatch", "gate", "Send blocked by recipient safety guard", {
        detail: err.message,
      });
    }
    throw err;
  }

  let record: DispatchRecord;

  if (message.channel === "email" && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { data, error } = await resend.emails.send({
        from: "SignalForge <onboarding@resend.dev>",
        to: [safeTo],
        subject: message.subject ?? `Following up — ${company?.name ?? ""}`,
        text: `${message.body}\n\n—\nSent via SignalForge after human approval ${approval.id}.${
          opts.redirectTo ? `\nDemo redirect: intended recipient was ${person?.enrichment.email ?? "unresolved"}.` : ""
        }`,
      });
      if (error) throw new Error(error.message);
      record = {
        id: mkId("disp"),
        messageId,
        approvalId: approval.id,
        channel: message.channel,
        to: safeTo,
        provider: "resend",
        providerMessageId: data?.id,
        status: "sent",
        dispatchedAt: now(),
      };
    } catch (err) {
      record = {
        id: mkId("disp"),
        messageId,
        approvalId: approval.id,
        channel: message.channel,
        to: safeTo,
        provider: "resend",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        dispatchedAt: now(),
      };
    }
  } else {
    // No transport configured, or LinkedIn (whose API is not open for
    // unsolicited messaging). Recorded as 'simulated' rather than 'sent', so
    // the dashboard never overstates what actually left the building.
    record = {
      id: mkId("disp"),
      messageId,
      approvalId: approval.id,
      channel: message.channel,
      to: safeTo,
      provider: message.channel === "linkedin" ? "linkedin-queue" : "none",
      status: "simulated",
      error:
        message.channel === "linkedin"
          ? "LinkedIn messaging has no open API for unsolicited outreach; queued for the rep's browser session."
          : "RESEND_API_KEY not set — dispatch recorded but no mail was transmitted.",
      dispatchedAt: now(),
    };
  }

  db.dispatches.push(record);
  message.status = record.status === "failed" ? "failed" : "sent";

  graph.addEdge("contacted_via", message.personId, message.companyId, {
    channel: message.channel,
    touch: message.touch,
    at: record.dispatchedAt,
    status: record.status,
  });

  if (record.status !== "failed") {
    await meter(
      "outreach_sent",
      { messageId, personId: message.personId, channel: message.channel, touch: message.touch },
      { runId: opts.runId },
    );
    // Dispatch is an AI-executed action following a human decision; the
    // pipeline records both facts rather than collapsing them.
    advanceLead(message.personId, "contacted", "ai_agent", opts.actorName ?? "Builder agent", {
      reason: `Touch ${message.touch} ${record.status} via ${record.provider} after approval ${approval.id}`,
      runId: opts.runId,
    });
  }

  emit(
    opts.runId,
    "Dispatch",
    record.status === "failed" ? "error" : "validation",
    `Touch ${message.touch} ${record.status} → ${safeTo}`,
    {
      detail: `${record.provider}${record.providerMessageId ? ` · id ${record.providerMessageId}` : ""}${
        record.error ? ` · ${record.error}` : ""
      } · audit: approval ${approval.id}`,
    },
  );

  return record;
}

/** Full audit trail for one message, for the review UI and the design doc. */
export function auditTrail(messageId: string) {
  return {
    message: db.messages.find((m) => m.id === messageId),
    approvals: db.approvals.filter((a) => a.messageId === messageId),
    dispatches: db.dispatches.filter((d) => d.messageId === messageId),
  };
}

export function pendingQueue(): OutreachMessage[] {
  return db.messages
    .filter((m) => m.status === "pending_approval" || m.status === "drafted")
    .sort((a, b) => a.personId.localeCompare(b.personId) || a.touch - b.touch);
}
