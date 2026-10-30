// ============================================================================
// Production-scale dataset generator.
//
// Purpose: stress the system at the size a hyper-growth company would actually
// run it — hundreds of accounts, thousands of graph nodes — so that scoring
// distributions, graph traversal cost, grid rendering, funnel percentages and
// the credit ledger are all exercised under load rather than against seven
// hand-picked rows.
//
// Two properties matter more than volume:
//
//   1. DETERMINISM. A seeded PRNG, so the same seed yields byte-identical
//      output. A demo you cannot reproduce is a demo you cannot rehearse, and
//      a load test you cannot reproduce is not a test.
//
//   2. REALISTIC SHAPE. Fit scores should spread rather than cluster, signals
//      should follow a power law (most accounts have none, a few have several),
//      and former employers should overlap enough to produce genuine
//      warm-introduction paths — a uniformly random graph has almost none,
//      which would make the multi-hop queries look better than they are.
//
// Everything generated is synthetic. Company names are composed from word
// lists and all domains use reserved TLDs (.example / .invalid / .test), so no
// generated record can collide with a real organisation or a real person.
// ============================================================================

import type { TriggerCategory } from "../types";

/* --- deterministic PRNG (mulberry32) -------------------------------------- */

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const pickN = <T>(r: () => number, xs: readonly T[], n: number): T[] => {
  const pool = [...xs];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) out.push(...pool.splice(Math.floor(r() * pool.length), 1));
  return out;
};
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

/** Power law: most draws land low, a few land high. Used for signal counts. */
const powerLaw = (r: () => number, max: number) => Math.floor(Math.pow(r(), 2.2) * (max + 1));

/* --- vocabulary ------------------------------------------------------------ */

const PREFIX = [
  "North", "Iron", "Blue", "Cedar", "Vertex", "Lumen", "Harbor", "Quanta", "Orbit", "Granite",
  "Helio", "Nimbus", "Aster", "Cobalt", "Vellum", "Pallas", "Verity", "Juniper", "Obsidian",
  "Tessera", "Meridian", "Alloy", "Cinder", "Fathom", "Keystone", "Lattice", "Onyx", "Pinnacle",
  "Riven", "Solstice", "Thicket", "Umber", "Vantage", "Westlake", "Zephyr", "Beacon", "Calder",
] as const;
const SUFFIX = [
  "Labs", "Systems", "Works", "Technologies", "Analytics", "Health", "Logistics", "Financial",
  "Robotics", "Commerce", "Compliance", "Data", "Cloud", "Dynamics", "Networks", "Platform",
  "Intelligence", "Automation", "Infrastructure", "Security", "Ledger", "Grid", "Forge",
] as const;

interface Vertical {
  industry: string;
  naics: string;
  /** Whether this vertical is inside the ICP — drives the score spread. */
  inIcp: boolean;
  stack: readonly string[];
}

const VERTICALS: readonly Vertical[] = [
  { industry: "Vertical B2B SaaS", naics: "513210", inIcp: true, stack: ["Salesforce", "Outreach", "Snowflake"] },
  { industry: "Healthcare Software", naics: "513210", inIcp: true, stack: ["Salesforce", "Marketo"] },
  { industry: "Industrial Automation Software", naics: "513210", inIcp: true, stack: ["HubSpot", "Postgres"] },
  { industry: "FinTech Infrastructure", naics: "522320", inIcp: true, stack: ["Salesforce", "Salesloft"] },
  { industry: "Compliance Software", naics: "513210", inIcp: true, stack: ["HubSpot"] },
  { industry: "Logistics Marketplace", naics: "488510", inIcp: false, stack: ["Salesforce", "Gong"] },
  { industry: "Consumer Mobile App", naics: "513210", inIcp: false, stack: ["Amplitude"] },
  { industry: "Professional Services", naics: "541611", inIcp: false, stack: ["HubSpot"] },
  { industry: "Semiconductor Design", naics: "334413", inIcp: false, stack: [] },
  { industry: "AI Research Tooling", naics: "541715", inIcp: true, stack: ["Linear", "Snowflake"] },
] as const;

