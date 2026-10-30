import { NextRequest, NextResponse } from "next/server";
import { exportDpoJsonl, learningReport, preferencePairs } from "@/lib/rl";

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
