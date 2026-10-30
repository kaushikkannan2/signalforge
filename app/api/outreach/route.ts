import { NextRequest, NextResponse } from "next/server";
import { activeIcp, db } from "@/lib/db";
import { draftSequence, reviewMessage, type VariantKey } from "@/lib/outreach";
import { emit } from "@/lib/thinking";
import { id as mkId } from "@/lib/ids";

export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({
    messages: db.messages,
    approvals: db.approvals,
    dispatches: db.dispatches,
  });
}

export async function POST(req: NextRequest) {
  const { personIds, variant = "signal_led", review = true } = (await req
    .json()
    .catch(() => ({}))) as { personIds?: string[]; variant?: VariantKey; review?: boolean };

  const icp = activeIcp();
  if (!icp || icp.status !== "approved") {
    return NextResponse.json({ error: "Approve an ICP first." }, { status: 409 });
  }

  // Default to the highest-fit enriched contacts — drafting for a person with
  // no resolvable address wastes a model call.
  const targets = (
    personIds?.length
      ? db.people.filter((p) => personIds.includes(p.id))
      : db.people.filter((p) => p.enrichment.email)
  ).slice(0, 4);

  if (!targets.length) {
    return NextResponse.json(
      { error: "No enriched contacts to write to. Run buyer discovery and enrichment first." },
      { status: 400 },
    );
  }

  const runId = mkId("run");
  try {
    // Alternate the A/B arm across recipients so the variant comparison is a
    // real split rather than one arm applied to everyone.
    const drafted = await Promise.all(
      targets.map((person, i) =>
        draftSequence(
          person.id,
          icp,
          runId,
          (i % 2 === 0 ? variant : variant === "signal_led" ? "peer_proof" : "signal_led") as VariantKey,
        ).catch((err) => {
          emit(runId, "Outreach", "error", `Draft failed for ${person.fullName}`, {
            detail: err instanceof Error ? err.message : String(err),
          });
          return [];
        }),
      ),
    );

    const messages = drafted.flat();

    if (review) {
      // Review every first touch — that is the one a human is most likely to
      // approve quickly, so it is where an unsupported claim would slip through.
      await Promise.all(
        messages
          .filter((m) => m.touch === 1)
          .map((m) =>
            reviewMessage(m.id, runId).catch(() => undefined),
          ),
      );
    }

    return NextResponse.json({ runId, messages: db.messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit(runId, "Outreach", "error", "Outreach generation failed", { detail: message });
    return NextResponse.json({ error: message, runId }, { status: 500 });
  }
}
