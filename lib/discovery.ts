// ============================================================================
// Module 2 — Buyer discovery & competitor mapping.
//
// The anti-hallucination mechanism is structural, not a prompt instruction.
//
// The model never writes a URL. It is handed a numbered list of search results
// that were genuinely fetched, and the schema forces it to answer with
// *indices* into that list. We then resolve those indices back to the real
// Evidence objects on our side. A fabricated citation is therefore not
// something the model is asked to avoid — it is something it has no way to
// express. Any company whose supporting indices are empty is dropped before
// it reaches the UI.
// ============================================================================

import { structured } from "./providers/anthropic";
import { search, searchMany, type SearchHit } from "./providers/tavily";
import { emit, traced } from "./thinking";
import { addCompany, addPerson, addSignal, db } from "./db";
import { graph } from "./graph";
import { id as mkId, now, slugId } from "./ids";
import type {
  Company,
  Evidence,
  FitScore,
  IcpDefinition,
  Person,
  Signal,
  TriggerCategory,
} from "./types";

// --- query planning --------------------------------------------------------

/**
 * Discovery fans out across several angles rather than issuing one query,
 * because a single phrasing surfaces a single slice of the web. Angles are
 * derived from the approved ICP: who they are, what just happened to them,
 * and who inside them owns the pain.
 */
export function planQueries(icp: IcpDefinition, limit = 6): string[] {
  const verticals = icp.industries.value.map((i) => i.name);
  const triggers = icp.triggerEvents.value
    .slice()
    .sort((a, b) => b.intentWeight - a.intentWeight)
    .map((t) => t.label);
  const persona = icp.personas.value[0]?.title ?? "VP Sales";
  const size = icp.headcountRange.value;
  const geo = icp.geographies.value[0] ?? "United States";

  const queries = [
    `${verticals[0]} companies ${size.min}-${size.max} employees ${geo} 2026`,
    triggers[0] ? `${verticals[0]} company ${triggers[0]} announcement 2026` : null,
    triggers[1] ? `${verticals[1] ?? verticals[0]} ${triggers[1]} 2026` : null,
    `${verticals[0]} companies hiring ${persona} 2026`,
    verticals[1] ? `fast growing ${verticals[1]} companies ${geo} funding 2026` : null,
    `${verticals[0]} startups scaling outbound sales team 2026`,
  ].filter((q): q is string => Boolean(q));

  return queries.slice(0, limit);
}

// --- extraction ------------------------------------------------------------

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    companies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          domain: { type: "string", description: "Primary web domain, no scheme or path." },
          description: { type: "string", description: "What they sell and to whom, one or two sentences." },
          industry: { type: "string" },
          naics: { type: "string" },
          headcountEstimate: { type: "integer", description: "Best estimate; 0 if genuinely unknown." },
          hqLocation: { type: "string" },
          techStack: { type: "array", items: { type: "string" } },
          sourceIndices: {
            type: "array",
            items: { type: "integer" },
            description:
              "Indices of the numbered search results that support this company. Must be non-empty. Never invent an index.",
          },
          disqualified: { type: "boolean" },
          disqualificationReason: {
            type: "string",
            description: "Which ICP negative signal fired, or empty string if none.",
          },
          signals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  enum: [
                    "funding",
                    "exec_hire",
                    "tech_stack_change",
                    "headcount_growth",
                    "expansion",
                    "competitor_churn",
                    "regulatory",
                    "product_launch",
                  ],
                },
                headline: { type: "string" },
                detail: { type: "string" },
                intentWeight: { type: "integer" },
                sourceIndices: { type: "array", items: { type: "integer" } },
              },
              required: ["category", "headline", "detail", "intentWeight", "sourceIndices"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "name",
          "domain",
          "description",
          "industry",
          "naics",
          "headcountEstimate",
          "hqLocation",
          "techStack",
          "sourceIndices",
          "disqualified",
          "disqualificationReason",
          "signals",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["companies"],
  additionalProperties: false,
} as const;

