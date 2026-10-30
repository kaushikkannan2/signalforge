// ============================================================================
// Scenario loader.
//
// This does NOT paste finished records into the store. It feeds the scenario
// through the same code paths a live run uses: the real fit scorer, the real
// DNS MX lookups, the real credit ledger and the real graph writers. So what a
// viewer sees on screen is the system processing data, not a fixture being
// rendered — and if the scoring logic changes, these numbers change with it.
//
// The one thing deliberately pre-set is the credit balance, sized so the gate
// fires partway through enrichment. That is a demo requirement: a safety
// mechanism nobody watches fire is indistinguishable from one that does not work.
// ============================================================================

import { addCompany, addCompetitor, addPerson, addSignal, db } from "../db";
import { graph } from "../graph";
import { scoreFit } from "../discovery";
import { ensureLead } from "../pipeline";
import { emit } from "../thinking";
import { id as mkId, now, slugId } from "../ids";
import type { Company, IcpDefinition, Person, ProductIntake, Scored, Signal } from "../types";
import { describe as describeDataset, generateAccounts } from "./generate";
import {
  SCENARIO_ACCOUNTS,
  SCENARIO_COMPETITORS,
  SCENARIO_NOTE,
  SCENARIO_TEAM,
  scenarioEvidence,
} from "./scenario";

const scored = <T>(value: T, confidence: number, rationale: string): Scored<T> => ({
  value,
  confidence,
  rationale,
  evidence: [],
});

export const SCENARIO_INTAKE: ProductIntake = {
  id: "intake_scenario",
  companyName: "Vouch",
  productName: "Vouch GTM Engine",
  description:
    "Vouch turns a plain-language product description into a working outbound pipeline. It infers your ICP, finds accounts and named buyers with a source link on every claim, connects them in a knowledge graph so you can see warm-intro paths and live buying signals, drafts multi-channel sequences that quote the specific trigger event, and refuses to send anything until a human approves it.",
  features: [
    "Plain-language intake producing a structured ICP with per-field confidence",
    "Evidence-cited account and buyer discovery",
    "Knowledge graph with warm-intro, buying-cycle and displacement queries",
    "Contact enrichment with DNS-level email verification",
    "Signal-personalised email and LinkedIn sequences",
    "Mandatory human approval before dispatch",
    "Kanban pipeline with AI-versus-rep attribution",
    "Usage metering with credit-gated enrichment",
  ],
  referenceCustomers: ["Two design partners in B2B SaaS (under NDA)"],
  pricingModel: "Usage-based credits, metered through Flexprice",
  averageContractValue: "$18,000 ARR",
  technicalConstraints: [
    "No scraping of sources that forbid it",
    "Every externally-sourced claim must carry a citation",
    "No outbound dispatch without a human approval record",
  ],
  createdAt: now(),
};

