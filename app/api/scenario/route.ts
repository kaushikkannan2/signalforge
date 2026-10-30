import { NextRequest, NextResponse } from "next/server";
import { resetDb, db } from "@/lib/db";
import { graph } from "@/lib/graph";
import { loadScenario } from "@/lib/fixtures/load-scenario";
import { SCENARIO_ACCOUNTS, SCENARIO_NOTE } from "@/lib/fixtures/scenario";
import { emit } from "@/lib/thinking";
import { id as mkId } from "@/lib/ids";
import { privacyMode } from "@/lib/privacy";
import { suppressHydration } from "@/lib/persist";

export const maxDuration = 120;

/** The demo-guide manifest: every record and the capability it demonstrates. */
export async function GET() {
  return NextResponse.json({
    note: SCENARIO_NOTE,
    privacyMode: privacyMode(),
    cases: SCENARIO_ACCOUNTS.flatMap((a) => [
      { kind: "account", name: a.name, demonstrates: a.demonstrates },
      ...a.people.map((p) => ({
        kind: "buyer",
        name: `${p.fullName} (${a.name})`,
        demonstrates: p.demonstrates,
      })),
    ]),
  });
}

export async function POST(req: NextRequest) {
  const { credits, scale = 0, seed } = (await req.json().catch(() => ({}))) as {
    credits?: number;
    scale?: number;
    seed?: number;
  };
  const runId = mkId("run");
  resetDb();
  // Stop the disk snapshot from being rehydrated over the top of this.
  suppressHydration();
  emit(runId, "Scenario", "gate", "Store reset before loading the scenario", {
    detail: "A demo that starts from leftover state is not reproducible.",
  });
  const t0 = Date.now();
  const result = await loadScenario(runId, { credits, scale, seed });
  const loadMs = Date.now() - t0;
  return NextResponse.json({
    runId,
    note: SCENARIO_NOTE,
    icp: result.icp,
    counts: {
      companies: db.companies.length,
      people: db.people.length,
      signals: db.signals.length,
      competitors: db.competitors.length,
      leads: db.leads.length,
      graphNodes: graph.nodes.size,
      graphEdges: graph.edges.length,
    },
    credits: result.credits,
    loadMs,
    distribution: result.distribution,
  });
}
