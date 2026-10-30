// ============================================================================
// THE DEMO SCENARIO — synthetic by design, and engineered as test cases.
//
// Everything here is invented: companies, people, domains, signals. Nothing is
// a real person and nothing is attributed to a real company. That is the whole
// point: a recorded demo is a publication, and this product's subject matter is
// identifiable information about people who never consented to being in it.
//
// Each record exists to exercise ONE capability so it can be narrated. The
// mapping is in DEMO-GUIDE.md; the `demonstrates` field on each record is the
// same claim, kept next to the data so the two cannot drift.
//
// Deliberately NOT faked: enrichment method and MX status. Synthetic domains
// genuinely have no MX record, so the real pipeline will correctly refuse to
// claim a verified address for any of these people. That is a feature to show,
// not a gap to paper over — and it is why the demo also includes one live run
// (with masking on) where MX validation genuinely succeeds.
// ============================================================================

import type { Competitor, Evidence, TriggerCategory } from "../types";

export const SCENARIO_NOTE =
  "Synthetic scenario dataset. Companies and people are invented; no real individual's data appears here.";

/** Evidence for synthetic records points at the scenario file itself. */
function synthetic(claim: string): Evidence {
  return {
    url: "https://github.com/kaushikkannan2/signalforge-gtm-engine/blob/main/lib/fixtures/scenario.ts",
    title: "Synthetic scenario record",
    snippet: claim,
    publisher: "scenario-fixture",
    fetchedAt: "2026-10-30T00:00:00.000Z",
    provenance: "recorded",
  };
}

export interface ScenarioSignal {
  category: TriggerCategory;
  headline: string;
  detail: string;
  intentWeight: number;
}

export interface ScenarioPerson {
  fullName: string;
  title: string;
  seniority: "IC" | "Manager" | "Director" | "VP" | "C-Suite" | "Founder";
  department: string;
  matchedPersona: string;
  personaMatchScore: number;
  previousEmployers: string[];
  education: string[];
  /** The single capability this person exists to demonstrate. */
  demonstrates: string;
}

export interface ScenarioAccount {
  name: string;
  domain: string;
  description: string;
  industry: string;
  naics: string;
  headcount?: number;
  revenueEstimate?: string;
  hqLocation: string;
  techStack: string[];
  disqualifiedBy?: string;
  usesCompetitor?: { id: string; renewalWindow: boolean };
  signals: ScenarioSignal[];
  people: ScenarioPerson[];
  demonstrates: string;
}

/** Our own side of the graph — the origin for every warm-introduction path. */
export const SCENARIO_TEAM = [
  {
    id: "person_internal_founder",
    fullName: "Kaushik Kannan",
    title: "Founder",
    previousEmployers: ["Beacon Analytics"],
    education: ["Carnegie Mellon University"],
  },
  {
    id: "person_internal_ae",
    fullName: "Rosa Delgado",
    title: "Account Executive",
    previousEmployers: ["Clearwater Systems"],
    education: ["University of Texas at Austin"],
  },
];

