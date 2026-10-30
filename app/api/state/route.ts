import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { graph } from "@/lib/graph";
import { dataMode, tavilyConfigured } from "@/lib/providers/tavily";
import { totalCostUsd, usageLedger } from "@/lib/providers/anthropic";


/** Everything the dashboard needs in one round trip. */
export async function GET() {
  return NextResponse.json({
    mode: dataMode(),
    providers: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      tavily: tavilyConfigured(),
      hunter: Boolean(process.env.HUNTER_API_KEY),
      resend: Boolean(process.env.RESEND_API_KEY),
      neo4j: Boolean(process.env.NEO4J_URI),
      flexprice: Boolean(process.env.FLEXPRICE_API_KEY),
      band: Boolean(process.env.BAND_PLANNER_API_KEY),
    },
    counts: {
      intakes: db.intakes.length,
      icps: db.icps.length,
      expansions: db.expansions.length,
      companies: db.companies.length,
      people: db.people.length,
      signals: db.signals.length,
      competitors: db.competitors.length,
      messages: db.messages.length,
      leads: db.leads.length,
    },
    graph: graph.stats(),
    ledger: db.ledger,
    llm: { calls: usageLedger().length, costUsd: Number(totalCostUsd().toFixed(4)) },
  });
}
