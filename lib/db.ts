// ============================================================================
// Operational store for domain entities.
//
// Entities live here; relationships live in the graph (lib/graph.ts). Writes go
// through `link()` helpers that keep both in step, so the graph is never a
// stale side-copy of the truth.
// ============================================================================

import type {
  ApprovalRecord,
  Company,
  Competitor,
  CreditLedger,
  DispatchRecord,
  IcpDefinition,
  IcpExpansion,
  Lead,
  MeterEvent,
  OutreachMessage,
  Person,
  ProductIntake,
  Signal,
  StageTransition,
  ThinkingStep,
  BandMessage,
} from "./types";
import { graph } from "./graph";

export interface Database {
  intakes: ProductIntake[];
  icps: IcpDefinition[];
  expansions: IcpExpansion[];
  companies: Company[];
  people: Person[];
  signals: Signal[];
  competitors: Competitor[];
  messages: OutreachMessage[];
  approvals: ApprovalRecord[];
  dispatches: DispatchRecord[];
  leads: Lead[];
  transitions: StageTransition[];
  meterEvents: MeterEvent[];
  ledger: CreditLedger;
  thinking: ThinkingStep[];
  band: BandMessage[];
  seeded: boolean;
}

function empty(): Database {
  return {
    intakes: [],
    icps: [],
    expansions: [],
    companies: [],
    people: [],
    signals: [],
    competitors: [],
    messages: [],
    approvals: [],
    dispatches: [],
    leads: [],
    transitions: [],
    meterEvents: [],
    ledger: {
      customerId: process.env.FLEXPRICE_CUSTOMER_ID ?? "grapevine-demo-org",
      granted: 500,
      consumed: 0,
      balance: 500,
      // Deliberately cheap-to-exhaust so the credit gate can be demonstrated
      // on camera inside a 3-minute video.
      unitCosts: { leads_enriched: 10, outreach_sent: 4, graph_queries: 1 },
    },
    thinking: [],
    band: [],
    seeded: false,
  };
}

const store = globalThis as unknown as { __gvDb?: Database };
export const db: Database = store.__gvDb ?? (store.__gvDb = empty());

export function resetDb() {
  store.__gvDb = empty();
  graph.nodes.clear();
  graph.edges.length = 0;
}

// --- graph-syncing writers -------------------------------------------------

export function addCompany(c: Company): Company {
  db.companies.push(c);
  graph.upsertNode({
    id: c.id,
    label: "Company",
    name: c.name,
    props: {
      domain: c.domain,
      industry: c.industry,
      naics: c.naics,
      headcount: c.headcount,
      fit: c.fit.total,
      tier: c.fit.tier,
      disqualified: c.disqualified,
    },
  });
  return c;
}

export function addPerson(p: Person): Person {
  db.people.push(p);
  graph.upsertNode({
    id: p.id,
    label: "Person",
    name: p.fullName,
    props: { title: p.title, seniority: p.seniority, department: p.department },
  });
  graph.addEdge("works_at", p.id, p.companyId, { title: p.title });
  for (const prev of p.previousEmployers) {
    const orgId = `org_${prev.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    graph.upsertNode({ id: orgId, label: "Company", name: prev, props: { external: true } });
    graph.addEdge("previously_employed_at", p.id, orgId, {});
  }
  for (const school of p.education) {
    const sid = `edu_${school.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    graph.upsertNode({ id: sid, label: "Product", name: school, props: { kind: "institution" } });
    graph.addEdge("studied_at", p.id, sid, {});
  }
  return p;
}

export function addSignal(s: Signal): Signal {
  db.signals.push(s);
  graph.upsertNode({
    id: s.id,
    label: "Signal",
    name: s.headline,
    props: { category: s.category, observedAt: s.observedAt, intentWeight: s.intentWeight },
  });
  graph.addEdge("emits_signal", s.companyId, s.id, { category: s.category });
  return s;
}

export function addCompetitor(c: Competitor): Competitor {
  db.competitors.push(c);
  graph.upsertNode({
    id: c.id,
    label: "Competitor",
    name: c.name,
    props: { category: c.category, positioning: c.positioning, domain: c.domain },
  });
  return c;
}

export function addLead(l: Lead): Lead {
  db.leads.push(l);
  graph.upsertNode({
    id: l.id,
    label: "Lead",
    name: `Lead ${l.id}`,
    props: { stage: l.stage, tier: l.tier, fit: l.fitScore },
  });
  graph.addEdge("matched_to", l.personId, l.icpId, { fit: l.fitScore, tier: l.tier });
  return l;
}

// --- lookups ---------------------------------------------------------------

export const findCompany = (id: string) => db.companies.find((c) => c.id === id);
export const findPerson = (id: string) => db.people.find((p) => p.id === id);
export const findLead = (id: string) => db.leads.find((l) => l.id === id);
export const findMessage = (id: string) => db.messages.find((m) => m.id === id);
export const signalsFor = (companyId: string) => db.signals.filter((s) => s.companyId === companyId);
export const activeIcp = () => db.icps.find((i) => i.status === "approved") ?? db.icps[0];
