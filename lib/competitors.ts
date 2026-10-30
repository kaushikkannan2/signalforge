// ============================================================================
// Module 2b — Competitive landscape mapping.
//
// Same citation discipline as account discovery: the model picks indices into
// a pool of genuinely fetched results, and a competitor with no resolvable
// source is dropped. Pricing in particular is a claim people act on, so an
// uncited price is worse than no price.
// ============================================================================

import { structured } from "./providers/anthropic";
import { searchMany } from "./providers/tavily";
import { emit, traced } from "./thinking";
import { addCompetitor, db } from "./db";
import { graph } from "./graph";
import { slugId } from "./ids";
import type { Competitor, Evidence, IcpDefinition, ProductIntake } from "./types";

const SCHEMA = {
  type: "object",
  properties: {
    competitors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          domain: { type: "string" },
          category: { type: "string", enum: ["direct", "indirect", "alternative"] },
          positioning: { type: "string", description: "How they describe themselves." },
          valueProposition: { type: "string" },
          pricingTiers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                price: { type: "string", description: "Verbatim as published, e.g. '$149/mo'. Use 'Not published' if absent." },
                notes: { type: "string" },
              },
              required: ["name", "price", "notes"],
              additionalProperties: false,
            },
          },
          structuralAdvantages: { type: "array", items: { type: "string" } },
          ourDifferentiators: {
            type: "array",
            items: { type: "string" },
            description: "Honest, specific differences for OUR product versus this competitor. No marketing copy.",
          },
          sourceIndices: { type: "array", items: { type: "integer" } },
        },
        required: [
          "name",
          "domain",
          "category",
          "positioning",
          "valueProposition",
          "pricingTiers",
          "structuralAdvantages",
          "ourDifferentiators",
          "sourceIndices",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["competitors"],
  additionalProperties: false,
} as const;

const SYSTEM = `You map a competitive landscape for a B2B product.

- "direct" = solves the same problem for the same buyer.
  "indirect" = solves part of it, or solves it for a different buyer.
  "alternative" = what the buyer does instead of buying any software
  (an agency, an in-house team, a spreadsheet). Always include at least one
  alternative — the status quo is usually the real competitor.
- Only state a price that appears in the sources. If pricing is not public,
  write "Not published". A fabricated price is the most damaging possible error
  here, because a rep will repeat it to a prospect.
- structuralAdvantages must be things that are genuinely hard for us to copy
  (scale, distribution, data moat), not feature gaps.
- ourDifferentiators must be defensible and specific. Do not write slogans,
  and do not claim a differentiator the product description does not support.
- sourceIndices must point at results that actually discuss that competitor.`;

interface RawCompetitor {
  name: string;
  domain: string;
  category: Competitor["category"];
  positioning: string;
  valueProposition: string;
  pricingTiers: { name: string; price: string; notes: string }[];
  structuralAdvantages: string[];
  ourDifferentiators: string[];
  sourceIndices: number[];
}

export async function mapCompetitors(
  intake: ProductIntake,
  icp: IcpDefinition,
  runId: string,
): Promise<Competitor[]> {
  const category = icp.industries.value[0]?.name ?? "B2B software";
  const queries = [
    `${intake.productName} alternatives competitors 2026`,
    `best ${category} tools comparison pricing 2026`,
    `${category} software pricing per seat 2026`,
    `outsourced vs in-house ${category} cost comparison`,
  ];

  const results = await traced(runId, "Competitors", "tool_call", "Searching competitive landscape", () =>
    searchMany(queries, { maxResults: 5 }),
  );

  const pool: Evidence[] = results.flatMap((r) => r.evidence);
  if (!pool.length) {
    emit(runId, "Competitors", "error", "No sources retrieved — competitor map skipped", {
      detail: "Rather than assert an uncited landscape, the engine returns nothing.",
    });
    return [];
  }

  const numbered = results
    .flatMap((r) => r.hits)
    .map((h, i) => `[${i}] ${h.title}\n    ${h.url}\n    ${h.content.slice(0, 400)}`)
    .join("\n\n");

  const { data, usage } = await traced(
    runId,
    "Competitors",
    "reasoning",
    "Mapping direct, indirect and alternative competitors",
    () =>
      structured<{ competitors: RawCompetitor[] }>(
        `Our product: ${intake.productName} by ${intake.companyName}
${intake.description}

Capabilities:
${intake.features.map((f) => `- ${f}`).join("\n")}

We sell to: ${icp.personas.value.map((p) => p.title).join(", ")} at ${category} companies.

Numbered search results:

${numbered}

Map the competitive landscape.`,
        {
          system: SYSTEM,
          schema: SCHEMA as unknown as Record<string, unknown>,
          effort: "medium",
          maxTokens: 20000,
        },
      ),
  );

  const competitors: Competitor[] = [];
  let dropped = 0;

  for (const raw of data.competitors) {
    const seen = new Set<string>();
    const evidence = raw.sourceIndices
      .map((i) => pool[i])
      .filter((e): e is Evidence => Boolean(e))
      .filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true)));
    if (!evidence.length) {
      dropped++;
      continue;
    }
    const id = slugId("comp", raw.domain || raw.name);
    if (db.competitors.some((c) => c.id === id)) continue;

    const competitor: Competitor = {
      id,
      name: raw.name,
      domain: raw.domain,
      category: raw.category,
      positioning: raw.positioning,
      valueProposition: raw.valueProposition,
      pricingTiers: raw.pricingTiers,
      structuralAdvantages: raw.structuralAdvantages,
      ourDifferentiators: raw.ourDifferentiators,
      evidence,
    };
    addCompetitor(competitor);
    competitors.push(competitor);
  }

  // Our own product becomes a node so `competes_with` edges are traversable
  // and the displacement query has something to anchor against.
  const productNode = slugId("product", intake.productName);
  graph.upsertNode({
    id: productNode,
    label: "Product",
    name: intake.productName,
    props: { ours: true, company: intake.companyName },
  });
  for (const c of competitors) {
    graph.addEdge("competes_with", productNode, c.id, { category: c.category });
  }

  emit(
    runId,
    "Competitors",
    "validation",
    `${competitors.length} competitors mapped, ${dropped} dropped for having no citation`,
    {
      detail: `${competitors.filter((c) => c.category === "direct").length} direct · ${competitors.filter((c) => c.category === "alternative").length} alternative · $${usage.costUsd.toFixed(4)}`,
    },
  );

  return competitors;
}
