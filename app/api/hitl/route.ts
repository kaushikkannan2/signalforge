import { NextRequest, NextResponse } from "next/server";
import { auditTrail, decide, dispatch, GateViolationError, pendingQueue } from "@/lib/hitl";
import { db } from "@/lib/db";
import { isRejectionCategory, REJECTION_CATEGORIES } from "@/lib/types";
import { id as mkId } from "@/lib/ids";

export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({
    queue: pendingQueue(),
    messages: db.messages,
    approvals: db.approvals,
    dispatches: db.dispatches,
  });
}

export async function POST(req: NextRequest) {
  const raw: unknown = await req.json().catch(() => null);
  const invalid = validate(raw);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const body = raw as {
    action: "approve" | "edit_and_approve" | "reject" | "dispatch";
    messageId: string;
    decidedBy?: string;
    editedBody?: string;
    editedSubject?: string;
    rejectionReason?: string;
    rejectionCategory?: string;
  };

  const runId = mkId("run");
  const decidedBy = body.decidedBy ?? "Kaushik (rep)";

  try {
    if (body.action === "dispatch") {
      // Deliberately redirected: in a demo, mail goes to our own inbox and the
      // record states whose address it would have gone to in production.
      const record = await dispatch(body.messageId, {
        runId,
        redirectTo: process.env.DEMO_INBOX,
        actorName: "Builder agent",
      });
      return NextResponse.json({ dispatch: record, audit: auditTrail(body.messageId), ...state() });
    }

    const approval = decide(
      body.messageId,
      {
        decision:
          body.action === "reject"
            ? "rejected"
            : body.action === "edit_and_approve"
              ? "edited_and_approved"
              : "approved",
        decidedBy,
        editedBody: body.editedBody,
        editedSubject: body.editedSubject,
        rejectionReason: body.rejectionReason?.trim() || undefined,
        rejectionCategory: isRejectionCategory(body.rejectionCategory) ? body.rejectionCategory : undefined,
      },
      runId,
    );

    return NextResponse.json({ approval, audit: auditTrail(body.messageId), ...state() });
  } catch (err) {
    const status = err instanceof GateViolationError ? 403 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), gate: status === 403 },
      { status },
    );
  }
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Fields each action may carry, with a length cap for each string. */
const FIELDS: Record<string, Record<string, number>> = {
  approve: { decidedBy: 120 },
  edit_and_approve: { decidedBy: 120, editedBody: 10_000, editedSubject: 300 },
  reject: { decidedBy: 120, rejectionCategory: 40, rejectionReason: 2_000 },
  dispatch: {},
};

/**
 * Rejects malformed decisions before anything is written to the audit trail.
 * Every field decide() or dispatch() consumes is type-checked here, and
 * fields that don't belong to the action are refused rather than ignored,
 * because decide() would otherwise apply an edit carried on a plain approve.
 */
function validate(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return "Body must be a JSON object.";
  const b = body as Record<string, unknown>;
  const allowed = typeof b.action === "string" ? FIELDS[b.action] : undefined;
  if (!allowed || !Object.hasOwn(FIELDS, b.action as string)) return "Unknown action.";
  if (!nonEmpty(b.messageId)) return "messageId is required.";

  for (const [key, value] of Object.entries(b)) {
    if (key === "action" || key === "messageId" || value === undefined) continue;
    const max = allowed[key];
    if (max === undefined) return `${key} is not accepted for ${b.action}.`;
    if (typeof value !== "string") return `${key} must be a string.`;
    if (value.length > max) return `${key} is longer than ${max} characters.`;
  }
  if (b.decidedBy !== undefined && !nonEmpty(b.decidedBy)) return "decidedBy cannot be empty.";

  if (b.action === "reject") {
    if (!isRejectionCategory(b.rejectionCategory)) {
      return `rejectionCategory must be one of: ${Object.keys(REJECTION_CATEGORIES).join(", ")}.`;
    }
    if (b.rejectionCategory === "other" && !nonEmpty(b.rejectionReason)) {
      return "Say why when the rejection category is \"other\".";
    }
  }

  if (b.action === "edit_and_approve") {
    if (b.editedBody !== undefined && !nonEmpty(b.editedBody)) return "editedBody cannot be empty.";
    if (b.editedSubject !== undefined && !nonEmpty(b.editedSubject)) return "editedSubject cannot be empty.";
    if (b.editedBody === undefined && b.editedSubject === undefined) {
      return "edit_and_approve needs editedBody or editedSubject.";
    }
  }
  return null;
}

const state = () => ({
  messages: db.messages,
  approvals: db.approvals,
  dispatches: db.dispatches,
  leads: db.leads,
  ledger: db.ledger,
});
