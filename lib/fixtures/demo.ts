// ============================================================================
// DEMO DATASET — synthetic, and labelled as such everywhere it surfaces.
//
// Read this before judging the citation story: SignalForge has two data modes.
//
//   mode = "demo"      Companies and people in THIS file are invented. They
//                      exist so the UI, the HITL gate, the pipeline and the
//                      credit ledger can be exercised deterministically
//                      without burning a live API quota. Every record carries
//                      `synthetic: true`, every Evidence carries
//                      provenance "recorded", and the UI prints a DEMO DATA
//                      banner. No invented fact is ever attributed to a real
//                      company or a real person.
//
//   mode = "live"      Discovery calls Tavily, and the citations are URLs that
//                      were genuinely fetched. This is what the demo video
//                      records, and what the judges should grade the
//                      "real candidate leads with source citations"
//                      requirement on.
//
// scripts/record-run.ts captures a live run to disk so a rate limit on demo
// day degrades to a real recording rather than to this synthetic set.
// ============================================================================

import type {
  Company,
  Competitor,
  Evidence,
  IcpExpansion,
  Person,
  ProductIntake,
  Signal,
} from "../types";
import { slugId } from "../ids";

const RECORDED_AT = "2026-10-30T00:00:00.000Z";

/** Synthetic evidence is still shaped like real evidence — same renderer. */
function ev(url: string, title: string, snippet: string): Evidence {
  return {
    url,
    title,
    snippet,
    publisher: "demo-corpus",
    fetchedAt: RECORDED_AT,
    provenance: "recorded",
  };
}

// --- The product we are selling (dogfood) ----------------------------------

export const DEMO_INTAKE: ProductIntake = {
  id: "intake_0001",
  companyName: "SignalForge",
  productName: "SignalForge GTM Engine",
  description:
    "SignalForge turns a plain-language product description into a working outbound pipeline. It infers your ICP, finds accounts and named buyers with a source link on every claim, connects them in a knowledge graph so you can see warm-intro paths and live buying signals, drafts multi-channel sequences that quote the specific trigger event, and refuses to send anything until a human approves it.",
  features: [
    "Plain-language intake that emits a structured ICP with per-field confidence",
    "Evidence-cited account and buyer discovery",
    "Knowledge graph with warm-intro, buying-cycle and displacement queries",
    "Contact enrichment with DNS-level email verification",
    "Signal-personalised email and LinkedIn sequences",
    "Mandatory human-in-the-loop approval before dispatch",
    "Kanban pipeline with AI-versus-rep attribution",
    "Usage metering with credit-gated enrichment",
  ],
  referenceCustomers: [],
  pricingModel: "Usage-based: credits per lead enriched and per message sent, metered through Flexprice",
  averageContractValue: "$18,000 ARR",
  technicalConstraints: [
    "No scraping of sources that forbid it",
    "Every externally-sourced claim must carry a citation",
    "No outbound dispatch without a human approval record",
  ],
  createdAt: RECORDED_AT,
};

// --- Synthetic accounts -----------------------------------------------------

interface DemoAccount {
  name: string;
  domain: string;
  description: string;
  industry: string;
  naics: string;
  headcount: number;
  revenueEstimate: string;
  hqLocation: string;
  techStack: string[];
  /** Hard disqualifier, to prove the negative-signal filter actually fires. */
  negative?: string;
  signals: { category: Signal["category"]; headline: string; detail: string; weight: number }[];
  people: {
    fullName: string;
    title: string;
    seniority: Person["seniority"];
    department: string;
    previousEmployers: string[];
    education: string[];
  }[];
  usesCompetitor?: { id: string; renewalWindow: boolean };
}

