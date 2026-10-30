// ============================================================================
// Disk persistence for the demo dataset.
//
// In-memory state is fine while iterating but useless for a recorded demo: a
// server restart wipes the run, and the four Band agents then truthfully
// report zeros. This snapshots the whole store — entities, graph, ledger,
// transcript — to a single JSON file so a prepared run survives restarts and
// the video can be shot against a dataset that already exists.
// ============================================================================

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { db, type Database } from "./db";
import { graph, type GEdge, type GNode } from "./graph";

const SNAPSHOT = join(process.cwd(), "data", "demo-snapshot.json");

interface Snapshot {
  version: 1;
  capturedAt: string;
  db: Database;
  graph: { nodes: GNode[]; edges: GEdge[] };
}

export async function saveSnapshot(path = SNAPSHOT): Promise<string> {
  const snapshot: Snapshot = {
    version: 1,
    capturedAt: new Date().toISOString(),
    db,
    graph: { nodes: [...graph.nodes.values()], edges: graph.edges },
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(snapshot, null, 2), "utf8");
  return path;
}

export async function loadSnapshot(path = SNAPSHOT): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return false;
  }
  const snapshot = JSON.parse(raw) as Snapshot;
  if (snapshot.version !== 1) return false;

  // Replace array contents in place — other modules hold references to `db`.
  for (const key of Object.keys(snapshot.db) as (keyof Database)[]) {
    const incoming = snapshot.db[key];
    const current = db[key];
    if (Array.isArray(incoming) && Array.isArray(current)) {
      current.length = 0;
      (current as unknown[]).push(...(incoming as unknown[]));
    } else if (key === "ledger") {
      Object.assign(db.ledger, snapshot.db.ledger);
    }
  }
  db.seeded = true;

  graph.nodes.clear();
  graph.edges.length = 0;
  for (const node of snapshot.graph.nodes) graph.upsertNode(node);
  for (const edge of snapshot.graph.edges) {
    graph.addEdge(edge.type, edge.from, edge.to, edge.props);
  }
  return true;
}

/**
 * Loads once per process. Called by the state route, which every page hits on
 * mount, so a restart mid-demo silently rehydrates rather than showing zeros.
 */
const flags = globalThis as unknown as { __vouchHydrated?: boolean; __vouchNoHydrate?: boolean };

/**
 * Called by anything that deliberately establishes state (the scenario
 * loader). Without this, an explicit reset was silently undone by the next
 * page poll rehydrating a stale snapshot on top of it — which made the demo
 * non-reproducible AND resurrected records the reset was meant to clear.
 */
export function suppressHydration() {
  flags.__vouchNoHydrate = true;
  flags.__vouchHydrated = true;
}

export function allowHydration() {
  flags.__vouchNoHydrate = false;
}

export async function autoHydrate(): Promise<boolean> {
  if (flags.__vouchNoHydrate || flags.__vouchHydrated || db.companies.length > 0) {
    flags.__vouchHydrated = true;
    return false;
  }
  flags.__vouchHydrated = true;
  return loadSnapshot().catch(() => false);
}
