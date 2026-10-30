import { NextRequest, NextResponse } from "next/server";
import { db, activeIcp } from "@/lib/db";
import { discoverAccounts } from "@/lib/discovery";
import { mapCompetitors } from "@/lib/competitors";
import { emit } from "@/lib/thinking";
import { id as mkId } from "@/lib/ids";

export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({
    companies: db.companies,
    signals: db.signals,
    competitors: db.competitors,
    people: db.people,
  });
}

export async function POST(req: NextRequest) {
  const { icpId, includeCompetitors = true } = (await req.json().catch(() => ({}))) as {
    icpId?: string;
    includeCompetitors?: boolean;
  };

  const icp = icpId ? db.icps.find((i) => i.id === icpId) : activeIcp();
  if (!icp) {
    return NextResponse.json({ error: "No ICP yet — run intake first." }, { status: 400 });
  }
  // The approval gate is load-bearing, not decorative: discovery refuses to
  // spend a provider call against a profile no human has signed off on.
  if (icp.status !== "approved") {
    return NextResponse.json(
      { error: "This ICP has not been approved. Approve the profile before running discovery." },
      { status: 409 },
    );
  }

  const intake = db.intakes.find((i) => i.id === icp.intakeId);
  if (!intake) return NextResponse.json({ error: "Intake not found" }, { status: 404 });

  const runId = mkId("run");
  try {
    // Independent work, so it runs concurrently: account extraction and the
    // competitive landscape share no state, and serialising them was the
    // single largest contributor to run latency.
    const [discovery, competitors] = await Promise.all([
      discoverAccounts(icp, runId),
      includeCompetitors
        ? mapCompetitors(intake, icp, runId).catch((err) => {
            emit(runId, "Competitors", "error", "Competitor mapping failed — accounts unaffected", {
              detail: err instanceof Error ? err.message : String(err),
            });
            return [];
          })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      runId,
      ...discovery,
      signals: db.signals,
      competitors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit(runId, "Discovery", "error", "Discovery failed", { detail: message });
    return NextResponse.json({ error: message, runId }, { status: 500 });
  }
}
