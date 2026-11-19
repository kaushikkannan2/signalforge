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
  const body = (await req.json()) as {
    action: "approve" | "edit_and_approve" | "reject" | "dispatch";
    messageId: string;
    decidedBy?: string;
    editedBody?: string;
    editedSubject?: string;
    rejectionReason?: string;
    rejectionCategory?: string;
  };

  const invalid = validate(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

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

const ACTIONS = new Set(["approve", "edit_and_approve", "reject", "dispatch"]);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Rejects malformed decisions before anything is written to the audit trail. */
function validate(body: {
  action?: unknown;
  messageId?: unknown;
  editedBody?: unknown;
  editedSubject?: unknown;
  rejectionReason?: unknown;
  rejectionCategory?: unknown;
}): string | null {
  if (!ACTIONS.has(body.action as string)) return "Unknown action.";
  if (!nonEmpty(body.messageId)) return "messageId is required.";

  if (body.action === "reject") {
    if (!isRejectionCategory(body.rejectionCategory)) {
      return `rejectionCategory must be one of: ${Object.keys(REJECTION_CATEGORIES).join(", ")}.`;
    }
    if (body.rejectionCategory === "other" && !nonEmpty(body.rejectionReason)) {
      return "Say why when the rejection category is \"other\".";
    }
  }

  if (body.action === "edit_and_approve") {
    if (body.editedBody !== undefined && !nonEmpty(body.editedBody)) return "editedBody cannot be empty.";
    if (body.editedSubject !== undefined && !nonEmpty(body.editedSubject)) return "editedSubject cannot be empty.";
    if (body.editedBody === undefined && body.editedSubject === undefined) {
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
