// ============================================================================
// Module 1 — Product Intake & ICP Engine.
//
// Plain-language product description in, structured ICP out, with a confidence
// score on every inferred field. Confidence is produced by the same call that
// produces the value, and the UI renders both together, so a founder can see
// which parts of the profile are grounded in what they said and which parts
// are the engine extrapolating.
// ============================================================================

import { structured } from "./providers/anthropic";
import { search } from "./providers/tavily";
import { emit, traced } from "./thinking";
import { db } from "./db";
import { id as mkId, now } from "./ids";
import { MODELS } from "./models";
import type { IcpDefinition, IcpExpansion, ProductIntake, Scored } from "./types";

// --- schema ----------------------------------------------------------------

const scored = (valueSchema: Record<string, unknown>) => ({
  type: "object",
  properties: {
    value: valueSchema,
    confidence: {
      type: "number",
      description: "0.00-1.00. Be honest: low when the intake did not say.",
    },
    rationale: {
      type: "string",
      description: "One sentence, plain language, shown to the founder on hover.",
    },
  },
  required: ["value", "confidence", "rationale"],
  additionalProperties: false,
});

const ICP_SCHEMA = {
  type: "object",
  properties: {
    industries: scored({
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          naics: { type: "string", description: "6-digit NAICS code" },
        },
        required: ["name", "naics"],
        additionalProperties: false,
      },
    }),
    headcountRange: scored({
      type: "object",
      properties: {
        min: { type: "integer" },
        max: { type: "integer" },
        tierLabel: { type: "string", description: "e.g. 'Mid-market (50-250)'" },
      },
      required: ["min", "max", "tierLabel"],
      additionalProperties: false,
    }),
    revenueBand: scored({
      type: "object",
      properties: {
        min: { type: "integer", description: "Annual revenue floor in USD" },
        max: { type: "integer" },
        currency: { type: "string" },
      },
      required: ["min", "max", "currency"],
      additionalProperties: false,
    }),
    geographies: scored({ type: "array", items: { type: "string" } }),
    personas: scored({
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          seniority: {
            type: "string",
            enum: ["IC", "Manager", "Director", "VP", "C-Suite", "Founder"],
          },
          department: { type: "string" },
          jobToBeDone: {
            type: "string",
            description: "What this person is measured on. Drives message framing.",
          },
          painPoints: { type: "array", items: { type: "string" } },
        },
        required: ["title", "seniority", "department", "jobToBeDone", "painPoints"],
        additionalProperties: false,
      },
    }),
    triggerEvents: scored({
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
          label: { type: "string" },
          buyingImplication: {
            type: "string",
            description: "Why this event means they are in-market right now.",
          },
          intentWeight: { type: "integer", description: "0-30 contribution to intent score" },
        },
        required: ["category", "label", "buyingImplication", "intentWeight"],
        additionalProperties: false,
      },
    }),
    negativeSignals: scored({
      type: "array",
      items: { type: "string", description: "A hard disqualifier, phrased as an observable fact" },
    }),
    techStackAffinity: scored({ type: "array", items: { type: "string" } }),
  },
  required: [
    "industries",
    "headcountRange",
    "revenueBand",
    "geographies",
    "personas",
    "triggerEvents",
    "negativeSignals",
    "techStackAffinity",
  ],
  additionalProperties: false,
} as const;

const ICP_SYSTEM = `You infer Ideal Customer Profiles for B2B companies.

Rules you are held to:
- Confidence is a real estimate, not a formality. If the founder's description
  does not support a field, score it low and say so in the rationale. A
  confidently wrong ICP costs more than an honestly uncertain one.
- NAICS codes must be real 6-digit codes. If you are unsure of the exact code,
  pick the closest real one and lower the confidence.
- Negative signals must be observable from public sources — "hiring freeze
  announced", "headquartered outside target region" — not unobservable
  internal states like "low budget" or "not interested".
- Trigger events must come with the reason they imply active buying intent.
  intentWeight should reflect how strongly the event predicts a near-term
  purchase, not how common the event is.
- Personas: name the functional title that owns the pain and signs or
  influences the purchase, with what that person is measured on.`;