interface RawCompany {
  name: string;
  domain: string;
  description: string;
  industry: string;
  naics: string;
  headcountEstimate: number;
  hqLocation: string;
  techStack: string[];
  sourceIndices: number[];
  disqualified: boolean;
  disqualificationReason: string;
  signals: {
    category: TriggerCategory;
    headline: string;
    detail: string;
    intentWeight: number;
    sourceIndices: number[];
  }[];
}

const EXTRACT_SYSTEM = `You extract prospective corporate accounts from web search results.

Hard rules:
- Only name a company that actually appears in the numbered results. If the
  results are listicles or job boards that name no specific company, return an
  empty array. An empty answer is correct and useful; an invented company is not.
- sourceIndices must reference the numbered results you were given, and must
  point at results that genuinely mention that company. Never guess an index.
- Do not output a company that is itself a vendor of the product being sold,
  a directory, a news outlet, a job board, or an aggregator.
- Agencies and consultancies that SELL the same outcome as the product being
  sold are competitors, not prospects. An outbound or demand-generation agency
  is only a prospect if the product would be infrastructure it buys rather
  than a service it competes with — and if you include one, say which in the
  description so the operator can judge. When in doubt, exclude it.
- Set disqualified=true and name the ICP negative signal when a result shows a
  disqualifying fact. Disqualified accounts are kept, not hidden — the operator
  needs to see what was filtered and why.
- A signal must be a specific dated-or-recent event mentioned in the sources,
  not a general characteristic. "Raised $12M Series A in March" is a signal.
  "Is growing" is not.
- headcountEstimate 0 means unknown. Do not fill it with a plausible number.`;

/** Resolves model-supplied indices back to the Evidence we actually fetched. */
function resolveEvidence(indices: number[], pool: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return indices
    .map((i) => pool[i])
    .filter((e): e is Evidence => Boolean(e))
    .filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true)));
}

// --- fit scoring -----------------------------------------------------------

/**
 * Composite 0-100 score, decomposed so the UI can show the arithmetic. The
 * operator should be able to disagree with a score and see exactly which
 * component they disagree with.
 */
export function scoreFit(
  company: {
    industry: string;
    naics: string;
    headcountEstimate: number;
    hqLocation: string;
    techStack: string[];
  },
  signals: { intentWeight: number }[],
  icp: IcpDefinition,
  penalties: { reason: string; points: number }[] = [],
): FitScore {
  const naicsPrefixes = icp.industries.value.map((i) => i.naics.slice(0, 4));
  const industryNames = icp.industries.value.map((i) => i.name.toLowerCase());
  const industryMatch =
    naicsPrefixes.includes(company.naics.slice(0, 4))
      ? 25
      : industryNames.some(
            (n) =>
              company.industry.toLowerCase().includes(n.split(" ")[0]) ||
              n.includes(company.industry.toLowerCase().split(" ")[0]),
          )
        ? 18
        : 6;

  const { min, max } = icp.headcountRange.value;
  const hc = company.headcountEstimate;
  const sizeMatch =
    hc === 0
      ? 8 // unknown is not the same as wrong; partial credit, visible as such
      : hc >= min && hc <= max
        ? 20
        : hc >= min * 0.5 && hc <= max * 2
          ? 12
          : 3;

  const geos = icp.geographies.value.map((g) => g.toLowerCase());
  const geoMatch = geos.some(
    (g) =>
      company.hqLocation.toLowerCase().includes(g) ||
      g.includes("global") ||
      g.includes("united states") && /\b(us|usa|ca|ny|tx|ma|il|wa)\b/i.test(company.hqLocation),
  )
    ? 15
    : company.hqLocation
      ? 7
      : 4;

  const affinity = icp.techStackAffinity.value.map((t) => t.toLowerCase());
  const overlap = company.techStack.filter((t) =>
    affinity.some((a) => a.includes(t.toLowerCase()) || t.toLowerCase().includes(a.split(" ")[0])),
  ).length;
  const techStackMatch = Math.min(10, overlap * 4);

  const intentSignals = Math.min(30, signals.reduce((s, x) => s + x.intentWeight, 0));

  const penaltyTotal = penalties.reduce((s, p) => s + p.points, 0);
  const total = Math.max(
    0,
    Math.min(100, industryMatch + sizeMatch + geoMatch + techStackMatch + intentSignals - penaltyTotal),
  );

  return {
    total,
    tier: total >= 70 ? "A" : total >= 45 ? "B" : "C",
    components: { industryMatch, sizeMatch, geoMatch, techStackMatch, intentSignals },
    penalties,
  };
}