const US_CITIES = [
  "Austin, TX, United States", "Boston, MA, United States", "Denver, CO, United States",
  "Chicago, IL, United States", "Seattle, WA, United States", "Atlanta, GA, United States",
  "New York, NY, United States", "Pittsburgh, PA, United States", "San Diego, CA, United States",
] as const;
const ALLOWED_INTL = ["Toronto, Canada", "London, United Kingdom", "Manchester, United Kingdom"] as const;
const BLOCKED_INTL = [
  "Munich, Germany", "Berlin, Germany", "Lisbon, Portugal", "Milan, Italy", "Osaka, Japan",
] as const;

/** Shared employer pool, small enough that overlaps — and warm paths — occur. */
const EMPLOYER_POOL = [
  "Beacon Analytics", "Clearwater Systems", "Harborline Software", "Tessera Cloud",
  "Lattice Data", "Northgate Technologies", "Pinnacle Health IT", "Vantage Logistics",
  "Calder Financial", "Obsidian Security",
] as const;
const SCHOOL_POOL = [
  "Carnegie Mellon University", "University of Texas at Austin", "University of Michigan",
  "Boston University", "Georgia Institute of Technology", "University of Waterloo",
  "Imperial College London", "Purdue University",
] as const;

const TITLES: readonly {
  title: string;
  seniority: "IC" | "Manager" | "Director" | "VP" | "C-Suite" | "Founder";
  department: string;
  persona: string;
  score: [number, number];
}[] = [
  { title: "Chief Revenue Officer", seniority: "C-Suite", department: "Sales", persona: "VP Sales / CRO", score: [88, 98] },
  { title: "VP of Sales", seniority: "VP", department: "Sales", persona: "VP Sales / CRO", score: [85, 96] },
  { title: "VP of Revenue Operations", seniority: "VP", department: "Revenue Operations", persona: "Head of Revenue Operations", score: [84, 95] },
  { title: "Head of Revenue Operations", seniority: "Director", department: "Revenue Operations", persona: "Head of Revenue Operations", score: [78, 92] },
  { title: "Head of Demand Generation", seniority: "Director", department: "Marketing", persona: "Head of Demand Generation / Growth", score: [76, 90] },
  { title: "VP of Growth", seniority: "VP", department: "Growth", persona: "Head of Demand Generation / Growth", score: [80, 93] },
  { title: "Co-Founder & CEO", seniority: "Founder", department: "Executive", persona: "Founder / CEO (founder-led sales)", score: [82, 97] },
  { title: "Director of Sales Development", seniority: "Director", department: "Sales", persona: "SDR Manager", score: [62, 78] },
  { title: "Sales Development Manager", seniority: "Manager", department: "Sales", persona: "SDR Manager", score: [55, 72] },
  { title: "Marketing Operations Lead", seniority: "Manager", department: "Marketing", persona: "Head of Revenue Operations", score: [48, 68] },
];

interface SignalTemplate {
  category: TriggerCategory;
  headline: (ctx: { name: string; amount: string; role: string; n: number }) => string;
  detail: string;
  weight: [number, number];
}

const SIGNAL_TEMPLATES: readonly SignalTemplate[] = [
  {
    category: "funding",
    headline: (c) => `Raised a ${c.amount} round`,
    detail: "New capital arrives with a board mandate to build repeatable outbound.",
    weight: [9, 14],
  },
  {
    category: "exec_hire",
    headline: (c) => `Hired a new ${c.role}`,
    detail: "New revenue leaders rebuild the prospecting stack inside their first quarter.",
    weight: [11, 16],
  },
  {
    category: "headcount_growth",
    headline: (c) => `${c.n} SDR and AE requisitions open simultaneously`,
    detail: "Every posting carries outbound quota language.",
    weight: [6, 10],
  },
  {
    category: "tech_stack_change",
    headline: () => "CRM migration in progress",
    detail: "A sequencing layer without a trustworthy targeting layer is a half-finished stack.",
    weight: [7, 11],
  },
  {
    category: "competitor_churn",
    headline: () => "Public dissatisfaction with an incumbent prospecting vendor",
    detail: "An evaluation is already open and the stated objection is data trust.",
    weight: [14, 18],
  },
  {
    category: "expansion",
    headline: () => "Announced entry into a new vertical",
    detail: "A new market means no existing account list and no ICP.",
    weight: [8, 12],
  },
  {
    category: "product_launch",
    headline: () => "Launched a second product line",
    detail: "A new product needs a fresh buyer map and messaging.",
    weight: [6, 10],
  },
  {
    category: "regulatory",
    headline: () => "Dated compliance deadline in the buyer's own market",
    detail: "Non-discretionary spend with a fixed date attached.",
    weight: [8, 12],
  },
];

