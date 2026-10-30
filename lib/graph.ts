// ============================================================================
// The knowledge graph.
//
// Design note (documented in the system-design doc too): the in-process graph
// is the system of record, and Neo4j is a write-through mirror that also serves
// the showcase Cypher. Two reasons: the demo stays deterministic even if Aura is
// cold or absent, and the multi-hop queries below are expressed twice — once as
// real Cypher, once as a traversal — so the Cypher shown in the UI is the
// genuine query, not a decorative string.
// ============================================================================

import { id as mkId, now } from "./ids";

export type NodeLabel =
  | "Company"
  | "Person"
  | "Product"
  | "Competitor"
  | "Signal"
  | "Lead"
  | "Message";

export type EdgeType =
  | "works_at"
  | "previously_employed_at"
  | "studied_at"
  | "competes_with"
  | "matched_to"
  | "contacted_via"
  | "replied_to"
  | "emits_signal"
  | "evaluates"
  | "uses_vendor";

export interface GNode {
  id: string;
  label: NodeLabel;
  /** Human-readable name used in path rendering. */
  name: string;
  props: Record<string, unknown>;
}

export interface GEdge {
  id: string;
  type: EdgeType;
  from: string;
  to: string;
  props: Record<string, unknown>;
}

export interface GPath {
  nodes: GNode[];
  edges: GEdge[];
  /** Why this path matters, in plain language, for the UI. */
  explanation: string;
  strength: number;
}

class Graph {
  nodes = new Map<string, GNode>();
  edges: GEdge[] = [];
  /** adjacency: nodeId -> edge indices, both directions */
  private adj = new Map<string, number[]>();

  upsertNode(node: GNode): GNode {
    const existing = this.nodes.get(node.id);
    if (existing) {
      existing.props = { ...existing.props, ...node.props };
      existing.name = node.name || existing.name;
      return existing;
    }
    this.nodes.set(node.id, node);
    return node;
  }

  addEdge(type: EdgeType, from: string, to: string, props: Record<string, unknown> = {}): GEdge {
    const dupe = this.edges.find((e) => e.type === type && e.from === from && e.to === to);
    if (dupe) {
      dupe.props = { ...dupe.props, ...props };
      return dupe;
    }
    const edge: GEdge = { id: mkId("e"), type, from, to, props };
    this.edges.push(edge);
    const i = this.edges.length - 1;
    for (const n of [from, to]) {
      if (!this.adj.has(n)) this.adj.set(n, []);
      this.adj.get(n)!.push(i);
    }
    return edge;
  }

  neighbours(nodeId: string, types?: EdgeType[]): { edge: GEdge; node: GNode }[] {
    const out: { edge: GEdge; node: GNode }[] = [];
    for (const i of this.adj.get(nodeId) ?? []) {
      const e = this.edges[i];
      if (types && !types.includes(e.type)) continue;
      const otherId = e.from === nodeId ? e.to : e.from;
      const other = this.nodes.get(otherId);
      if (other) out.push({ edge: e, node: other });
    }
    return out;
  }

  byLabel(label: NodeLabel): GNode[] {
    return [...this.nodes.values()].filter((n) => n.label === label);
  }

  /**
   * Bounded breadth-first path search. This is the primitive the three
   * multi-hop queries are built on — the thing a relational schema makes
   * painful and a graph makes trivial.
   */
  paths(fromId: string, toId: string, maxHops = 4, allowed?: EdgeType[]): GPath[] {
    const results: GPath[] = [];
    const queue: { nodes: GNode[]; edges: GEdge[] }[] = [];
    const start = this.nodes.get(fromId);
    if (!start) return results;
    queue.push({ nodes: [start], edges: [] });

    while (queue.length) {
      const cur = queue.shift()!;
      const tail = cur.nodes[cur.nodes.length - 1];
      if (tail.id === toId && cur.edges.length) {
        results.push({ ...cur, explanation: "", strength: 1 / cur.edges.length });
        continue;
      }
      if (cur.edges.length >= maxHops) continue;
      for (const { edge, node } of this.neighbours(tail.id, allowed)) {
        if (cur.nodes.some((n) => n.id === node.id)) continue; // no cycles
        queue.push({ nodes: [...cur.nodes, node], edges: [...cur.edges, edge] });
      }
    }
    return results.sort((a, b) => a.edges.length - b.edges.length).slice(0, 8);
  }

  stats() {
    const nodesByLabel: Record<string, number> = {};
    for (const n of this.nodes.values()) nodesByLabel[n.label] = (nodesByLabel[n.label] ?? 0) + 1;
    const edgesByType: Record<string, number> = {};
    for (const e of this.edges) edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;
    return { nodeCount: this.nodes.size, edgeCount: this.edges.length, nodesByLabel, edgesByType };
  }

  /** Serialisable snapshot for the force-directed visualisation. */
  snapshot() {
    return {
      nodes: [...this.nodes.values()].map((n) => ({
        id: n.id,
        label: n.label,
        name: n.name,
        props: n.props,
      })),
      edges: this.edges.map((e) => ({ id: e.id, type: e.type, from: e.from, to: e.to, props: e.props })),
      stats: this.stats(),
      capturedAt: now(),
    };
  }
}

// Module-global singleton. Next.js hot-reloads modules in dev, so we stash it
// on globalThis to survive recompiles and keep demo state alive.
const g = globalThis as unknown as { __gvGraph?: Graph };
export const graph: Graph = g.__gvGraph ?? (g.__gvGraph = new Graph());
