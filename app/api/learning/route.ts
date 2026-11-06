import { NextRequest, NextResponse } from "next/server";
import { exportDpoJsonl, learningReport, preferencePairs, simulateConvergence } from "@/lib/rl";

export async function GET(req: NextRequest) {
  // ?format=jsonl returns the DPO training file itself, not a description of it.
  if (new URL(req.url).searchParams.get("format") === "jsonl") {
    return new NextResponse(exportDpoJsonl(), {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": 'attachment; filename="signalforge-preferences.jsonl"',
      },
    });
  }
  return NextResponse.json({ ...learningReport(), pairs: preferencePairs().slice(0, 20) });
}

/**
 * Replays synthetic outcomes through the live update rule so the posteriors
 * visibly narrow. Explicitly a demonstration: the response echoes simulated so
 * no caller can mistake the result for measured engagement.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rounds = Math.min(Number(body.rounds) || 240, 2000);
  const trail = simulateConvergence(rounds, Number(body.seed) || 7);
  return NextResponse.json({
    simulated: true,
    note: "Outcomes drawn from fixed latent rates. Demonstrates the update rule, not measured engagement.",
    rounds,
    trail,
    ...learningReport(),
  });
}
