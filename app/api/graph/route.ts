import { NextRequest, NextResponse } from "next/server";
import { graph } from "@/lib/graph";
import { REASONING_QUERIES, type ReasoningQueryName } from "@/lib/reasoning";
import { emit } from "@/lib/thinking";
import { meter } from "@/lib/meter";
import { id as mkId } from "@/lib/ids";

export async function GET() {
  return NextResponse.json({ snapshot: graph.snapshot() });
}

export async function POST(req: NextRequest) {
  const { query } = (await req.json()) as { query?: ReasoningQueryName };
  const runId = mkId("run");

  const names = (query ? [query] : (Object.keys(REASONING_QUERIES) as ReasoningQueryName[])).filter(
    (n) => n in REASONING_QUERIES,
  );
  if (!names.length) return NextResponse.json({ error: "Unknown query" }, { status: 400 });

  const results = names.map((name) => {
    const result = REASONING_QUERIES[name]();
    // The Cypher shown in the panel is the real query, not a decorative string.
    emit(runId, "Graph", "graph_query", `${name}: ${result.findings.length} findings`, {
      query: result.cypher,
      durationMs: result.tookMs,
      detail: result.question,
    });
    return result;
  });

  await meter("graph_queries", { queries: names.join(","), store: process.env.NEO4J_URI ? "neo4j" : "in-process" }, {
    units: names.length,
    runId,
  });

  return NextResponse.json({ runId, results, snapshot: graph.snapshot() });
}
