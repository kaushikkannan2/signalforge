import { NextRequest, NextResponse } from "next/server";
import { activeIcp, db } from "@/lib/db";
import { discoverBuyers, seedInternalTeam } from "@/lib/discovery";
import { enrichAll } from "@/lib/enrichment";
import { ensureLead } from "@/lib/pipeline";
import { INTERNAL_TEAM } from "@/lib/fixtures/demo";
import { emit } from "@/lib/thinking";
import { id as mkId } from "@/lib/ids";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { enrich = true } = (await req.json().catch(() => ({}))) as { enrich?: boolean };
  const icp = activeIcp();
  if (!icp || icp.status !== "approved") {
    return NextResponse.json({ error: "Approve an ICP first." }, { status: 409 });
  }
  const runId = mkId("run");

  try {
    // Our own team goes in first so warm-intro paths have an origin to search from.
    seedInternalTeam(INTERNAL_TEAM);
    const people = await discoverBuyers(icp, runId);
    for (const p of people) ensureLead(p.id, icp.id);

    const enriched = enrich ? await enrichAll(runId, people.map((p) => p.id)) : [];

    return NextResponse.json({
      runId,
      people: db.people,
      enrichedCount: enriched.length,
      leads: db.leads,
      ledger: db.ledger,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit(runId, "Buyers", "error", "Buyer discovery failed", { detail: message });
    return NextResponse.json({ error: message, runId }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ people: db.people, leads: db.leads, ledger: db.ledger });
}
