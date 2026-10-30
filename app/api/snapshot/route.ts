import { NextRequest, NextResponse } from "next/server";
import { loadSnapshot, saveSnapshot } from "@/lib/persist";
import { db } from "@/lib/db";
import { graph } from "@/lib/graph";

export async function POST(req: NextRequest) {
  const { action } = (await req.json().catch(() => ({ action: "save" }))) as {
    action?: "save" | "load";
  };
  if (action === "load") {
    const ok = await loadSnapshot();
    return NextResponse.json({ loaded: ok, counts: counts() });
  }
  const path = await saveSnapshot();
  return NextResponse.json({ saved: path, counts: counts() });
}

export async function GET() {
  return NextResponse.json({ counts: counts() });
}

const counts = () => ({
  companies: db.companies.length,
  people: db.people.length,
  signals: db.signals.length,
  competitors: db.competitors.length,
  messages: db.messages.length,
  leads: db.leads.length,
  graphNodes: graph.nodes.size,
  graphEdges: graph.edges.length,
});
