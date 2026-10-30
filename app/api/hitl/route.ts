import { NextRequest, NextResponse } from "next/server";
import { auditTrail, decide, dispatch, GateViolationError, pendingQueue } from "@/lib/hitl";
import { db } from "@/lib/db";
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
        rejectionReason: body.rejectionReason,
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

const state = () => ({
  messages: db.messages,
  approvals: db.approvals,
  dispatches: db.dispatches,
  leads: db.leads,
  ledger: db.ledger,
});
