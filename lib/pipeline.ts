// ============================================================================
// Module 5 — Lead pipeline, attribution and analytics.
//
// Every stage change records WHO moved it: an AI agent, a sales rep, or the
// system. The brief asks for autonomous progression to be distinguishable from
// rep action, so actor is a required field on the transition rather than
// something inferred later from timestamps.
// ============================================================================

import { addLead, db, findCompany, findPerson } from "./db";
import { graph } from "./graph";
import { emit } from "./thinking";
import { id as mkId, now } from "./ids";
import { LEAD_STAGES, type Actor, type Lead, type LeadStage, type StageTransition } from "./types";

export function ensureLead(personId: string, icpId: string): Lead {
  const existing = db.leads.find((l) => l.personId === personId);
  if (existing) return existing;

  const person = findPerson(personId);
  const company = person ? findCompany(person.companyId) : undefined;
  const lead: Lead = {
    id: mkId("lead"),
    personId,
    companyId: person?.companyId ?? "",
    icpId,
    stage: "matched",
    owner: { actor: "ai_agent", name: "Discovery agent" },
    history: [
      {
        id: mkId("trans"),
        leadId: "",
        from: null,
        to: "matched",
        actor: "ai_agent",
        actorName: "Discovery agent",
        reason: `Matched to ICP at fit ${company?.fit.total ?? 0} (Tier ${company?.fit.tier ?? "C"})`,
        at: now(),
      },
    ],
    fitScore: company?.fit.total ?? 0,
    tier: company?.fit.tier ?? "C",
    createdAt: now(),
    updatedAt: now(),
  };
  lead.history[0].leadId = lead.id;
  db.transitions.push(lead.history[0]);
  addLead(lead);
  return lead;
}

const RANK = new Map(LEAD_STAGES.map((s, i) => [s, i]));

export function advanceLead(
  personId: string,
  to: LeadStage,
  actor: Actor,
  actorName: string,
  opts: { reason: string; runId?: string; icpId?: string } = { reason: "" },
): Lead | undefined {
  const lead =
    db.leads.find((l) => l.personId === personId) ??
    (opts.icpId ? ensureLead(personId, opts.icpId) : undefined);
  if (!lead) return undefined;

  const from = lead.stage;
  if (from === to) return lead;
  // Closed stages are terminal unless a human explicitly reopens; an agent
  // must not quietly resurrect a lost deal.
  if ((from === "closed_won" || from === "closed_lost") && actor === "ai_agent") return lead;

  const transition: StageTransition = {
    id: mkId("trans"),
    leadId: lead.id,
    from,
    to,
    actor,
    actorName,
    reason: opts.reason,
    at: now(),
  };

  lead.stage = to;
  lead.updatedAt = transition.at;
  lead.owner = { actor, name: actorName };
  lead.history.push(transition);
  db.transitions.push(transition);

  const node = graph.nodes.get(lead.id);
  if (node) node.props.stage = to;

  if (to === "replied") graph.addEdge("replied_to", lead.personId, lead.companyId, { at: transition.at });

  if (opts.runId) {
    emit(
      opts.runId,
      "Pipeline",
      "validation",
      `${findPerson(personId)?.fullName ?? personId}: ${from} → ${to}`,
      { detail: `${actor === "ai_agent" ? "AI" : actor === "sales_rep" ? "Rep" : "System"} (${actorName}) — ${opts.reason}` },
    );
  }

  return lead;
}

// --- analytics -------------------------------------------------------------

export interface FunnelStage {
  stage: LeadStage;
  count: number;
  /** Conversion from the previous stage, not from the top. */
  stepConversion: number | null;
}

