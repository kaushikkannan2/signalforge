// ============================================================================
// Multi-hop graph reasoning.
//
// Each query is stated twice on purpose:
//   `cypher`  — the real Cypher, run against Neo4j when it is configured and
//               displayed verbatim in the Agent Thinking panel either way.
//   resolver  — the in-process traversal that is always available.
// These are kept adjacent so they cannot drift into telling different stories.
// ============================================================================

import { graph, type GNode, type GPath } from "./graph";
import { db, signalsFor } from "./db";

export interface ReasoningResult {
  queryName: string;
  question: string;
  cypher: string;
  findings: {
    headline: string;
    explanation: string;
    strength: number;
    path: { nodes: { id: string; label: string; name: string }[]; edgeTypes: string[] };
    actionable: string;
  }[];
  nodeIdsTouched: string[];
  tookMs: number;
}

// ---------------------------------------------------------------------------
// 1. Warm introduction paths.
//    "Who on our side already knows someone who can walk us in?"
//    Two hops through a shared former employer or a shared institution.
// ---------------------------------------------------------------------------

export const WARM_INTRO_CYPHER = `
MATCH (us:Person {isInternal: true})
      -[:previously_employed_at|studied_at]->(bridge)
      <-[:previously_employed_at|studied_at]-(target:Person)
      -[:works_at]->(acct:Company)
WHERE acct.disqualified = false
RETURN us.fullName AS introducer,
       labels(bridge)[0] AS bridgeKind,
       bridge.name AS sharedContext,
       target.fullName AS buyer,
       target.title AS buyerTitle,
       acct.name AS account,
       acct.fit AS fitScore
ORDER BY acct.fit DESC
LIMIT 10`.trim();