/** A pre-approved ICP with honest, varied confidences. */
export function scenarioIcp(): IcpDefinition {
  const fields = {
    industries: scored(
      [
        { name: "Vertical B2B SaaS", naics: "513210" },
        { name: "Industrial & logistics software", naics: "513210" },
        { name: "Healthcare software", naics: "513210" },
      ],
      0.78,
      "Two design partners are both vertical B2B SaaS, which anchors this; the adjacent verticals are inferred from the capability list rather than observed.",
    ),
    headcountRange: scored(
      { min: 25, max: 250, tierLabel: "Seed to growth (25–250)" },
      0.71,
      "Below 25 there is no outbound function to augment; above 250 an incumbent contract is usually already in place.",
    ),
    revenueBand: scored(
      { min: 2_000_000, max: 50_000_000, currency: "USD" },
      0.58,
      "Derived from the headcount band rather than observed revenue, so this is the weakest firmographic field.",
    ),
    geographies: scored(
      ["United States", "Canada", "United Kingdom"],
      0.82,
      "Opt-out outbound jurisdictions only. This is a compliance constraint, not a preference.",
    ),
    personas: scored(
      [
        {
          title: "VP Sales / CRO",
          seniority: "VP" as const,
          department: "Sales",
          jobToBeDone: "Hit the quarterly bookings number with a small, expensive rep team",
          painPoints: ["Reps spend more time researching than selling", "No defensible reason behind account selection"],
        },
        {
          title: "Head of Revenue Operations",
          seniority: "Director" as const,
          department: "Revenue Operations",
          jobToBeDone: "Make the GTM stack produce auditable, attributable pipeline",
          painPoints: ["Enrichment data cannot be traced to a source", "Tooling sprawl across four vendors"],
        },
        {
          title: "Head of Demand Generation / Growth",
          seniority: "Director" as const,
          department: "Marketing",
          jobToBeDone: "Produce sourced pipeline per dollar of program spend",
          painPoints: ["Generic sequences burn domain reputation", "No way to prove why a message was sent"],
        },
        {
          title: "Founder / CEO (founder-led sales)",
          seniority: "Founder" as const,
          department: "Executive",
          jobToBeDone: "Create enough qualified pipeline to justify the first sales hire",
          painPoints: ["No time to research accounts", "No ICP written down anywhere"],
        },
      ],
      0.86,
      "These four titles are consistent across both design partners and the capability set maps directly onto what each is measured on.",
    ),
    triggerEvents: scored(
      [
        {
          category: "exec_hire" as const,
          label: "First VP Sales, CRO or Head of Growth hired in the last 90 days",
          buyingImplication: "New revenue leaders rebuild the stack and define an ICP inside their first quarter, which is exactly this product's job.",
          intentWeight: 14,
        },
        {
          category: "funding" as const,
          label: "Raised seed, Series A or Series B in the last six months",
          buyingImplication: "New capital arrives with a board mandate to build repeatable outbound; tooling is bought in the first two quarters.",
          intentWeight: 12,
        },
        {
          category: "headcount_growth" as const,
          label: "Two or more SDR, AE or BDR roles posted simultaneously",
          buyingImplication: "Scaling the prospecting team exposes the manual research bottleneck immediately.",
          intentWeight: 8,
        },
        {
          category: "competitor_churn" as const,
          label: "Public dissatisfaction with an incumbent prospecting vendor",
          buyingImplication: "An evaluation is already open, and the stated objection is usually data trust.",
          intentWeight: 16,
        },
        {
          category: "tech_stack_change" as const,
          label: "CRM migration or a newly detected sequencing tool",
          buyingImplication: "A sequencing layer without a trustworthy targeting layer is a half-finished stack; budget is open.",
          intentWeight: 9,
        },
        {
          category: "regulatory" as const,
          label: "A dated compliance deadline in the buyer's own market",
          buyingImplication: "Non-discretionary spend with a fixed date attached.",
          intentWeight: 10,
        },
      ],
      0.74,
      "Weights are ordered by how strongly each event predicts a near-term purchase rather than by how common the event is.",
    ),
    negativeSignals: scored(
      [
        "Announced a hiring freeze, layoffs or a down round in the last six months",
        "Headquartered in a strict opt-in outbound jurisdiction with no entity in an opt-out market",
        "Pure self-serve motion: no sales roles posted in twelve months and no demo or contact-sales call to action",
        "Sells primarily to consumers rather than businesses",
        "An agency or consultancy that sells the same outcome this product delivers",
      ],
      0.8,
      "Each is observable from public sources. Unobservable states like 'no budget' are deliberately excluded — a filter you cannot check is a filter you cannot trust.",
    ),
    techStackAffinity: scored(
      ["Salesforce", "HubSpot", "Outreach", "Salesloft", "Snowflake", "Marketo"],
      0.65,
      "Presence of a CRM and a sequencer indicates an outbound motion worth augmenting; absence of both usually indicates there is nothing to augment.",
    ),
  };

  const confidences = Object.values(fields).map((f) => f.confidence);
  return {
    id: "icp_scenario",
    intakeId: SCENARIO_INTAKE.id,
    ...fields,
    overallConfidence: Number(
      (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(2),
    ),
    status: "approved",
    createdAt: now(),
  };
}

export interface LoadOptions {
  /**
   * Credits to grant. The default is sized so enrichment runs out partway
   * through the buyer list, which is the only way to show the gate firing.
   */
  credits?: number;
  /**
   * Generated accounts appended after the hand-authored ones. 0 keeps the
   * narration-sized set; a few hundred is production scale.
   */
  scale?: number;
  seed?: number;
}

export async function loadScenario(runId: string, opts: LoadOptions = {}) {
  const icp = scenarioIcp();
  db.intakes.push(SCENARIO_INTAKE);
  db.icps.push(icp);

  emit(runId, "Scenario", "reasoning", "Ingesting scenario dataset", {
    detail: `${SCENARIO_NOTE} Records are scored by the live fit model, not pre-computed.`,
  });

  // Our own side of the graph first, so warm-intro paths have an origin.
  for (const member of SCENARIO_TEAM) {
    graph.upsertNode({
      id: member.id,
      label: "Person",
      name: member.fullName,
      props: { isInternal: true, title: member.title },
    });
    for (const employer of member.previousEmployers) {
      const orgId = slugId("org", employer);
      graph.upsertNode({ id: orgId, label: "Company", name: employer, props: { external: true } });
      graph.addEdge("previously_employed_at", member.id, orgId, {});
    }
    for (const school of member.education) {
      const eduId = slugId("edu", school);
      graph.upsertNode({ id: eduId, label: "Product", name: school, props: { kind: "institution" } });
      graph.addEdge("studied_at", member.id, eduId, {});
    }
  }

  for (const competitor of SCENARIO_COMPETITORS) {
    addCompetitor({ ...competitor, evidence: [scenarioEvidence(competitor.positioning)] });
  }
  const productNode = slugId("product", SCENARIO_INTAKE.productName);
  graph.upsertNode({
    id: productNode,
    label: "Product",
    name: SCENARIO_INTAKE.productName,
    props: { ours: true },
  });
  for (const c of SCENARIO_COMPETITORS) {
    graph.addEdge("competes_with", productNode, c.id, { category: c.category });
  }

  const people: Person[] = [];

  // The hand-authored records come FIRST so they sort to the top of the grid
  // and stay the narration path, then generated volume is appended behind
  // them. Known answers and realistic scale are not in tension.
  const generated = opts.scale
    ? generateAccounts({
        accounts: opts.scale,
        seed: opts.seed,
        competitorIds: SCENARIO_COMPETITORS.map((c) => c.id).filter((id) => id !== "comp_inhouse"),
      })
    : [];

  const allAccounts = [
    ...SCENARIO_ACCOUNTS,
    ...generated.map((g) => ({ ...g, demonstrates: "Generated volume for scale testing." })),
  ];

  for (const account of allAccounts) {
    const companyId = slugId("company", account.domain || account.name);

    const signals: Signal[] = account.signals.map((s) => ({
      id: mkId("signal"),
      companyId,
      category: s.category,
      headline: s.headline,
      detail: s.detail,
      observedAt: now(),
      intentWeight: s.intentWeight,
      evidence: [scenarioEvidence(`${s.headline} — ${s.detail}`)],
    }));

    const penalties = account.disqualifiedBy
      ? [{ reason: account.disqualifiedBy, points: 40 }]
      : [];

    // The real scorer, so these numbers are computed rather than authored.
    const fit = scoreFit(
      {
        industry: account.industry,
        naics: account.naics,
        headcountEstimate: account.headcount ?? 0,
        hqLocation: account.hqLocation,
        techStack: account.techStack,
      },
      signals,
      icp,
      penalties,
    );

    const company: Company = {
      id: companyId,
      name: account.name,
      domain: account.domain,
      description: account.description,
      industry: account.industry,
      naics: account.naics,
      headcount: account.headcount,
      revenueEstimate: account.revenueEstimate,
      hqLocation: account.hqLocation,
      techStack: account.techStack,
      evidence: [scenarioEvidence(account.description)],
      fit,
      discoveredAt: now(),
      disqualified: Boolean(account.disqualifiedBy),
      disqualificationReason: account.disqualifiedBy,
    };
    addCompany(company);
    for (const s of signals) addSignal(s);

    if (account.usesCompetitor) {
      graph.addEdge("uses_vendor", companyId, account.usesCompetitor.id, {
        renewalWindow: account.usesCompetitor.renewalWindow,
      });
    }

    for (const p of account.people) {
      const person: Person = {
        id: slugId("person", `${account.domain}-${p.fullName}`),
        companyId,
        fullName: p.fullName,
        title: p.title,
        seniority: p.seniority,
        department: p.department,
        matchedPersona: p.matchedPersona,
        personaMatchScore: p.personaMatchScore,
        evidence: [scenarioEvidence(`${p.fullName} — ${p.title} at ${account.name}`)],
        enrichment: { emailConfidence: 0 },
        previousEmployers: p.previousEmployers,
        education: p.education,
      };
      addPerson(person);
      people.push(person);
      // Disqualified accounts still get a lead record so the board can show
      // that they exist and are not worked — hiding them would hide the filter.
      if (!company.disqualified) ensureLead(person.id, icp.id);
    }
  }

  // Sized to run dry partway through the buyer list.
  const credits = opts.credits ?? 45;
  db.ledger.granted = credits;
  db.ledger.consumed = 0;
  db.ledger.balance = credits;

  const distribution = generated.length ? describeDataset(generated) : null;

  emit(runId, "Scenario", "validation", "Scenario ingested", {
    detail: `${db.companies.length} accounts (${db.companies.filter((c) => c.disqualified).length} disqualified), ${people.length} buyers, ${db.signals.length} signals, ${db.competitors.length} competitors, ${graph.nodes.size} graph nodes / ${graph.edges.length} edges. Credits set to ${credits} so the enrichment gate fires mid-run.`,
  });

  return { icp, companies: db.companies, people, credits, distribution };
}