type RawIcp = Record<keyof typeof ICP_SCHEMA.properties, Scored<unknown>>;

export async function inferIcp(intake: ProductIntake, runId: string): Promise<IcpDefinition> {
  const prompt = `Infer the ICP for this product.

Company: ${intake.companyName}
Product: ${intake.productName}

Description (the founder's own words):
${intake.description}

Capabilities:
${intake.features.map((f) => `- ${f}`).join("\n")}

${intake.referenceCustomers.length ? `Existing customers / reference wins:\n${intake.referenceCustomers.map((c) => `- ${c}`).join("\n")}` : "No reference customers yet — this is a first ICP, so weight the capability list and lower confidence on firmographics accordingly."}

Pricing model: ${intake.pricingModel ?? "not stated"}
Average contract value: ${intake.averageContractValue ?? "not stated"}
${intake.technicalConstraints?.length ? `Constraints:\n${intake.technicalConstraints.map((c) => `- ${c}`).join("\n")}` : ""}`;

  const { data, usage } = await traced(
    runId,
    "ICP inference",
    "reasoning",
    `Inferring ICP from intake with ${MODELS.REASONING}`,
    () =>
      structured<RawIcp>(prompt, {
        system: ICP_SYSTEM,
        schema: ICP_SCHEMA as unknown as Record<string, unknown>,
        effort: "high",
      }),
    { detail: `${intake.features.length} capabilities, ${intake.description.length} chars of description` },
  );

  // Attach empty evidence arrays: an ICP is inferred from the founder's own
  // words, not from public sources, so it is honest for it to carry no
  // citations. Discovery is where citations become mandatory.
  const withEvidence = <T>(s: Scored<T>): Scored<T> => ({ ...s, evidence: s.evidence ?? [] });

  const fields = Object.values(data) as Scored<unknown>[];
  const overall = fields.reduce((sum, f) => sum + (f?.confidence ?? 0), 0) / fields.length;

  const icp: IcpDefinition = {
    id: mkId("icp"),
    intakeId: intake.id,
    industries: withEvidence(data.industries as Scored<{ name: string; naics: string }[]>),
    headcountRange: withEvidence(
      data.headcountRange as Scored<{ min: number; max: number; tierLabel: string }>,
    ),
    revenueBand: withEvidence(
      data.revenueBand as Scored<{ min: number; max: number; currency: string }>,
    ),
    geographies: withEvidence(data.geographies as Scored<string[]>),
    personas: withEvidence(data.personas as IcpDefinition["personas"]),
    triggerEvents: withEvidence(data.triggerEvents as IcpDefinition["triggerEvents"]),
    negativeSignals: withEvidence(data.negativeSignals as Scored<string[]>),
    techStackAffinity: withEvidence(data.techStackAffinity as Scored<string[]>),
    overallConfidence: Number(overall.toFixed(2)),
    status: "draft",
    createdAt: now(),
  };

  emit(
    runId,
    "ICP inference",
    "validation",
    `ICP drafted — overall confidence ${(overall * 100).toFixed(0)}%`,
    {
      detail: `${icp.industries.value.length} verticals, ${icp.personas.value.length} personas, ${icp.triggerEvents.value.length} triggers, ${icp.negativeSignals.value.length} disqualifiers. Cost $${usage.costUsd.toFixed(4)}.`,
    },
  );

  db.icps.push(icp);
  return icp;
}

// --- Intelligent ICP expansion ---------------------------------------------

const EXPANSION_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          segmentName: { type: "string" },
          naics: { type: "string" },
          thesis: { type: "string", description: "Why this segment has the same pain." },
          nonObviousBecause: {
            type: "string",
            description: "Why standard targeting filters this segment out.",
          },
          estimatedAccountCount: { type: "integer" },
          confidence: { type: "number" },
          searchQuery: {
            type: "string",
            description: "A web search that would surface evidence for this thesis.",
          },
        },
        required: [
          "segmentName",
          "naics",
          "thesis",
          "nonObviousBecause",
          "estimatedAccountCount",
          "confidence",
          "searchQuery",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["segments"],
  additionalProperties: false,
} as const;