export const SCENARIO_ACCOUNTS: ScenarioAccount[] = [
  {
    name: "Northwind Ledger",
    domain: "northwindledger.example",
    description:
      "Close-management and reconciliation software for mid-market finance teams. Sells to controllers through a six-person outbound team.",
    industry: "Accounting Software",
    naics: "513210",
    headcount: 84,
    revenueEstimate: "$11M–$14M ARR",
    hqLocation: "Austin, TX, United States",
    techStack: ["Salesforce", "Outreach", "Snowflake"],
    usesCompetitor: { id: "comp_claystack", renewalWindow: true },
    demonstrates:
      "Tier A with three reinforcing signals — shows intent AGGREGATION rather than one loud event, and a renewal window for the displacement query.",
    signals: [
      {
        category: "funding",
        headline: "Closed a $22M Series B led by Harbour Line Capital",
        detail: "Proceeds earmarked for doubling the go-to-market organisation.",
        intentWeight: 12,
      },
      {
        category: "exec_hire",
        headline: "Hired a VP of Revenue Operations in the last 60 days",
        detail: "New RevOps leaders rebuild the prospecting stack inside their first quarter.",
        intentWeight: 10,
      },
      {
        category: "headcount_growth",
        headline: "Six SDR and two AE requisitions open simultaneously",
        detail: "All eight postings carry outbound quota language.",
        intentWeight: 8,
      },
    ],
    people: [
      {
        fullName: "Dana Okafor",
        title: "VP of Revenue Operations",
        seniority: "VP",
        department: "Revenue Operations",
        matchedPersona: "Head of Revenue Operations",
        personaMatchScore: 94,
        previousEmployers: ["Beacon Analytics", "Clearwater Systems"],
        education: ["University of Michigan"],
        demonstrates:
          "WARM INTRO via shared former employer — Beacon Analytics links her to our founder, two hops.",
      },
      {
        fullName: "Priya Raghunathan",
        title: "Head of Demand Generation",
        seniority: "Director",
        department: "Marketing",
        matchedPersona: "Head of Demand Generation / Growth",
        personaMatchScore: 88,
        previousEmployers: [],
        education: ["Carnegie Mellon University"],
        demonstrates:
          "WARM INTRO via shared institution — a different bridge type through the same query.",
      },
    ],
  },
  {
    name: "Pallas Robotics",
    domain: "pallasrobotics.example",
    description:
      "Warehouse automation platform sold to third-party logistics operators. Founder-led sales, now hiring its first revenue leader.",
    industry: "Industrial Automation Software",
    naics: "513210",
    // Deliberately absent.
    headcount: undefined,
    hqLocation: "Pittsburgh, PA, United States",
    techStack: ["HubSpot"],
    demonstrates:
      "UNKNOWN HEADCOUNT — scored with partial credit rather than a plausible guess, and the grid renders an em dash instead of a number.",
    signals: [
      {
        category: "exec_hire",
        headline: "Appointed its first Chief Revenue Officer",
        detail: "Joined from a logistics software vendor, tasked with building outbound from zero.",
        intentWeight: 14,
      },
      {
        category: "tech_stack_change",
        headline: "Standing up CRM infrastructure and lead routing",
        detail: "Engineering blog describes a migration from spreadsheets to HubSpot Sales Hub.",
        intentWeight: 9,
      },
    ],
    people: [
      {
        fullName: "Marcus Feld",
        title: "Chief Revenue Officer",
        seniority: "C-Suite",
        department: "Sales",
        matchedPersona: "VP Sales / CRO",
        personaMatchScore: 96,
        previousEmployers: ["Clearwater Systems"],
        education: [],
        demonstrates:
          "ACTIVE BUYING CYCLE — C-suite economic buyer at an account whose aggregate hiring and tooling intent clears the threshold.",
      },
    ],
  },
  {
    name: "Verity Care Systems",
    domain: "veritycare.example",
    description:
      "Patient-intake automation for multi-site specialty clinics. Committee buying, long cycles, currently unhappy with its prospecting vendor.",
    industry: "Healthcare Software",
    naics: "513210",
    headcount: 220,
    revenueEstimate: "$30M–$40M ARR",
    hqLocation: "Boston, MA, United States",
    techStack: ["Salesforce", "Marketo"],
    usesCompetitor: { id: "comp_apexreach", renewalWindow: false },
    demonstrates:
      "COMPETITOR DISPLACEMENT with a churn signal — scores higher than a renewal window alone, because a public complaint is stronger evidence than a contract date.",
    signals: [
      {
        category: "competitor_churn",
        headline: "Revenue leader publicly criticised their outbound tooling",
        detail:
          "Posted that their prospecting vendor is 'all credits, no evidence' and that renewal is under review.",
        intentWeight: 16,
      },
    ],
    people: [
      {
        fullName: "Elena Vasquez",
        title: "VP of Growth",
        seniority: "VP",
        department: "Growth",
        matchedPersona: "Head of Demand Generation / Growth",
        personaMatchScore: 91,
        previousEmployers: ["Beacon Analytics"],
        education: ["Boston University"],
        demonstrates: "Displacement target who is ALSO reachable through a warm path — the two queries intersect.",
      },
    ],
  },
  {
    name: "Granite Freight Exchange",
    domain: "granitefreight.example",
    description: "Digital freight brokerage marketplace. Strong growth, but currently frozen on hiring.",
    industry: "Logistics Marketplace",
    naics: "488510",
    headcount: 310,
    hqLocation: "Chicago, IL, United States",
    techStack: ["Salesforce", "Gong"],
    disqualifiedBy: "Announced a company-wide hiring freeze through the next two quarters",
    demonstrates:
      "NEGATIVE SIGNAL #1 — an account that scores well on every firmographic and is still disqualified. Shown struck through, not hidden, with the reason on the row.",
    signals: [
      {
        category: "headcount_growth",
        headline: "Company-wide hiring freeze announced",
        detail: "No revenue requisitions open; freeze stated through the next two quarters.",
        intentWeight: 0,
      },
    ],
    people: [
      {
        fullName: "Tobias Lindqvist",
        title: "Director of Sales Development",
        seniority: "Director",
        department: "Sales",
        matchedPersona: "SDR Manager",
        personaMatchScore: 72,
        previousEmployers: [],
        education: [],
        demonstrates: "A perfectly good persona match at a disqualified account — proves disqualification propagates and this person is never worked.",
      },
    ],
  },
  {
    name: "Meridian Analytik GmbH",
    domain: "meridian-analytik.example",
    description: "Supply-chain analytics for European manufacturers. Mid-market, growing, well funded.",
    industry: "Analytics Software",
    naics: "513210",
    headcount: 140,
    hqLocation: "Munich, Germany",
    techStack: ["Salesforce", "Pardot"],
    disqualifiedBy:
      "Headquartered in a strict opt-in outbound jurisdiction (Germany) with no entity in an opt-out market",
    demonstrates:
      "NEGATIVE SIGNAL #2 — a COMPLIANCE disqualifier, not a fit one. Shows the filter encodes legal constraint, which is the objection a buyer's counsel raises first.",
    signals: [
      {
        category: "funding",
        headline: "Raised a €18M growth round",
        detail: "Would be a strong signal in a permitted jurisdiction.",
        intentWeight: 11,
      },
    ],
    people: [
      {
        fullName: "Katrin Brandt",
        title: "VP Commercial",
        seniority: "VP",
        department: "Commercial",
        matchedPersona: "VP Sales / CRO",
        personaMatchScore: 85,
        previousEmployers: [],
        education: [],
        demonstrates: "High-scoring buyer excluded on legal grounds rather than fit grounds.",
      },
    ],
  },
  {
    name: "Cobalt Compliance",
    domain: "cobaltcompliance.invalid",
    description:
      "Regulatory reporting software for credit unions. Small, profitable, buys infrastructure rather than services.",
    industry: "Compliance Software",
    naics: "513210",
    headcount: 38,
    hqLocation: "Denver, CO, United States",
    techStack: ["HubSpot"],
    demonstrates:
      "UNRESOLVABLE CONTACT — the domain has no MX record, so enrichment correctly refuses to claim an address. Honest failure beats a confident guess.",
    signals: [
      {
        category: "regulatory",
        headline: "New NCUA reporting rule takes effect next quarter",
        detail: "Compliance deadlines create dated, non-discretionary buying windows.",
        intentWeight: 10,
      },
    ],
    people: [
      {
        fullName: "Sam Oyelaran",
        title: "Head of Revenue",
        seniority: "Director",
        department: "Revenue",
        matchedPersona: "VP Sales / CRO",
        personaMatchScore: 80,
        previousEmployers: [],
        education: ["University of Texas at Austin"],
        demonstrates:
          "Enrichment FAILS honestly — no MX, so no address is claimed, and the row says 'unresolved' rather than showing a pattern guess.",
      },
    ],
  },
  {
    name: "Helio Commerce",
    domain: "heliocommerce.example",
    description: "Headless commerce platform for DTC brands. Self-serve motion, no outbound team, no demo CTA.",
    industry: "E-commerce Software",
    naics: "513210",
    headcount: 26,
    hqLocation: "Lisbon, Portugal",
    techStack: [],
    demonstrates:
      "LOW-FIT TIER C — no signals, weak geo and stack match. Shows the score discriminating rather than flattering everything it finds.",
    signals: [],
    people: [],
  },
];

