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
import { checkNaics, naicsConfidenceDelta, type NaicsCheck } from "./naics";
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
  influences the purchase, with what that person is measured on.
- Be selective. Respect the item limits you are given — a profile with ten
  mediocre disqualifiers is worse than one with five sharp ones, and the
  operator has to read every row you produce.
- Rationales are one sentence. Not two.`;

type RawIcp = Record<keyof typeof ICP_SCHEMA.properties, Scored<unknown>>;

/* ---------------------------------------------------------------------------
   Inference is split into three concurrent calls rather than one.

   Why: a single call generating all eight scored fields was the slowest step
   in the product by a wide margin — one long serial generation while the
   reasoning panel sat frozen. The three groups are genuinely independent
   (firmographics do not depend on persona reasoning), so running them
   concurrently cuts wall-clock to roughly the slowest group instead of the sum
   of all three.

   The secondary benefit matters for a watched demo: three calls finishing at
   different moments gives the trace a pulse, where one long call gives it
   nothing to show.
   --------------------------------------------------------------------------- */

const SLICES = {
  firmographics: ["industries", "headcountRange", "revenueBand", "geographies"],
  buyers: ["personas", "triggerEvents"],
  filters: ["negativeSignals", "techStackAffinity"],
} as const;

type SliceName = keyof typeof SLICES;

const SLICE_BRIEF: Record<SliceName, string> = {
  firmographics:
    "Determine WHICH COMPANIES to target: verticals with real NAICS codes, headcount band, revenue band, and permitted geographies. At most 4 verticals and 4 geographies — pick the ones that matter, do not enumerate.",
  buyers:
    "Determine WHO INSIDE THEM to reach and WHEN: buyer personas with what each is measured on, and the trigger events that indicate active buying intent. At most 4 personas and 5 trigger events, ranked by how strongly each predicts a near-term purchase.",
  filters:
    "Determine WHAT TO EXCLUDE and what technical environment indicates fit: hard disqualifiers observable from public sources, and tech stack affinity. At most 5 disqualifiers and 8 stack entries.",
};

function sliceSchema(fields: readonly string[]) {
  const all = ICP_SCHEMA.properties as Record<string, unknown>;
  const properties: Record<string, unknown> = {};
  for (const f of fields) properties[f] = all[f];
  return {
    type: "object",
    properties,
    required: [...fields],
    additionalProperties: false,
  } as unknown as Record<string, unknown>;
}

export async function inferIcp(intake: ProductIntake, runId: string): Promise<IcpDefinition> {
  const context = `Company: ${intake.companyName}
Product: ${intake.productName}

