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
  const { enrich = true, discover } = (await req.json().catch(() => ({}))) as {
    enrich?: boolean;
    discover?: boolean;
  };
  // When buyers already exist (a loaded scenario), the default is to enrich
  // what is there rather than spend search calls rediscovering it.
  const shouldDiscover = discover ?? db.people.length === 0;
  const icp = activeIcp();
  if (!icp || icp.status !== "approved") {
    return NextResponse.json({ error: "Approve an ICP first." }, { status: 409 });
  }
  const runId = mkId("run");

  try {
    // Our own team goes in first so warm-intro paths have an origin to search from.
    seedInternalTeam(INTERNAL_TEAM);

    const discovered = shouldDiscover ? await discoverBuyers(icp, runId) : [];
    for (const p of discovered) ensureLead(p.id, icp.id);

    // Target: newly discovered people, or every unenriched person already in
    // the store. Enriching the highest-fit accounts first matters once the
    // credit gate is in play — the gate should stop the LEAST valuable work.
    const targets = (discovered.length ? discovered : db.people.filter((p) => !p.enrichment.enrichedAt))
      .slice()
      .sort((a, b) => {
        const fa = db.companies.find((c) => c.id === a.companyId);
        const fb = db.companies.find((c) => c.id === b.companyId);
        return (fb?.fit.total ?? 0) - (fa?.fit.total ?? 0);
      });

    const enriched = enrich ? await enrichAll(runId, targets.map((p) => p.id)) : [];

    return NextResponse.json({
      runId,
      discovered: discovered.length,
      targeted: targets.length,
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