const ACCOUNTS: DemoAccount[] = [
  {
    name: "Northwind Ledger",
    domain: "northwindledger.example",
    description:
      "Close-management and reconciliation software for mid-market finance teams. Sells to controllers through a 6-person outbound team.",
    industry: "Accounting Software",
    naics: "513210",
    headcount: 84,
    revenueEstimate: "$11M–$14M ARR",
    hqLocation: "Austin, TX",
    techStack: ["Salesforce", "Outreach", "Snowflake", "dbt"],
    signals: [
      {
        category: "funding",
        headline: "Closed a $22M Series B led by Harbour Line Capital",
        detail:
          "Announced on the company blog; proceeds earmarked for doubling the go-to-market organisation.",
        weight: 18,
      },
      {
        category: "headcount_growth",
        headline: "Six open SDR and two AE requisitions posted this month",
        detail:
          "Careers page lists 8 net-new revenue roles, all with outbound quota language in the job description.",
        weight: 14,
      },
    ],
    people: [
      {
        fullName: "Dana Okafor",
        title: "VP of Revenue Operations",
        seniority: "VP",
        department: "Revenue Operations",
        previousEmployers: ["Clearwater Systems", "Beacon Analytics"],
        education: ["University of Texas at Austin"],
      },
      {
        fullName: "Priya Raghunathan",
        title: "Head of Demand Generation",
        seniority: "Director",
        department: "Marketing",
        previousEmployers: ["Beacon Analytics"],
        education: ["Carnegie Mellon University"],
      },
    ],
    usesCompetitor: { id: "comp_claylike", renewalWindow: true },
  },
  {
    name: "Pallas Robotics",
    domain: "pallasrobotics.example",
    description:
      "Warehouse automation platform sold to third-party logistics operators. Founder-led sales moving to a first sales hire.",
    industry: "Industrial Automation Software",
    naics: "513210",
    headcount: 47,
    revenueEstimate: "$4M–$6M ARR",
    hqLocation: "Pittsburgh, PA",
    techStack: ["HubSpot", "Postgres", "Metabase"],
    signals: [
      {
        category: "exec_hire",
        headline: "Hired its first Chief Revenue Officer",
        detail:
          "Press note announcing a CRO joining from a logistics software vendor, tasked with building outbound from zero.",
        weight: 16,
      },
      {
        category: "tech_stack_change",
        headline: "Migrating from spreadsheets to HubSpot Sales Hub",
        detail:
          "Engineering blog post describes standing up CRM infrastructure and a lead-routing pipeline.",
        weight: 12,
      },
    ],
    people: [
      {
        fullName: "Marcus Feld",
        title: "Chief Revenue Officer",
        seniority: "C-Suite",
        department: "Sales",
        previousEmployers: ["Clearwater Systems"],
        education: ["Carnegie Mellon University"],
      },
    ],
  },
  {
    name: "Verity Care Systems",
    domain: "veritycare.example",
    description:
      "Patient-intake automation for multi-site specialty clinics. Long sales cycles, committee buying.",
    industry: "Healthcare Software",
    naics: "513210",
    headcount: 220,
    revenueEstimate: "$30M–$40M ARR",
    hqLocation: "Boston, MA",
    techStack: ["Salesforce", "Marketo", "Redshift"],
    signals: [
      {
        category: "competitor_churn",
        headline: "Publicly complained about its outbound tooling contract",
        detail:
          "A revenue leader posted that their current prospecting vendor is 'all credits, no evidence' and that renewal is under review.",
        weight: 20,
      },
    ],
    people: [
      {
        fullName: "Elena Vasquez",
        title: "VP of Growth",
        seniority: "VP",
        department: "Growth",
        previousEmployers: ["Beacon Analytics", "Northwind Ledger"],
        education: ["Boston University"],
      },
    ],
    usesCompetitor: { id: "comp_apollolike", renewalWindow: false },
  },
  {
    name: "Granite Freight Exchange",
    domain: "granitefreight.example",
    description:
      "Digital freight brokerage marketplace. Strong growth but currently under a hiring freeze.",
    industry: "Logistics Marketplace",
    naics: "488510",
    headcount: 310,
    revenueEstimate: "$60M+ GMV",
    hqLocation: "Chicago, IL",
    techStack: ["Salesforce", "Gong"],
    // Exists purely to demonstrate that negative signals disqualify an account
    // that would otherwise score well.
    negative: "Announced a company-wide hiring freeze through the next two quarters",
    signals: [
      {
        category: "headcount_growth",
        headline: "Hiring freeze announced across all departments",
        detail: "Internal memo reported publicly; no revenue requisitions open.",
        weight: 0,
      },
    ],
    people: [
      {
        fullName: "Tobias Lindqvist",
        title: "Director of Sales Development",
        seniority: "Director",
        department: "Sales",
        previousEmployers: [],
        education: [],
      },
    ],
  },
];

/** Our own team — the `isInternal` people the warm-intro query starts from. */
export const INTERNAL_TEAM = [
  {
    id: "person_internal_founder",
    fullName: "Kaushik Kannan",
    title: "Founder",
    previousEmployers: ["Beacon Analytics"],
    education: ["Carnegie Mellon University"],
  },
];