// --- the discovery run -----------------------------------------------------

export interface DiscoveryResult {
  companies: Company[];
  queriesRun: string[];
  resultsSeen: number;
  droppedUncited: number;
  mode: string;
}

export async function discoverAccounts(
  icp: IcpDefinition,
  runId: string,
  opts: { maxQueries?: number; maxCompanies?: number } = {},
): Promise<DiscoveryResult> {
  const queries = planQueries(icp, opts.maxQueries ?? 5);
  emit(runId, "Discovery", "reasoning", `Planned ${queries.length} search angles`, {
    detail: queries.join(" · "),
  });

  const results = await traced(runId, "Discovery", "tool_call", "Live web search fan-out", () =>
    searchMany(queries, { maxResults: 6 }),
  );

  // One flat, numbered pool. Indices in the pool are what the model answers with.
  const hits: SearchHit[] = results.flatMap((r) => r.hits);
  const pool: Evidence[] = results.flatMap((r) => r.evidence);
  const liveCount = results.filter((r) => r.mode === "live").length;

  if (!pool.length) {
    emit(runId, "Discovery", "error", "No search results available", {
      detail: "Tavily returned nothing or is not configured — discovery cannot cite, so it stops.",
    });
    return { companies: [], queriesRun: queries, resultsSeen: 0, droppedUncited: 0, mode: "unavailable" };
  }

  emit(runId, "Discovery", "validation", `${pool.length} sources retrieved from ${liveCount} live queries`);

  const numbered = hits
    .map((h, i) => `[${i}] ${h.title}\n    ${h.url}\n    ${h.content.slice(0, 400)}`)
    .join("\n\n");

  const prompt = `Approved ICP:
Verticals: ${icp.industries.value.map((i) => `${i.name} (${i.naics})`).join(", ")}
Headcount: ${icp.headcountRange.value.min}-${icp.headcountRange.value.max}
Geographies: ${icp.geographies.value.join(", ")}
Tech affinity: ${icp.techStackAffinity.value.slice(0, 10).join(", ")}
Trigger events that matter: ${icp.triggerEvents.value.map((t) => t.label).join("; ")}

ICP negative signals (disqualifiers):
${icp.negativeSignals.value.map((n) => `- ${n}`).join("\n")}

Numbered search results:

${numbered}

Extract every specific prospective account these results actually name.`;

  const { data, usage } = await traced(
    runId,
    "Discovery",
    "reasoning",
    "Extracting accounts with mandatory source indices",
    () =>
      structured<{ companies: RawCompany[] }>(prompt, {
        system: EXTRACT_SYSTEM,
        schema: EXTRACT_SCHEMA as unknown as Record<string, unknown>,
        effort: "medium",
        maxTokens: 24000,
      }),
  );

  const companies: Company[] = [];
  let droppedUncited = 0;

  for (const raw of data.companies.slice(0, opts.maxCompanies ?? 12)) {
    const evidence = resolveEvidence(raw.sourceIndices, pool);
    // The guarantee, enforced here rather than hoped for: no citation, no row.
    if (!evidence.length) {
      droppedUncited++;
      continue;
    }
    if (db.companies.some((c) => c.domain === raw.domain)) continue;

    const companyId = slugId("company", raw.domain || raw.name);

    const signals: Signal[] = raw.signals
      .map((s) => {
        const sigEvidence = resolveEvidence(s.sourceIndices, pool);
        if (!sigEvidence.length) return null;
        return {
          id: mkId("signal"),
          companyId,
          category: s.category,
          headline: s.headline,
          detail: s.detail,
          observedAt: now(),
          intentWeight: Math.max(0, Math.min(30, s.intentWeight)),
          evidence: sigEvidence,
        } satisfies Signal;
      })
      .filter((s): s is Signal => Boolean(s));

    const penalties = raw.disqualified
      ? [{ reason: raw.disqualificationReason || "ICP negative signal matched", points: 40 }]
      : [];

    const fit = scoreFit(raw, signals, icp, penalties);

    const company: Company = {
      id: companyId,
      name: raw.name,
      domain: raw.domain,
      description: raw.description,
      industry: raw.industry,
      naics: raw.naics,
      headcount: raw.headcountEstimate || undefined,
      hqLocation: raw.hqLocation || undefined,
      techStack: raw.techStack,
      evidence,
      fit,
      discoveredAt: now(),
      disqualified: raw.disqualified,
      disqualificationReason: raw.disqualified ? raw.disqualificationReason : undefined,
    };

    addCompany(company);
    for (const s of signals) addSignal(s);
    companies.push(company);
  }

  emit(
    runId,
    "Discovery",
    "validation",
    `${companies.length} accounts kept, ${droppedUncited} dropped for having no citation`,
    {
      detail: `${companies.filter((c) => c.fit.tier === "A").length} Tier A · ${companies.filter((c) => c.disqualified).length} disqualified by negative signals · $${usage.costUsd.toFixed(4)}`,
    },
  );

  return {
    companies,
    queriesRun: queries,
    resultsSeen: pool.length,
    droppedUncited,
    mode: liveCount ? "live" : "unavailable",
  };
}