const DISQUALIFIERS = [
  "Announced a company-wide hiring freeze through the next two quarters",
  "Headquartered in a strict opt-in outbound jurisdiction with no entity in an opt-out market",
  "Pure self-serve motion: no sales roles posted in twelve months and no demo call to action",
  "Sells primarily to consumers rather than businesses",
  "An agency that sells the same outcome this product delivers",
] as const;

const ROLES = ["VP of Sales", "Chief Revenue Officer", "Head of Growth", "VP Marketing"] as const;
const AMOUNTS = ["$4M Seed", "$12M Series A", "$22M Series B", "$8M Seed extension", "$35M Series B"] as const;

const FIRST = [
  "Dana", "Marcus", "Elena", "Priya", "Tobias", "Katrin", "Sam", "Rosa", "Ines", "Omar",
  "Yuki", "Nadia", "Felix", "Leila", "Arun", "Mira", "Jonas", "Sofia", "Darius", "Noor",
  "Caleb", "Anya", "Theo", "Imani", "Lukas", "Freya", "Rahul", "Clara", "Mateo", "Zara",
] as const;
const LAST = [
  "Okafor", "Feld", "Vasquez", "Raghunathan", "Lindqvist", "Brandt", "Oyelaran", "Delgado",
  "Moreau", "Haddad", "Tanaka", "Osei", "Varga", "Nkemdirim", "Castellanos", "Bergstrom",
  "Adeyemi", "Fontaine", "Mazzola", "Petrov", "Okonkwo", "Rosenthal", "Iyer", "Dvorak",
] as const;

/* --- the generator --------------------------------------------------------- */

export interface GeneratedAccount {
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
  signals: { category: TriggerCategory; headline: string; detail: string; intentWeight: number }[];
  people: {
    fullName: string;
    title: string;
    seniority: "IC" | "Manager" | "Director" | "VP" | "C-Suite" | "Founder";
    department: string;
    matchedPersona: string;
    personaMatchScore: number;
    previousEmployers: string[];
    education: string[];
  }[];
}

export interface GenerateOptions {
  accounts: number;
  seed?: number;
  /** Competitor ids the generated accounts may be using. */
  competitorIds?: string[];
}