interface RawExpansion {
  segments: {
    segmentName: string;
    naics: string;
    thesis: string;
    nonObviousBecause: string;
    estimatedAccountCount: number;
    confidence: number;
    searchQuery: string;
  }[];
}

/**
 * Adjacent segments the founder can accept, adjust or dismiss. Each one is
 * sent back out to live search so the thesis arrives with evidence attached
 * rather than as an assertion — "non-obvious" is only interesting if it is
 * also checkable.
 */
export async function expandIcp(
  icp: IcpDefinition,
  intake: ProductIntake,
  runId: string,
): Promise<IcpExpansion[]> {
  const prompt = `This is the approved core ICP for ${intake.productName}:

Verticals: ${icp.industries.value.map((i) => `${i.name} (${i.naics})`).join(", ")}
Size: ${icp.headcountRange.value.tierLabel}
Personas: ${icp.personas.value.map((p) => p.title).join(", ")}
Triggers: ${icp.triggerEvents.value.map((t) => t.label).join(", ")}

Product description: ${intake.description}

Propose 3 adjacent segments worth testing. Prioritise segments that standard
firmographic filtering would exclude — a different industry code with the same
underlying pain, a buyer who is not the obvious end user, a use case the
product enables that the founder did not describe. For each, say plainly why
conventional targeting misses it. Do not propose a segment that is merely a
broader version of the core ICP.`;

  const { data } = await traced(
    runId,
    "ICP expansion",
    "reasoning",
    "Searching for adjacent and non-obvious segments",
    () =>
      structured<RawExpansion>(prompt, {
        schema: EXPANSION_SCHEMA as unknown as Record<string, unknown>,
        effort: "high",
      }),
  );

  // Evidence for every thesis, fetched concurrently. Sequential search was
  // the single largest contributor to intake latency; the segments are
  // independent, so there is no reason to serialise them.
  const searched = await Promise.all(
    data.segments.map((seg) =>
      traced(
        runId,
        "ICP expansion",
        "tool_call",
        `Evidence search: ${seg.segmentName}`,
        () => search(seg.searchQuery, { maxResults: 3 }),
        { query: seg.searchQuery },
      ).catch(() => null),
    ),
  );

  const expansions: IcpExpansion[] = data.segments.map((seg, i) => ({
    id: mkId("exp"),
    icpId: icp.id,
    segmentName: seg.segmentName,
    naics: seg.naics,
    thesis: seg.thesis,
    nonObviousBecause: seg.nonObviousBecause,
    estimatedAccountCount: seg.estimatedAccountCount,
    confidence: seg.confidence,
    // An expansion with no retrieved source still appears, but the UI marks
    // it Uncited rather than quietly presenting it as verified.
    evidence: searched[i]?.evidence ?? [],
    decision: "pending" as const,
  }));

  db.expansions.push(...expansions);
  emit(runId, "ICP expansion", "validation", `${expansions.length} adjacent segments proposed`, {
    detail: expansions
      .map((e) => `${e.segmentName} (${e.evidence.length} sources)`)
      .join("; "),
  });
  return expansions;
}

export function decideExpansion(
  expansionId: string,
  decision: IcpExpansion["decision"],
  note?: string,
): IcpExpansion | undefined {
  const exp = db.expansions.find((e) => e.id === expansionId);
  if (!exp) return undefined;
  exp.decision = decision;
  if (note) exp.adjustmentNote = note;
  return exp;
}

export function approveIcp(icpId: string): IcpDefinition | undefined {
  const icp = db.icps.find((i) => i.id === icpId);
  if (!icp) return undefined;
  icp.status = "approved";
  return icp;
}
