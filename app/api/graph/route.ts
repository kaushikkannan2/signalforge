import { NextRequest, NextResponse } from "next/server";
import { graph } from "@/lib/graph";
import { REASONING_QUERIES, type ReasoningQueryName } from "@/lib/reasoning";
import { emit } from "@/lib/thinking";
import { meter } from "@/lib/meter";
import { id as mkId } from "@/lib/ids";
import { neo4jConfigured, runCypher, status as neoStatus, syncGraph } from "@/lib/providers/neo4j";

/**
 * The full graph is megabytes at production scale, and the constellation only
 * ever renders a neighbourhood — so the neighbourhood is computed here rather
 * than shipping the whole thing and pruning in the browser.
 *
 *   ?focus=<nodeId>&hops=2   two-hop neighbourhood of one node
 *   ?stats=1                 counts only
 *   (no params)              neighbourhood of the densest qualified account
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("stats")) {
    return NextResponse.json({ stats: graph.stats(), neo4j: await neoStatus() });
  }

  const hops = Math.min(3, Math.max(1, Number(url.searchParams.get("hops") ?? 2)));
  const cap = Math.min(200, Math.max(10, Number(url.searchParams.get("cap") ?? 70)));
  let focus = url.searchParams.get("focus") ?? undefined;

  if (!focus || !graph.nodes.has(focus)) {
    // Densest non-external company, so the first paint is never empty and is
    // the most interesting thing to look at.
    const companies = graph
      .byLabel("Company")
      .filter((n) => !n.props.external && !n.props.disqualified);
    focus = companies
      .map((n) => ({ id: n.id, degree: graph.neighbours(n.id).length }))
      .sort((a, b) => b.degree - a.degree)[0]?.id;
  }

  if (!focus) {
    return NextResponse.json({ nodes: [], edges: [], stats: graph.stats(), focus: null });
  }

  const depth = new Map<string, number>([[focus, 0]]);
  const queue = [focus];
  while (queue.length && depth.size < cap) {
    const current = queue.shift()!;
    const d = depth.get(current)!;
    if (d >= hops) continue;
    for (const { node } of graph.neighbours(current)) {
      if (depth.has(node.id) || depth.size >= cap) continue;
      depth.set(node.id, d + 1);
      queue.push(node.id);
    }
  }

  const keep = new Set(depth.keys());
  return NextResponse.json({
    focus,
    hops,
    nodes: [...keep].map((id) => {
      const n = graph.nodes.get(id)!;
      return { id: n.id, label: n.label, name: n.name, props: n.props };
    }),
    edges: graph.edges
      .filter((e) => keep.has(e.from) && keep.has(e.to))
      .map((e) => ({ id: e.id, type: e.type, from: e.from, to: e.to, props: e.props })),
    stats: graph.stats(),
  });
}

export async function POST(req: NextRequest) {
  const { query, mirror = true } = (await req.json()) as {
    query?: ReasoningQueryName;
    mirror?: boolean;
  };
  const runId = mkId("run");

  const names = (query ? [query] : (Object.keys(REASONING_QUERIES) as ReasoningQueryName[])).filter(
    (n) => n in REASONING_QUERIES,
  );
  if (!names.length) return NextResponse.json({ error: "Unknown query" }, { status: 400 });

  // Write-through to Neo4j before querying it, so the database actually holds
  // what the traversal holds. No-ops when NEO4J_URI is unset, and reports
  // whether it did anything rather than letting the UI assume.
  const sync = mirror && neo4jConfigured() ? await syncGraph() : null;
  if (sync?.mirrored) {
    emit(runId, "Graph", "tool_call", `Mirrored ${sync.nodes} nodes / ${sync.edges} edges to Neo4j`, {
      detail: `${sync.tookMs}ms. The in-process graph stays the system of record; this is the write-through.`,
    });
  } else if (sync?.error) {
    emit(runId, "Graph", "error", "Neo4j mirror failed — traversal is unaffected", {
      detail: sync.error,
    });
  }

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

  // Execute the SAME Cypher against Neo4j. When `ran` is true the rows below
  // came out of the database, not out of our traversal — which is the only
  // thing that makes "the Cypher is real" a checkable claim rather than a
  // caption next to a string.
  const executed = sync?.mirrored
    ? await Promise.all(
        results.map(async (r) => {
          const run = await runCypher(r.cypher);
          emit(
            runId,
            "Graph",
            run.ran ? "graph_query" : "error",
            run.ran
              ? `Neo4j executed ${r.queryName}: ${run.rows.length} rows in ${run.tookMs}ms`
              : `Neo4j could not execute ${r.queryName}`,
            { query: r.cypher, detail: run.error, durationMs: run.tookMs },
          );
          return { queryName: r.queryName, ran: run.ran, rows: run.rows.length, tookMs: run.tookMs, error: run.error };
        }),
      )
    : [];

  await meter(
    "graph_queries",
    { queries: names.join(","), store: sync?.mirrored ? "neo4j+in-process" : "in-process" },
    { units: names.length, runId },
  );

  return NextResponse.json({
    runId,
    results,
    stats: graph.stats(),
    neo4j: {
      configured: neo4jConfigured(),
      mirror: sync,
      cypherExecuted: executed,
    },
  });
}