export function warmIntroPaths(): ReasoningResult {
  const t0 = Date.now();
  const internal = graph
    .byLabel("Person")
    .filter((n) => n.props.isInternal === true);
  const findings: ReasoningResult["findings"] = [];
  const touched = new Set<string>();

  for (const us of internal) {
    for (const { node: bridge } of graph.neighbours(us.id, [
      "previously_employed_at",
      "studied_at",
    ])) {
      for (const { node: target, edge } of graph.neighbours(bridge.id, [
        "previously_employed_at",
        "studied_at",
      ])) {
        if (target.id === us.id || target.label !== "Person") continue;
        const employer = graph
          .neighbours(target.id, ["works_at"])
          .find((n) => n.node.label === "Company");
        if (!employer || employer.node.props.disqualified) continue;

        const kind = edge.type === "studied_at" ? "studied at" : "both worked at";
        findings.push({
          headline: `${us.name} → ${bridge.name} → ${target.name} at ${employer.node.name}`,
          explanation: `${us.name} and ${target.name} ${kind} ${bridge.name}. That shared history is a referable introduction rather than a cold approach.`,
          strength: Number(employer.node.props.fit ?? 50) / 100,
          path: {
            nodes: [us, bridge, target, employer.node].map(short),
            edgeTypes: [edge.type, edge.type, "works_at"],
          },
          actionable: `Ask ${us.name} to forward the ${employer.node.name} sequence to ${target.name} (${target.props.title}) instead of sending touch 1 cold.`,
        });
        [us, bridge, target, employer.node].forEach((n) => touched.add(n.id));
      }
    }
  }

  return {
    queryName: "warm_intro_paths",
    question: "Which target buyers can we reach through a shared employer or school?",
    cypher: WARM_INTRO_CYPHER,
    findings: dedupe(findings).sort((a, b) => b.strength - a.strength).slice(0, 6),
    nodeIdsTouched: [...touched],
    tookMs: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// 2. Job requisitions as live buying cycles.
//    A company hiring for a role our product serves is staffing a problem
//    they have already decided to spend money on.
// ---------------------------------------------------------------------------

export const BUYING_CYCLE_CYPHER = `
MATCH (acct:Company)-[:emits_signal]->(sig:Signal)
WHERE sig.category IN ['headcount_growth','tech_stack_change','exec_hire']
MATCH (buyer:Person)-[:works_at]->(acct)
WHERE buyer.seniority IN ['VP','C-Suite','Director','Founder']
WITH acct, buyer, collect(sig) AS signals,
     reduce(w = 0, s IN collect(sig) | w + s.intentWeight) AS intent
WHERE intent >= 15
RETURN acct.name AS account, acct.fit AS fit, buyer.fullName AS economicBuyer,
       buyer.title AS title, intent AS intentScore,
       [s IN signals | s.name] AS evidenceChain
ORDER BY intent DESC`.trim();

export function activeBuyingCycles(): ReasoningResult {
  const t0 = Date.now();
  const findings: ReasoningResult["findings"] = [];
  const touched = new Set<string>();

  for (const acct of graph.byLabel("Company")) {
    if (acct.props.external || acct.props.disqualified) continue;
    const sigs = signalsFor(acct.id).filter((s) =>
      ["headcount_growth", "tech_stack_change", "exec_hire"].includes(s.category),
    );
    const intent = sigs.reduce((w, s) => w + s.intentWeight, 0);
    if (intent < 15) continue;

    const buyers = graph
      .neighbours(acct.id, ["works_at"])
      .filter((n) => n.node.label === "Person")
      .filter((n) => ["VP", "C-Suite", "Director", "Founder"].includes(String(n.node.props.seniority)));
    if (!buyers.length) continue;
    const buyer = buyers[0].node;

    findings.push({
      headline: `${acct.name} is mid-cycle — intent ${intent}/30`,
      explanation: `${sigs.length} reinforcing signal(s): ${sigs
        .map((s) => s.headline)
        .join("; ")}. Hiring and tooling changes mean budget is already allocated, so this is a timing play rather than a persuasion play.`,
      strength: Math.min(intent / 30, 1),
      path: {
        nodes: [acct, ...sigs.slice(0, 2).map((s) => graph.nodes.get(s.id)!).filter(Boolean), buyer].map(short),
        edgeTypes: ["emits_signal", "emits_signal", "works_at"],
      },
      actionable: `Lead with "${sigs[0].headline}" in touch 1 to ${buyer.name} (${buyer.props.title}).`,
    });
    [acct, buyer].forEach((n) => touched.add(n.id));
    sigs.forEach((s) => touched.add(s.id));
  }

  return {
    queryName: "active_buying_cycles",
    question: "Which accounts show hiring or tooling signals that imply an open budget?",
    cypher: BUYING_CYCLE_CYPHER,
    findings: findings.sort((a, b) => b.strength - a.strength),
    nodeIdsTouched: [...touched],
    tookMs: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// 3. Competitor displacement.
//    Accounts already paying a competitor, where a churn or renewal signal
//    means the switching cost is temporarily near zero.
// ---------------------------------------------------------------------------

export const DISPLACEMENT_CYPHER = `
MATCH (acct:Company)-[u:uses_vendor]->(comp:Competitor)<-[:competes_with]-(us:Product)
OPTIONAL MATCH (acct)-[:emits_signal]->(sig:Signal {category: 'competitor_churn'})
WITH acct, comp, u, sig
WHERE sig IS NOT NULL OR u.renewalWindow = true
RETURN acct.name AS account, comp.name AS incumbent,
       comp.category AS competitorType,
       u.renewalWindow AS inRenewalWindow,
       sig.name AS churnSignal, acct.fit AS fit
ORDER BY acct.fit DESC`.trim();

export function displacementOpportunities(): ReasoningResult {
  const t0 = Date.now();
  const findings: ReasoningResult["findings"] = [];
  const touched = new Set<string>();

  for (const acct of graph.byLabel("Company")) {
    if (acct.props.external || acct.props.disqualified) continue;
    for (const { node: comp, edge } of graph.neighbours(acct.id, ["uses_vendor"])) {
      if (comp.label !== "Competitor") continue;
      const churn = signalsFor(acct.id).find((s) => s.category === "competitor_churn");
      const inWindow = edge.props.renewalWindow === true;
      if (!churn && !inWindow) continue;

      const competitor = db.competitors.find((c) => c.id === comp.id);
      findings.push({
        headline: `${acct.name} is displaceable from ${comp.name}`,
        explanation: churn
          ? `Churn signal: ${churn.headline}. ${comp.name} is a ${comp.props.category} competitor, so the evaluation is already open.`
          : `Contract is inside its renewal window, which is the one moment switching cost is near zero.`,
        strength: churn ? 0.9 : 0.65,
        path: { nodes: [acct, comp].map(short), edgeTypes: ["uses_vendor"] },
        actionable: `Open with the ${competitor?.ourDifferentiators[0] ?? "differentiation"} angle against ${comp.name}.`,
      });
      [acct, comp].forEach((n) => touched.add(n.id));
    }
  }

  return {
    queryName: "competitor_displacement",
    question: "Which accounts are paying a competitor and currently able to switch?",
    cypher: DISPLACEMENT_CYPHER,
    findings: findings.sort((a, b) => b.strength - a.strength),
    nodeIdsTouched: [...touched],
    tookMs: Date.now() - t0,
  };
}

export const REASONING_QUERIES = {
  warm_intro_paths: warmIntroPaths,
  active_buying_cycles: activeBuyingCycles,
  competitor_displacement: displacementOpportunities,
} as const;

export type ReasoningQueryName = keyof typeof REASONING_QUERIES;

// --- helpers ---------------------------------------------------------------

const short = (n: GNode) => ({ id: n.id, label: n.label, name: n.name, props: n.props });

function dedupe(items: ReasoningResult["findings"]) {
  const seen = new Set<string>();
  return items.filter((f) => (seen.has(f.headline) ? false : (seen.add(f.headline), true)));
}

export type { GPath };