export function funnel(filter?: { industry?: string; tier?: string }): FunnelStage[] {
  const leads = db.leads.filter((l) => {
    if (!filter) return true;
    const company = findCompany(l.companyId);
    if (filter.industry && company?.industry !== filter.industry) return false;
    if (filter.tier && l.tier !== filter.tier) return false;
    return true;
  });

  // A lead that reached a later stage counts as having passed through earlier
  // ones — otherwise the funnel reads as if leads vanished.
  const reached = (stage: LeadStage) =>
    leads.filter((l) => {
      if (stage === "closed_lost") return l.stage === "closed_lost";
      return (
        l.history.some((h) => h.to === stage) ||
        (RANK.get(l.stage) ?? 0) >= (RANK.get(stage) ?? 0)
      );
    }).length;

  const ordered: LeadStage[] = ["matched", "contacted", "replied", "meeting_booked", "closed_won"];
  return ordered.map((stage, i) => {
    const count = reached(stage);
    const prev = i === 0 ? null : reached(ordered[i - 1]);
    return {
      stage,
      count,
      stepConversion: prev && prev > 0 ? Number(((count / prev) * 100).toFixed(1)) : null,
    };
  });
}

export function attributionSplit() {
  const counts: Record<Actor, number> = { ai_agent: 0, sales_rep: 0, system: 0 };
  for (const t of db.transitions) counts[t.actor]++;
  const total = db.transitions.length || 1;
  return {
    counts,
    sharePct: {
      ai_agent: Number(((counts.ai_agent / total) * 100).toFixed(1)),
      sales_rep: Number(((counts.sales_rep / total) * 100).toFixed(1)),
      system: Number(((counts.system / total) * 100).toFixed(1)),
    },
    total: db.transitions.length,
  };
}

export interface VariantStat {
  variant: string;
  channel: string;
  drafted: number;
  approved: number;
  rejected: number;
  sent: number;
  replied: number;
  approvalRatePct: number | null;
  replyRatePct: number | null;
}

/** A/B analytics across message templates, channels and value props. */
export function variantStats(): VariantStat[] {
  const keys = new Map<string, VariantStat>();
  for (const m of db.messages) {
    const key = `${m.variant}|${m.channel}`;
    if (!keys.has(key)) {
      keys.set(key, {
        variant: m.variant,
        channel: m.channel,
        drafted: 0,
        approved: 0,
        rejected: 0,
        sent: 0,
        replied: 0,
        approvalRatePct: null,
        replyRatePct: null,
      });
    }
    const stat = keys.get(key)!;
    stat.drafted++;
    if (m.status === "rejected") stat.rejected++;
    if (m.status === "approved" || m.status === "sent") stat.approved++;
    if (m.status === "sent") {
      stat.sent++;
      const lead = db.leads.find((l) => l.personId === m.personId);
      if (lead && lead.history.some((h) => h.to === "replied")) stat.replied++;
    }
  }
  return [...keys.values()].map((s) => ({
    ...s,
    approvalRatePct: s.drafted ? Number(((s.approved / s.drafted) * 100).toFixed(1)) : null,
    replyRatePct: s.sent ? Number(((s.replied / s.sent) * 100).toFixed(1)) : null,
  }));
}

export function byIndustry() {
  const map = new Map<string, { industry: string; leads: number; contacted: number; replied: number }>();
  for (const lead of db.leads) {
    const industry = findCompany(lead.companyId)?.industry ?? "Unknown";
    if (!map.has(industry)) map.set(industry, { industry, leads: 0, contacted: 0, replied: 0 });
    const row = map.get(industry)!;
    row.leads++;
    if (lead.history.some((h) => h.to === "contacted")) row.contacted++;
    if (lead.history.some((h) => h.to === "replied")) row.replied++;
  }
  return [...map.values()].sort((a, b) => b.leads - a.leads);
}

export function byTier() {
  return (["A", "B", "C"] as const).map((tier) => {
    const leads = db.leads.filter((l) => l.tier === tier);
    return {
      tier,
      leads: leads.length,
      contacted: leads.filter((l) => l.history.some((h) => h.to === "contacted")).length,
      replied: leads.filter((l) => l.history.some((h) => h.to === "replied")).length,
      meetings: leads.filter((l) => l.history.some((h) => h.to === "meeting_booked")).length,
    };
  });
}