Description (the founder's own words):
${intake.description}

Capabilities:
${intake.features.map((f) => `- ${f}`).join("\n")}

${intake.referenceCustomers.length ? `Existing customers / reference wins:\n${intake.referenceCustomers.map((c) => `- ${c}`).join("\n")}` : "No reference customers yet — this is a first ICP, so weight the capability list and lower confidence on firmographics accordingly."}

Pricing model: ${intake.pricingModel ?? "not stated"}
Average contract value: ${intake.averageContractValue ?? "not stated"}
${intake.technicalConstraints?.length ? `Constraints:\n${intake.technicalConstraints.map((c) => `- ${c}`).join("\n")}` : ""}`;

  emit(runId, "ICP inference", "reasoning", "Inferring in three concurrent passes", {
    detail: `${MODELS.REASONING}, medium effort, fast mode. Groups: firmographics · buyers · filters.`,
  });

  const results = await Promise.all(
    (Object.keys(SLICES) as SliceName[]).map((slice) =>
      traced(
        runId,
        "ICP inference",
        "reasoning",
        `${slice}: ${SLICES[slice].join(", ")}`,
        () =>
          structured<Record<string, Scored<unknown>>>(
            `${SLICE_BRIEF[slice]}\n\n${context}`,
            {
              system: ICP_SYSTEM,
              schema: sliceSchema(SLICES[slice]),
              // Medium rather than high: Opus 5 is unusually strong at medium,
              // and at high this step was the product's worst latency. Measured
              // rather than assumed — see scripts/bench-icp.sh.
              effort: "medium",
              fast: true,
              maxTokens: 10000,
            },
          ),
        { detail: SLICE_BRIEF[slice] },
      ),
    ),
  );

  const data = Object.assign({}, ...results.map((r) => r.data)) as RawIcp;

  // Fail loudly and specifically. A missing slice field used to surface as
  // "cannot read properties of undefined", which says nothing about which
  // group came back short.
  const expected = Object.values(SLICES).flat() as string[];
  const missing = expected.filter((f) => !(data as Record<string, unknown>)[f]);
  if (missing.length) {
    emit(runId, "ICP inference", "error", `Slice merge incomplete: ${missing.join(", ")}`, {
      detail: `Returned keys: ${Object.keys(data).join(", ") || "(none)"}`,
    });
    throw new Error(
      `ICP inference returned no value for: ${missing.join(", ")}. Returned keys: ${Object.keys(data).join(", ")}`,
    );
  }

  // An ICP is inferred from the founder's own words, not from public sources,
  // so it is honest for it to carry no citations. Discovery is where citations
  // become mandatory.
  const withEvidence = <T>(sc: Scored<T>): Scored<T> => ({ ...sc, evidence: sc.evidence ?? [] });

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
      detail: `${icp.industries.value.length} verticals, ${icp.personas.value.length} personas, ${icp.triggerEvents.value.length} triggers, ${icp.negativeSignals.value.length} disqualifiers.`,
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
        effort: "medium",
        fast: true,
        maxTokens: 8000,
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

// ============================================================================
// Raising confidence — honestly.
//
// A low reading (the dogfood intake lands near 0.48) has one dominant cause:
// the intake contains no reference customers, so every firmographic field is
// extrapolation from a capability list. The model says so in its own rationale.
//
// There is a tempting wrong fix and three real ones.
//
// WRONG: weight the mean toward the strong fields, drop the weak ones from the
// average, or instruct the model to sound more certain. All three move the
// number without moving the knowledge, which is just miscalibration — and a
// confidence score you can inflate is worse than no score, because people act
// on it.
//
// REAL:
//   1. Clarification loop — ask about precisely the fields that scored lowest,
//      then re-infer. More input, more warranted confidence.
//   2. Evidence grounding — search for the company's actual market and
//      customers and pass cited sources into the inference, so firmographics
//      rest on retrieved fact rather than inference alone.
//   3. Deterministic verification — check NAICS codes against a real list, so
//      one field stops being a guess.
// ============================================================================


const CLARIFY_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: {
            type: "string",
            description: "Which ICP field this question would strengthen.",
          },
          question: {
            type: "string",
            description: "One specific, answerable question. No compound questions.",
          },
          why: {
            type: "string",
            description: "What is currently being guessed, in one sentence the founder will recognise.",
          },
          exampleAnswer: {
            type: "string",
            description: "A short example answer, so the founder knows the shape expected.",
          },
          confidenceGainIfAnswered: {
            type: "number",
            description: "Estimated confidence gain for that field, 0.00-0.50. Be conservative.",
          },
        },
        required: ["field", "question", "why", "exampleAnswer", "confidenceGainIfAnswered"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

export interface ClarifyingQuestion {
  field: string;
  question: string;
  why: string;
  exampleAnswer: string;
  confidenceGainIfAnswered: number;
}

/**
 * Asks about the weakest fields specifically. The ordering is not editorial —
 * it is driven by the actual per-field confidences, so the questions change as
 * the profile changes.
 */
export async function clarifyIcp(
  icp: IcpDefinition,
  intake: ProductIntake,
  runId: string,
): Promise<ClarifyingQuestion[]> {
  const fields: { name: string; confidence: number; rationale: string }[] = [
    { name: "industries", confidence: icp.industries.confidence, rationale: icp.industries.rationale },
    { name: "headcountRange", confidence: icp.headcountRange.confidence, rationale: icp.headcountRange.rationale },
    { name: "revenueBand", confidence: icp.revenueBand.confidence, rationale: icp.revenueBand.rationale },
    { name: "geographies", confidence: icp.geographies.confidence, rationale: icp.geographies.rationale },
    { name: "personas", confidence: icp.personas.confidence, rationale: icp.personas.rationale },
    { name: "triggerEvents", confidence: icp.triggerEvents.confidence, rationale: icp.triggerEvents.rationale },
    { name: "negativeSignals", confidence: icp.negativeSignals.confidence, rationale: icp.negativeSignals.rationale },
    { name: "techStackAffinity", confidence: icp.techStackAffinity.confidence, rationale: icp.techStackAffinity.rationale },
  ].sort((a, b) => a.confidence - b.confidence);

  const weakest = fields.slice(0, 5);

  const { data } = await traced(
    runId,
    "ICP clarification",
    "reasoning",
    `Identifying what would most raise confidence (currently ${(icp.overallConfidence * 100).toFixed(0)}%)`,
    () =>
      structured<{ questions: ClarifyingQuestion[] }>(
        `This ICP was inferred for ${intake.productName}. Overall confidence is ${icp.overallConfidence}.

The weakest fields, with the engine's own stated reasons:
${weakest.map((f) => `- ${f.name} (${f.confidence}): ${f.rationale}`).join("\n")}

What the founder originally told us:
${intake.description}
Reference customers given: ${intake.referenceCustomers.length ? intake.referenceCustomers.join("; ") : "NONE"}
Pricing: ${intake.pricingModel ?? "not stated"} · ACV: ${intake.averageContractValue ?? "not stated"}

Ask at most 4 questions whose answers would most raise confidence in those
fields. Rules:
- One fact per question. No compound questions.
- Ask only what the founder plausibly knows off the top of their head.
- Prefer concrete specifics over strategy ("which three companies have paid
  you the most?" beats "who is your ideal customer?").
- If reference customers are missing, at least one question must target that —
  it is almost always the single largest source of uncertainty.
- Be conservative about confidenceGainIfAnswered. Over-promising here is the
  same error as over-stating confidence in the first place.`,
        {
          system:
            "You improve an inferred customer profile by asking the founder the few questions that would most reduce uncertainty. You are not interviewing them; you are closing specific, named gaps.",
          schema: CLARIFY_SCHEMA as unknown as Record<string, unknown>,
          effort: "medium",
          maxTokens: 6000,
        },
      ),
  );

  emit(runId, "ICP clarification", "gate", `${data.questions.length} questions would raise confidence`, {
    detail: data.questions
      .map((q) => `${q.field} (+${Math.round(q.confidenceGainIfAnswered * 100)}pts): ${q.question}`)
      .join(" · "),
  });

  return data.questions;
}

export interface IcpDelta {
  field: string;
  before: number;
  after: number;
}

/**
 * Re-infers with the founder's answers folded into the intake, then reports a
 * per-field confidence delta. The delta is the honest part: it shows which
 * answers actually bought certainty and which did not.
 */
export async function reinferIcp(
  previous: IcpDefinition,
  intake: ProductIntake,
  answers: { question: string; answer: string }[],
  runId: string,
): Promise<{ icp: IcpDefinition; deltas: IcpDelta[]; naics: NaicsCheck[] }> {
  const answered = answers.filter((a) => a.answer.trim().length > 0);

  const enrichedIntake: ProductIntake = {
    ...intake,
    description: `${intake.description}

ADDITIONAL FACTS THE FOUNDER CONFIRMED (treat these as given, not inferred):
${answered.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")}`,
    // Any answer naming customers becomes a reference customer, which is the
    // field that was doing the most damage.
    referenceCustomers: [
      ...intake.referenceCustomers,
      ...answered
        .filter((a) => /customer|client|paid|bought|logo|account/i.test(a.question))
        .map((a) => a.answer),
    ],
  };

  emit(runId, "ICP re-inference", "reasoning", `Re-inferring with ${answered.length} confirmed facts`, {
    detail: `Previous overall confidence ${(previous.overallConfidence * 100).toFixed(0)}%. Facts now treated as given rather than extrapolated.`,
  });

  const next = await inferIcp(enrichedIntake, runId);

  // Deterministic verification of the codes, applied as a small adjustment.
  const naics = next.industries.value.map((i) => checkNaics(i.naics));
  const { delta, rationale } = naicsConfidenceDelta(naics);
  if (delta !== 0) {
    next.industries.confidence = Math.max(0, Math.min(1, next.industries.confidence + delta));
    next.industries.rationale = `${next.industries.rationale} ${rationale}`;
    emit(runId, "ICP re-inference", "validation", `NAICS verification: ${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}pts`, {
      detail: naics.map((c) => `${c.code} ${c.verdict}${c.officialTitle ? ` (${c.officialTitle})` : ""}`).join(" · "),
    });
  }

  const fieldsOf = (icp: IcpDefinition): Record<string, number> => ({
    industries: icp.industries.confidence,
    headcountRange: icp.headcountRange.confidence,
    revenueBand: icp.revenueBand.confidence,
    geographies: icp.geographies.confidence,
    personas: icp.personas.confidence,
    triggerEvents: icp.triggerEvents.confidence,
    negativeSignals: icp.negativeSignals.confidence,
    techStackAffinity: icp.techStackAffinity.confidence,
  });

  const before = fieldsOf(previous);
  const after = fieldsOf(next);
  const deltas = Object.keys(after).map((field) => ({
    field,
    before: before[field] ?? 0,
    after: after[field] ?? 0,
  }));

  // Recompute the headline after the NAICS adjustment.
  const values = Object.values(after);
  next.overallConfidence = Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));

  emit(
    runId,
    "ICP re-inference",
    "validation",
    `Confidence ${(previous.overallConfidence * 100).toFixed(0)}% → ${(next.overallConfidence * 100).toFixed(0)}%`,
    {
      detail: deltas
        .filter((d) => Math.abs(d.after - d.before) >= 0.03)
        .map((d) => `${d.field} ${(d.before * 100).toFixed(0)}→${(d.after * 100).toFixed(0)}`)
        .join(" · ") || "No field moved materially — the answers did not reduce uncertainty.",
    },
  );

  return { icp: next, deltas, naics };
}
