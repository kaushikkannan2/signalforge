"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";

/* ---------------------------------------------------------------------------
   The constellation.

   A 2,100-node force layout is a hairball — pretty for three seconds and
   useless after that. So this never draws the whole graph. It draws the
   NEIGHBOURHOOD of one focused node, two hops out, which is the unit a human
   can actually reason about: this account, its signals, its buyers, the vendor
   it already pays, and the bridge that connects one of its people to someone
   on our side.

   Click any node to re-focus and the view walks the graph with you. That is
   the whole argument for a graph made visible in one gesture.
   --------------------------------------------------------------------------- */

interface GNodeLite {
  id: string;
  label: string;
  name: string;
  props: Record<string, unknown>;
}
interface GEdgeLite {
  id: string;
  type: string;
  from: string;
  to: string;
  props: Record<string, unknown>;
}

const LABEL_STYLE: Record<string, { fill: string; r: number; ring?: string }> = {
  Company: { fill: "#2dd4bf", r: 11 },
  Person: { fill: "#5eb3f6", r: 8 },
  Signal: { fill: "#ffc53d", r: 6 },
  Competitor: { fill: "#f2437e", r: 9 },
  Product: { fill: "#b98bff", r: 7 },
  Lead: { fill: "#7c8ea4", r: 5 },
};

const EDGE_LABEL: Record<string, string> = {
  works_at: "works at",
  previously_employed_at: "previously at",
  studied_at: "studied at",
  competes_with: "competes with",
  matched_to: "matched to",
  emits_signal: "signal",
  uses_vendor: "pays vendor",
  contacted_via: "contacted",
  replied_to: "replied",
};

interface SimNode extends GNodeLite {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  depth: number;
}