// ---------------------------------------------------------------------------
// Role-matched buyer discovery.
//
// Same index-based citation discipline. A person with no resolvable source is
// dropped: a named individual attributed to a role they may not hold is the
// single most damaging kind of error this system could make, because the next
// step drafts a message addressed to them.
// ---------------------------------------------------------------------------

const BUYER_SCHEMA = {
  type: "object",
  properties: {
    people: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fullName: { type: "string" },
          title: { type: "string", description: "Verbatim as stated in the source." },
          seniority: {
            type: "string",
            enum: ["IC", "Manager", "Director", "VP", "C-Suite", "Founder"],
          },
          department: { type: "string" },
          matchedPersona: { type: "string", description: "Which ICP persona title this matches." },
          personaMatchScore: { type: "integer", description: "0-100" },
          previousEmployers: { type: "array", items: { type: "string" } },
          education: { type: "array", items: { type: "string" } },
          sourceIndices: { type: "array", items: { type: "integer" } },
        },
        required: [
          "fullName",
          "title",
          "seniority",
          "department",
          "matchedPersona",
          "personaMatchScore",
          "previousEmployers",
          "education",
          "sourceIndices",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["people"],
  additionalProperties: false,
} as const;

interface RawPerson {
  fullName: string;
  title: string;
  seniority: Person["seniority"];
  department: string;
  matchedPersona: string;
  personaMatchScore: number;
  previousEmployers: string[];
  education: string[];
  sourceIndices: number[];
}

export async function discoverBuyers(
  icp: IcpDefinition,
  runId: string,
  opts: { companyIds?: string[]; perCompany?: number } = {},
): Promise<Person[]> {
  const targets = (
    opts.companyIds
      ? db.companies.filter((c) => opts.companyIds!.includes(c.id))
      : db.companies.filter((c) => !c.disqualified)
  )
    .slice()
    .sort((a, b) => b.fit.total - a.fit.total)
    .slice(0, 6);

  if (!targets.length) {
    emit(runId, "Buyers", "error", "No qualified accounts to search for buyers");
    return [];
  }

  const personaTitles = icp.personas.value.map((p) => p.title);
  emit(runId, "Buyers", "reasoning", `Searching ${targets.length} accounts for role-matched buyers`, {
    detail: `Looking for: ${personaTitles.join(", ")}`,
  });

  const found: Person[] = [];

  // Per-account searches run concurrently; each account is independent.
  const perAccount = await Promise.all(
    targets.map(async (company) => {
      const queries = [
        `"${company.name}" ${personaTitles[0]} OR ${personaTitles[1] ?? "founder"} linkedin`,
        `"${company.name}" leadership team ${personaTitles[0] ?? "sales"}`,
      ];
      const results = await searchMany(queries, { maxResults: 5 });
      const pool: Evidence[] = results.flatMap((r) => r.evidence);
      if (!pool.length) return { company, people: [] as RawPerson[], pool };

      const numbered = results
        .flatMap((r) => r.hits)
        .map((h, i) => `[${i}] ${h.title}\n    ${h.url}\n    ${h.content.slice(0, 350)}`)
        .join("\n\n");

      try {
        const { data } = await structured<{ people: RawPerson[] }>(
          `Account: ${company.name} (${company.domain}) — ${company.description}

ICP buyer personas we want to reach:
${icp.personas.value.map((p) => `- ${p.title} (${p.seniority}, ${p.department}) — owns: ${p.jobToBeDone}`).join("\n")}

Numbered search results:

${numbered}

Extract only named individuals these results actually place at ${company.name} in a role matching one of the personas.`,
          {
            system: `You extract named buyers from search results.

- Only a person the sources actually name AND place at this company. If the
  results name nobody at this company, return an empty array. An empty answer
  is correct; an invented person is a serious error, because the next step
  drafts a message addressed to them.
- The title must be verbatim from the source. Do not upgrade "Sales Manager"
  to "VP Sales" to improve the persona match.
- previousEmployers and education only where the source states them. These
  feed warm-introduction pathing, so a guess corrupts the graph.
- sourceIndices must point at results that genuinely mention that person.`,
            schema: BUYER_SCHEMA as unknown as Record<string, unknown>,
            effort: "low",
            maxTokens: 8000,
          },
        );
        return { company, people: data.people, pool };
      } catch {
        return { company, people: [] as RawPerson[], pool };
      }
    }),
  );

  let droppedUncited = 0;
  for (const { company, people, pool } of perAccount) {
    for (const raw of people.slice(0, opts.perCompany ?? 2)) {
      const evidence = resolveEvidence(raw.sourceIndices, pool);
      if (!evidence.length) {
        droppedUncited++;
        continue;
      }
      const personId = slugId("person", `${company.domain}-${raw.fullName}`);
      if (db.people.some((p) => p.id === personId)) continue;

      const person: Person = {
        id: personId,
        companyId: company.id,
        fullName: raw.fullName,
        title: raw.title,
        seniority: raw.seniority,
        department: raw.department,
        matchedPersona: raw.matchedPersona,
        personaMatchScore: Math.max(0, Math.min(100, raw.personaMatchScore)),
        evidence,
        enrichment: { emailConfidence: 0 },
        previousEmployers: raw.previousEmployers,
        education: raw.education,
      };
      addPerson(person);
      found.push(person);
    }
  }

  emit(
    runId,
    "Buyers",
    "validation",
    `${found.length} role-matched buyers found, ${droppedUncited} dropped for having no citation`,
    {
      detail: found.map((p) => `${p.fullName} (${p.title})`).join("; ") || "none",
    },
  );

  return found;
}

/** Seeds our own team into the graph so warm-intro paths have a starting point. */
export function seedInternalTeam(team: { id: string; fullName: string; previousEmployers: string[]; education: string[] }[]) {
  for (const member of team) {
    graph.upsertNode({
      id: member.id,
      label: "Person",
      name: member.fullName,
      props: { isInternal: true, title: "Internal" },
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
}
