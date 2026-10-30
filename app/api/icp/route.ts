import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { approveIcp, decideExpansion } from "@/lib/icp";
import { emit } from "@/lib/thinking";
import { id as mkId } from "@/lib/ids";


export async function GET() {
  return NextResponse.json({
    intakes: db.intakes,
    icps: db.icps,
    expansions: db.expansions,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    action: "approve_icp" | "decide_expansion";
    icpId?: string;
    expansionId?: string;
    decision?: "accepted" | "adjusted" | "dismissed";
    note?: string;
  };

  const runId = mkId("run");

  if (body.action === "approve_icp" && body.icpId) {
    const icp = approveIcp(body.icpId);
    if (!icp) return NextResponse.json({ error: "ICP not found" }, { status: 404 });
    emit(runId, "ICP approval", "gate", "ICP approved by human — discovery unlocked", {
      detail: `${icp.id} at ${(icp.overallConfidence * 100).toFixed(0)}% overall confidence`,
    });
    return NextResponse.json({ icp });
  }

  if (body.action === "decide_expansion" && body.expansionId && body.decision) {
    const exp = decideExpansion(body.expansionId, body.decision, body.note);
    if (!exp) return NextResponse.json({ error: "Expansion not found" }, { status: 404 });
    emit(runId, "ICP expansion", "gate", `Segment ${body.decision}: ${exp.segmentName}`, {
      detail: body.note,
    });
    return NextResponse.json({ expansion: exp });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