export function Constellation({
  nodes,
  edges,
  focusId,
  onFocus,
  height = 460,
}: {
  nodes: GNodeLite[];
  edges: GEdgeLite[];
  focusId?: string;
  onFocus?: (id: string) => void;
  height?: number;
}) {
  const [hover, setHover] = useState<SimNode | null>(null);
  const [tick, setTick] = useState(0);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const width = 760;

  // Two-hop neighbourhood of the focus node. Without a focus, the densest
  // account is chosen so the view is never empty on first paint.
  const { subNodes, subEdges } = useMemo((): { subNodes: SimNode[]; subEdges: GEdgeLite[] } => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const adjacency = new Map<string, GEdgeLite[]>();
    for (const e of edges) {
      if (!adjacency.has(e.from)) adjacency.set(e.from, []);
      if (!adjacency.has(e.to)) adjacency.set(e.to, []);
      adjacency.get(e.from)!.push(e);
      adjacency.get(e.to)!.push(e);
    }

    let root = focusId && byId.has(focusId) ? focusId : undefined;
    if (!root) {
      const companies = nodes.filter((n) => n.label === "Company" && !n.props.external);
      root = companies.sort(
        (a, b) => (adjacency.get(b.id)?.length ?? 0) - (adjacency.get(a.id)?.length ?? 0),
      )[0]?.id;
    }
    if (!root) return { subNodes: [] as SimNode[], subEdges: [] as GEdgeLite[] };

    const depth = new Map<string, number>([[root, 0]]);
    const frontier = [root];
    const MAX_NODES = 60;
    while (frontier.length && depth.size < MAX_NODES) {
      const current = frontier.shift()!;
      const d = depth.get(current)!;
      if (d >= 2) continue;
      for (const e of adjacency.get(current) ?? []) {
        const other = e.from === current ? e.to : e.from;
        if (depth.has(other) || depth.size >= MAX_NODES) continue;
        depth.set(other, d + 1);
        frontier.push(other);
      }
    }

    const keep = new Set(depth.keys());
    const built: SimNode[] = [...keep]
      .filter((id) => byId.has(id))
      .map((id) => ({ ...byId.get(id)!, depth: depth.get(id)! }));
    return {
      subNodes: built,
      subEdges: edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
    };
  }, [nodes, edges, focusId]);

  useEffect(() => {
    if (!subNodes.length) return;
    const linkObjects = subEdges.map((e) => ({ ...e, source: e.from, target: e.to }));
    // Pin the focus node at the centre so the layout reads as "this, and what
    // surrounds it" rather than an arbitrary cloud.
    for (const n of subNodes) {
      if (n.depth === 0) {
        n.fx = width / 2;
        n.fy = height / 2;
      } else {
        n.x = width / 2 + (Math.cos(subNodes.indexOf(n)) * 120 * n.depth);
        n.y = height / 2 + (Math.sin(subNodes.indexOf(n)) * 110 * n.depth);
      }
    }

    const sim = forceSimulation<SimNode>(subNodes)
      .force("charge", forceManyBody<SimNode>().strength(-260))
      .force(
        "link",
        forceLink<SimNode, (typeof linkObjects)[number]>(linkObjects)
          .id((d) => d.id)
          .distance((l) => ((l as unknown as GEdgeLite).type === "emits_signal" ? 58 : 92))
          .strength(0.7),
      )
      .force("center", forceCenter(width / 2, height / 2).strength(0.06))
      .force("collide", forceCollide<SimNode>().radius((d) => (LABEL_STYLE[d.label]?.r ?? 7) + 9))
      .alphaDecay(0.045)
      .on("tick", () => setTick((t) => t + 1));

    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [subNodes, subEdges, height]);

  if (!subNodes.length) {
    return (
      <div
        className="surface flex items-center justify-center"
        style={{ borderColor: "var(--color-rule)", height }}
      >
        <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)" }}>
          Nothing in the graph yet.
        </p>
      </div>
    );
  }

  const nodeById = new Map(subNodes.map((n) => [n.id, n]));
  const focus = subNodes.find((n) => n.depth === 0);

  return (
    <div className="surface overflow-hidden" style={{ borderColor: "var(--color-rule)" }}>
      <div
        className="px-3 py-2 border-b flex items-center gap-3 flex-wrap"
        style={{ borderColor: "var(--color-rule)" }}
      >
        <span className="rule-label">Neighbourhood of</span>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{focus?.name}</span>
        <span className="mono" style={{ fontSize: "0.625rem", color: "var(--color-ink-faint)" }}>
          {subNodes.length} nodes · {subEdges.length} edges · 2 hops
        </span>
        <span className="flex items-center gap-2 ml-auto flex-wrap">
          {Object.entries(LABEL_STYLE).map(([label, s]) => (
            <span key={label} className="flex items-center gap-1" style={{ fontSize: "0.625rem" }}>
              <span
                className="inline-block rounded-full"
                style={{ width: 7, height: 7, background: s.fill }}
              />
              {label}
            </span>
          ))}
        </span>
      </div>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block", background: "var(--color-surface-2)" }}>
        <defs>
          <radialGradient id="glow">
            <stop offset="0%" stopColor="#ff7a45" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ff7a45" stopOpacity="0" />
          </radialGradient>
        </defs>

        {focus?.x !== undefined && <circle cx={focus.x} cy={focus.y} r={150} fill="url(#glow)" />}

        {subEdges.map((e) => {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!a?.x || !b?.x) return null;
          const isBridge = e.type === "previously_employed_at" || e.type === "studied_at";
          const highlighted = hover && (hover.id === e.from || hover.id === e.to);
          return (
            <g key={e.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={highlighted ? "var(--color-ember)" : isBridge ? "var(--color-bridge)" : "var(--color-rule-strong)"}
                strokeWidth={highlighted ? 1.8 : isBridge ? 1.4 : 1}
                strokeDasharray={isBridge ? "4 3" : undefined}
                opacity={hover && !highlighted ? 0.25 : 0.85}
              />
              {highlighted && (
                <text
                  x={((a.x ?? 0) + (b.x ?? 0)) / 2}
                  y={((a.y ?? 0) + (b.y ?? 0)) / 2 - 3}
                  textAnchor="middle"
                  style={{ fontSize: 8.5, fill: "var(--color-ink-soft)", fontFamily: "ui-monospace, monospace" }}
                >
                  {EDGE_LABEL[e.type] ?? e.type}
                </text>
              )}
            </g>
          );
        })}

        {subNodes.map((n) => {
          const style = LABEL_STYLE[n.label] ?? { fill: "#78716c", r: 6 };
          const dim = hover && hover.id !== n.id && !subEdges.some(
            (e) =>
              (e.from === hover.id && e.to === n.id) || (e.to === hover.id && e.from === n.id),
          );
          return (
            <g
              key={n.id}
              transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onFocus?.(n.id)}
              style={{ cursor: "pointer", opacity: dim ? 0.3 : 1, transition: "opacity 140ms" }}
            >
              {n.depth === 0 && (
                <circle r={style.r + 6} fill="none" stroke={style.fill} strokeWidth={1} opacity={0.4} />
              )}
              {n.props.isInternal === true && (
                <circle r={style.r + 4} fill="none" stroke="var(--color-vine)" strokeWidth={1.5} />
              )}
              <circle
                r={style.r}
                fill={style.fill}
                stroke="#0d1117"
                strokeWidth={1.5}
                opacity={n.props.disqualified ? 0.4 : 1}
              />
              {(n.depth <= 1 || hover?.id === n.id) && (
                <text
                  y={style.r + 11}
                  textAnchor="middle"
                  style={{
                    fontSize: n.depth === 0 ? 11 : 9.5,
                    fontWeight: n.depth === 0 ? 600 : 400,
                    fill: "var(--color-ink)",
                    pointerEvents: "none",
                  }}
                >
                  {n.name.length > 26 ? `${n.name.slice(0, 25)}…` : n.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div
        className="px-3 py-2 border-t"
        style={{ borderColor: "var(--color-rule)", minHeight: "3.25rem" }}
      >
        {hover ? (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="rule-label">{hover.label}</span>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{hover.name}</span>
              {hover.props.isInternal === true && (
                <span
                  className="rule-label px-1.5 rounded"
                  style={{ background: "var(--color-vine-soft)", color: "var(--color-vine)" }}
                >
                  our side
                </span>
              )}
            </div>
            <p className="mono" style={{ fontSize: "0.6875rem", color: "var(--color-ink-soft)" }}>
              {Object.entries(hover.props)
                .filter(([, v]) => v !== undefined && v !== null && v !== "")
                .slice(0, 5)
                .map(([k, v]) => `${k}=${String(v).slice(0, 28)}`)
                .join("  ·  ") || "no properties"}
            </p>
          </div>
        ) : (
          <p style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)" }}>
            Hover a node to inspect it and label its edges. Click any node to walk the graph
            from there. Dashed violet edges are the shared-history bridges that make a warm
            introduction possible; the ringed node is on our side of the graph.
          </p>
        )}
      </div>
    </div>
  );
}