export function generateAccounts(opts: GenerateOptions): GeneratedAccount[] {
  const r = rng(opts.seed ?? 20261030);
  const competitorIds = opts.competitorIds ?? ["comp_claystack", "comp_apexreach"];
  const used = new Set<string>();
  const out: GeneratedAccount[] = [];

  for (let i = 0; i < opts.accounts; i++) {
    // Unique composed name; reserved TLDs so nothing can collide with reality.
    let name = "";
    for (let tries = 0; tries < 40; tries++) {
      const candidate = `${pick(r, PREFIX)} ${pick(r, SUFFIX)}`;
      if (!used.has(candidate)) {
        name = candidate;
        break;
      }
    }
    if (!name) name = `${pick(r, PREFIX)} ${pick(r, SUFFIX)} ${i}`;
    used.add(name);

    const vertical = pick(r, VERTICALS);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    // 1 in 14 gets an unresolvable domain, exercising enrichment failure.
    const tld = r() < 0.07 ? "invalid" : r() < 0.04 ? "test" : "example";
    const domain = `${slug}.${tld}`;

    // Roughly 9% disqualified, spread across all five reasons.
    const disqualified = r() < 0.09;
    const disqualifiedBy = disqualified ? pick(r, DISQUALIFIERS) : undefined;

    const geoBlocked = disqualifiedBy?.includes("opt-in outbound jurisdiction");
    const hqLocation = geoBlocked
      ? pick(r, BLOCKED_INTL)
      : r() < 0.08
        ? pick(r, BLOCKED_INTL)
        : r() < 0.14
          ? pick(r, ALLOWED_INTL)
          : pick(r, US_CITIES);

    // 1 in 9 has no stated headcount — the honest-null path.
    const headcount =
      r() < 0.11 ? undefined : vertical.inIcp ? int(r, 22, 320) : int(r, 8, 900);

    const signalCount = disqualified ? (r() < 0.5 ? 1 : 0) : powerLaw(r, 4);
    const signals = pickN(r, SIGNAL_TEMPLATES, signalCount).map((t) => ({
      category: t.category,
      headline: t.headline({
        name,
        amount: pick(r, AMOUNTS),
        role: pick(r, ROLES),
        n: int(r, 2, 9),
      }),
      detail: t.detail,
      intentWeight: disqualified ? 0 : int(r, t.weight[0], t.weight[1]),
    }));

    const usesCompetitor =
      r() < 0.32
        ? { id: pick(r, competitorIds), renewalWindow: r() < 0.35 }
        : undefined;

    const peopleCount = disqualified ? 1 : int(r, 1, 4);
    const people = pickN(r, TITLES, peopleCount).map((t) => ({
      fullName: `${pick(r, FIRST)} ${pick(r, LAST)}`,
      title: t.title,
      seniority: t.seniority,
      department: t.department,
      matchedPersona: t.persona,
      personaMatchScore: int(r, t.score[0], t.score[1]),
      // Small employer pool on purpose: overlap is what creates warm paths.
      previousEmployers: r() < 0.55 ? pickN(r, EMPLOYER_POOL, int(r, 1, 2)) : [],
      education: r() < 0.6 ? pickN(r, SCHOOL_POOL, 1) : [],
    }));

    out.push({
      name,
      domain,
      description: `${vertical.industry.replace(/ Software| Marketplace/, "")} platform sold to ${
        vertical.inIcp ? "mid-market revenue and operations teams" : "enterprise procurement"
      }. ${
        headcount ? `Roughly ${headcount} employees.` : "Headcount not publicly stated."
      }`,
      industry: vertical.industry,
      naics: vertical.naics,
      headcount,
      revenueEstimate: headcount ? `$${Math.round(headcount * 0.13)}M–$${Math.round(headcount * 0.22)}M ARR` : undefined,
      hqLocation,
      techStack: r() < 0.8 ? pickN(r, vertical.stack, int(r, 1, vertical.stack.length || 1)) : [],
      disqualifiedBy,
      usesCompetitor,
      signals,
      people,
    });
  }

  return out;
}

/** Distribution summary, printed by the load route so scale is auditable. */
export function describe(accounts: GeneratedAccount[]) {
  const people = accounts.flatMap((a) => a.people);
  const signals = accounts.flatMap((a) => a.signals);
  const byVertical = new Map<string, number>();
  for (const a of accounts) byVertical.set(a.industry, (byVertical.get(a.industry) ?? 0) + 1);
  return {
    accounts: accounts.length,
    people: people.length,
    signals: signals.length,
    disqualified: accounts.filter((a) => a.disqualifiedBy).length,
    unknownHeadcount: accounts.filter((a) => !a.headcount).length,
    unresolvableDomains: accounts.filter((a) => /\.(invalid|test)$/.test(a.domain)).length,
    usingCompetitor: accounts.filter((a) => a.usesCompetitor).length,
    inRenewalWindow: accounts.filter((a) => a.usesCompetitor?.renewalWindow).length,
    verticals: [...byVertical.entries()].sort((a, b) => b[1] - a[1]),
    signalsPerAccount: {
      none: accounts.filter((a) => a.signals.length === 0).length,
      one: accounts.filter((a) => a.signals.length === 1).length,
      twoPlus: accounts.filter((a) => a.signals.length >= 2).length,
    },
  };
}