export const SCENARIO_COMPETITORS: Omit<Competitor, "evidence">[] = [
  {
    id: "comp_claystack",
    name: "Claystack",
    domain: "claystack.example",
    category: "direct",
    positioning: "Spreadsheet-native data enrichment and outbound orchestration",
    valueProposition: "Chain a large catalogue of enrichment providers in a familiar table interface",
    pricingTiers: [
      { name: "Starter", price: "$149/mo", notes: "2,000 credits" },
      { name: "Pro", price: "$800/mo", notes: "20,000 credits" },
      { name: "Enterprise", price: "Not published" },
    ],
    structuralAdvantages: ["Large provider catalogue", "Community of power users sharing templates"],
    ourDifferentiators: [
      "Every row carries a source citation; theirs carries a provider name",
      "Graph reasoning surfaces warm-intro paths a table cannot express",
      "The approval gate is structural, not a convention",
    ],
  },
  {
    id: "comp_apexreach",
    name: "Apex Reach",
    domain: "apexreach.example",
    category: "direct",
    positioning: "Contact database plus sequencing in one subscription",
    valueProposition: "275M contacts and a built-in dialer at a low per-seat price",
    pricingTiers: [
      { name: "Free", price: "$0", notes: "Limited credits" },
      { name: "Basic", price: "$49/seat/mo", notes: "" },
      { name: "Organization", price: "$119/seat/mo", notes: "" },
    ],
    structuralAdvantages: ["Database scale", "Low price point", "Self-serve adoption"],
    ourDifferentiators: [
      "The ICP is inferred rather than hand-filtered by the rep",
      "Copy is grounded in a dated signal instead of mail-merge fields",
      "Every claim is auditable back to a URL",
    ],
  },
  {
    id: "comp_meridian_agency",
    name: "Meridian Outbound",
    domain: "meridianoutbound.example",
    category: "alternative",
    positioning: "Outsourced SDR team on retainer",
    valueProposition: "Buy meetings, not software",
    pricingTiers: [{ name: "Retainer", price: "$3k–$14k/mo", notes: "Entry tiers from $2.5k; enterprise $15k-30k+" }],
    structuralAdvantages: ["No ramp for the buyer", "Human judgement included"],
    ourDifferentiators: [
      "Cheaper per qualified meeting than a mid-market retainer, though not than an entry tier",
      "Institutional knowledge stays in the graph instead of leaving with the agency",
    ],
  },
  {
    id: "comp_inhouse",
    name: "In-house SDRs with a manual stack",
    domain: "",
    category: "indirect",
    positioning: "The status quo: hire reps, give them a CRM and a list",
    valueProposition: "Full control, no new vendor",
    pricingTiers: [{ name: "Fully loaded SDR", price: "$90k–$130k/yr each", notes: "Base, commission, benefits, tooling, ramp" }],
    structuralAdvantages: ["Total control", "No procurement"],
    ourDifferentiators: [
      "Context survives rep turnover",
      "Research time per account drops from hours to seconds",
    ],
  },
];

export { synthetic as scenarioEvidence };
