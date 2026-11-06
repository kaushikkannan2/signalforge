// ============================================================================
// Neo4j — the native graph store.
//
// Honest history of this file: for most of the build it did not exist. The
// driver was installed, the comments described a write-through mirror, and the
// docs claimed the Cypher ran against Neo4j. None of that was true — the
// Cypher strings were display-only. This file makes the claim true.
//
// Topology. The in-process graph stays the system of record, because a demo
// must not depend on a cold cloud instance and because the traversals are
// microseconds locally. Neo4j is a genuine write-through mirror: nodes and
// edges are pushed with MERGE, and the three reasoning queries can be executed
// against it for real, returning rows from the database rather than from our
// own traversal.
//
// Everything here degrades to a no-op when NEO4J_URI is unset, and every
// function reports whether it actually did anything — so the UI can say
// "mirrored to Neo4j" or "in-process only" truthfully rather than inferring it
// from the presence of an env var.
// ============================================================================

import neo4j, { type Driver } from "neo4j-driver";
import { graph } from "../graph";

export interface Neo4jStatus {
  configured: boolean;
  connected: boolean;
  error?: string;
  nodes?: number;
  relationships?: number;
}

const g = globalThis as unknown as { __sfNeo?: Driver | null };

export const neo4jConfigured = () =>
  Boolean(process.env.NEO4J_URI && process.env.NEO4J_PASSWORD);

function driver(): Driver | null {
  if (!neo4jConfigured()) return null;
  if (g.__sfNeo !== undefined && g.__sfNeo !== null) return g.__sfNeo;
  try {
    g.__sfNeo = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USERNAME ?? "neo4j", process.env.NEO4J_PASSWORD!),
      { maxConnectionPoolSize: 10, connectionTimeout: 8000 },
    );
    return g.__sfNeo;
  } catch {
    g.__sfNeo = null;
    return null;
  }
}

/** Round-trips a trivial query, so "connected" means connected. */
export async function status(): Promise<Neo4jStatus> {
  if (!neo4jConfigured()) return { configured: false, connected: false };
  const d = driver();
  if (!d) return { configured: true, connected: false, error: "driver init failed" };
  const session = d.session();
  try {
    const res = await session.run(
      "MATCH (n) WITH count(n) AS nodes MATCH ()-[r]->() RETURN nodes, count(r) AS rels",
    );
    const row = res.records[0];
    return {
      configured: true,
      connected: true,
      nodes: row ? Number(row.get("nodes")) : 0,
      relationships: row ? Number(row.get("rels")) : 0,
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      error: err instanceof Error ? err.message.slice(0, 180) : String(err),
    };
  } finally {
    await session.close();
  }
}

/**
 * Uniqueness constraints per label. Without these, MERGE on a 7,000-node graph
 * does a full scan per statement and the sync takes minutes rather than
 * seconds — so this is correctness and performance, not decoration.
 */
const LABELS = ["Company", "Person", "Product", "Competitor", "Signal", "Lead"] as const;

export async function ensureSchema(): Promise<{ applied: string[]; error?: string }> {
  const d = driver();
  if (!d) return { applied: [] };
  const session = d.session();
  const applied: string[] = [];
  try {
    for (const label of LABELS) {
      await session.run(
        `CREATE CONSTRAINT ${label.toLowerCase()}_id IF NOT EXISTS
         FOR (n:${label}) REQUIRE n.id IS UNIQUE`,
      );
      applied.push(label);
    }
    return { applied };
  } catch (err) {
    return { applied, error: err instanceof Error ? err.message.slice(0, 180) : String(err) };
  } finally {
    await session.close();
  }
}

export interface SyncResult {
  mirrored: boolean;
  nodes: number;
  edges: number;
  tookMs: number;
  error?: string;
}

/**
 * Pushes the whole in-process graph to Neo4j.
 *
 * Batched with UNWIND rather than one statement per node: at 7,000 nodes the
 * per-statement version is thousands of round trips, which on a managed
 * instance is minutes of latency for no reason.
 *
 * Node properties are flattened to primitives because Neo4j rejects nested
 * maps as property values — a detail that silently fails half a sync if you
 * do not handle it.
 */
export async function syncGraph(): Promise<SyncResult> {
  const t0 = Date.now();
  const d = driver();
  if (!d) {
    return { mirrored: false, nodes: 0, edges: 0, tookMs: 0, error: "NEO4J_URI not set" };
  }

  const flatten = (props: Record<string, unknown>) => {
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "object") out[k] = JSON.stringify(v).slice(0, 400);
      else out[k] = v as string | number | boolean;
    }
    return out;
  };

  const session = d.session();
  try {
    await ensureSchema();

    let nodes = 0;
    for (const label of LABELS) {
      const batch = graph
        .byLabel(label)
        .map((n) => ({ id: n.id, name: n.name, props: flatten(n.props) }));
      if (!batch.length) continue;
      await session.run(
        `UNWIND $batch AS row
         MERGE (n:${label} {id: row.id})
         SET n.name = row.name, n += row.props`,
        { batch },
      );
      nodes += batch.length;
    }

    // Relationship type can't be parameterised in Cypher, so edges are grouped
    // by type and one statement is issued per type.
    const byType = new Map<string, { from: string; to: string; props: Record<string, unknown> }[]>();
    for (const e of graph.edges) {
      if (!byType.has(e.type)) byType.set(e.type, []);
      byType.get(e.type)!.push({ from: e.from, to: e.to, props: flatten(e.props) });
    }

    let edges = 0;
    for (const [type, batch] of byType) {
      await session.run(
        `UNWIND $batch AS row
         MATCH (a {id: row.from})
         MATCH (b {id: row.to})
         MERGE (a)-[r:${type}]->(b)
         SET r += row.props`,
        { batch },
      );
      edges += batch.length;
    }

    return { mirrored: true, nodes, edges, tookMs: Date.now() - t0 };
  } catch (err) {
    return {
      mirrored: false,
      nodes: 0,
      edges: 0,
      tookMs: Date.now() - t0,
      error: err instanceof Error ? err.message.slice(0, 220) : String(err),
    };
  } finally {
    await session.close();
  }
}

export interface CypherRun {
  ran: boolean;
  rows: Record<string, unknown>[];
  tookMs: number;
  error?: string;
}

/**
 * Executes one of the reasoning queries against Neo4j for real.
 *
 * This is the function whose absence made the earlier claim false. When it
 * returns `ran: true`, the rows in the UI came out of the database.
 */
export async function runCypher(cypher: string, params: Record<string, unknown> = {}): Promise<CypherRun> {
  const t0 = Date.now();
  const d = driver();
  if (!d) return { ran: false, rows: [], tookMs: 0, error: "NEO4J_URI not set" };
  const session = d.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const res = await session.run(cypher, params);
    return {
      ran: true,
      tookMs: Date.now() - t0,
      rows: res.records.map((r) => {
        const row: Record<string, unknown> = {};
        for (const key of r.keys) {
          const v = r.get(key);
          // Neo4j integers are {low, high} objects; collapse them so the UI
          // doesn't render an object where a number belongs.
          row[String(key)] =
            v && typeof v === "object" && "low" in v ? Number(neo4j.integer.toNumber(v)) : v;
        }
        return row;
      }),
    };
  } catch (err) {
    return {
      ran: false,
      rows: [],
      tookMs: Date.now() - t0,
      error: err instanceof Error ? err.message.slice(0, 220) : String(err),
    };
  } finally {
    await session.close();
  }
}

export async function close() {
  if (g.__sfNeo) {
    await g.__sfNeo.close();
    g.__sfNeo = null;
  }
}
