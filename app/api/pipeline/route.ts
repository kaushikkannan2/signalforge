import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { advanceLead, attributionSplit, byIndustry, byTier, funnel, variantStats } from "@/lib/pipeline";
import { costPerLead } from "@/lib/meter";
import { id as mkId } from "@/lib/ids";
import type { LeadStage } from "@/lib/types";

export async function GET() {
  return NextResponse.json({
    leads: db.leads,
    people: db.people,
    companies: db.companies,
    transitions: db.transitions,
    funnel: funnel(),
    attribution: attributionSplit(),
    variants: variantStats(),
    byIndustry: byIndustry(),
    byTier: byTier(),
    costPerLead: costPerLead(),
    meterEvents: db.meterEvents,
    ledger: db.ledger,
  });
}

/** A rep dragging a card is a rep action, and is attributed as one. */
export async function POST(req: NextRequest) {
  const { personId, to, actor = "sales_rep", actorName = "Kaushik (rep)", reason } =
    (await req.json()) as {
      personId: string;
      to: LeadStage;
      actor?: "ai_agent" | "sales_rep" | "system";
      actorName?: string;
      reason?: string;
    };

  const lead = advanceLead(personId, to, actor, actorName, {
    reason: reason ?? `Moved to ${to.replace(/_/g, " ")} from the board`,
    runId: mkId("run"),
  });

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ lead, leads: db.leads, transitions: db.transitions });
}