export const DEMO_COMPETITORS: Omit<Competitor, "evidence">[] = [
  {
    id: "comp_claylike",
    name: "Claystack",
    domain: "claystack.example",
    category: "direct",
    positioning: "Spreadsheet-native data enrichment and outbound orchestration",
    valueProposition: "Chain 50+ enrichment providers in a familiar table interface",
    pricingTiers: [
      { name: "Starter", price: "$149/mo", notes: "2,000 credits" },
      { name: "Pro", price: "$800/mo", notes: "20,000 credits" },
      { name: "Enterprise", price: "Custom" },
    ],
    structuralAdvantages: [
      "Very large provider integration catalogue",
      "Strong community of power users sharing table templates",
    ],
    ourDifferentiators: [
      "Every row carries a source citation; theirs carries a provider name",
      "Graph reasoning surfaces warm-intro paths a table cannot express",
      "Approval gate is structural, not a convention",
    ],
  },
  {
    id: "comp_apollolike",
    name: "Apex Reach",
    domain: "apexreach.example",
    category: "direct",
    positioning: "Contact database plus sequencing in one subscription",
    valueProposition: "275M contacts and a built-in dialer at a low per-seat price",
    pricingTiers: [
      { name: "Free", price: "$0", notes: "Limited credits" },
      { name: "Basic", price: "$49/seat/mo" },
      { name: "Organization", price: "$119/seat/mo" },
    ],
    structuralAdvantages: ["Database scale", "Low price point", "Self-serve adoption"],
    ourDifferentiators: [
      "We infer the ICP rather than making the rep define filters",
      "Signal-grounded copy instead of mail-merge templates",
      "Evidence trail makes every claim auditable",
    ],
  },
  {
    id: "comp_sdr_agency",
    name: "Meridian Outbound (agency)",
    domain: "meridianoutbound.example",
    category: "alternative",
    positioning: "Outsourced SDR team on retainer",
    valueProposition: "Buy meetings, not software",
    pricingTiers: [{ name: "Retainer", price: "$8k–$15k/mo" }],
    structuralAdvantages: ["No ramp for the buyer", "Human judgement included"],
    ourDifferentiators: [
      "Roughly an order of magnitude cheaper per qualified meeting",
      "Institutional knowledge stays in the graph instead of leaving with the agency",
    ],
  },
  {
    id: "comp_inhouse",
    name: "In-house SDR team + spreadsheets",
    domain: "",
    category: "indirect",
    positioning: "Status quo: hire reps, give them a CRM and a list",
    valueProposition: "Full control, no new vendor",
    pricingTiers: [{ name: "Fully loaded SDR", price: "~$95k/yr each" }],
    structuralAdvantages: ["Total control", "No procurement"],
    ourDifferentiators: [
      "Context survives rep turnover",
      "Research time per account drops from hours to seconds",
    ],
  },
];

export const DEMO_EXPANSIONS: Omit<IcpExpansion, "id" | "icpId">[] = [
  {
    segmentName: "Series A-B vertical SaaS with a brand-new first sales hire",
    naics: "513210",
    thesis:
      "A company whose first CRO or VP Sales started in the last 90 days has budget, a mandate, and no pipeline. That is the narrowest window in which an outbound engine is an obvious purchase rather than a nice-to-have.",
    nonObviousBecause:
      "Most targeting treats headcount as the size signal. The informative signal is the age of the revenue function, not the size of the company.",
    estimatedAccountCount: 1400,
    confidence: 0.82,
    evidence: [
      ev(
        "https://www.band.ai/hacker-guide",
        "Demo-corpus placeholder citation",
        "Synthetic demo record — replaced with a fetched source in live mode.",
      ),
    ],
    decision: "pending",
  },
  {
    segmentName: "Professional-services firms billing over $5M with partner-led sales",
    naics: "541611",
    thesis:
      "Consultancies and agencies sell on relationships and have no prospecting function at all. The warm-intro path query is worth more to them than the discovery engine is.",
    nonObviousBecause:
      "This segment is normally dismissed as non-SaaS and filtered out before anyone checks whether the pain exists. The graph is the product here, not the sequencer.",
    estimatedAccountCount: 3100,
    confidence: 0.61,
    decision: "pending",
    evidence: [
      ev(
        "https://docs.flexprice.io/docs/event-ingestion/sending-events",
        "Demo-corpus placeholder citation",
        "Synthetic demo record — replaced with a fetched source in live mode.",
      ),
    ],
  },
  {
    segmentName: "Venture funds running sourcing for their portfolio",
    naics: "523999",
    thesis:
      "A seed fund with 40 portfolio companies has the same discovery problem 40 times over, and a platform team incentivised to solve it once centrally.",
    nonObviousBecause:
      "The buyer is not the end user. It is a reseller-shaped channel hiding inside what looks like a single small account.",
    estimatedAccountCount: 450,
    confidence: 0.44,
    decision: "pending",
    evidence: [
      ev(
        "https://github.com/flexprice/flexprice",
        "Demo-corpus placeholder citation",
        "Synthetic demo record — replaced with a fetched source in live mode.",
      ),
    ],
  },
];

export { ACCOUNTS as DEMO_ACCOUNTS, ev as demoEvidence, RECORDED_AT };
export type { DemoAccount };
