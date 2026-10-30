import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { approveIcp, clarifyIcp, decideExpansion, reinferIcp, summariseIcp } from "@/lib/icp";
import { emit } from "@/lib/thinking";
import { id as mkId } from "@/lib/ids";


export async function GET() {
  return NextResponse.json({
    intakes: db.intakes,
    icps: db.icps,
    expansions: db.expansions,
    summaries: Object.fromEntries(db.icps.map((i) => [i.id, summariseIcp(i)])),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    action: "approve_icp" | "decide_expansion" | "clarify" | "reinfer";
    answers?: { question: string; answer: string }[];
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

  if (body.action === "clarify" && body.icpId) {
    const icp = db.icps.find((i) => i.id === body.icpId);
    const intake = icp && db.intakes.find((i) => i.id === icp.intakeId);
    if (!icp || !intake) return NextResponse.json({ error: "ICP not found" }, { status: 404 });
    const questions = await clarifyIcp(icp, intake, runId);
    return NextResponse.json({ runId, questions, currentConfidence: icp.overallConfidence });
  }

  if (body.action === "reinfer" && body.icpId && body.answers) {
    const icp = db.icps.find((i) => i.id === body.icpId);
    const intake = icp && db.intakes.find((i) => i.id === icp.intakeId);
    if (!icp || !intake) return NextResponse.json({ error: "ICP not found" }, { status: 404 });
    const { icp: next, deltas, naics } = await reinferIcp(icp, intake, body.answers, runId);
    return NextResponse.json({
      runId,
      icp: next,
      deltas,
      naics,
      before: icp.overallConfidence,
      after: next.overallConfidence,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
