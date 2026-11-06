// ============================================================================
// Grounding — what the founder's description actually supports.
//
// The only input to inference is the founder's plain-text description. A
// paragraph will not state most of a profile, so a required-field schema on its
// own pushes the model to fill every field with something plausible. This
// module separates what was said from what was guessed:
//
//   stated   — in the description, with an exact quote
//   derived  — a careful reader would reach it from a quoted passage
//   assumed  — plausible, but the description does not show it ("best guess")
//   unknown  — not inferable; left blank and shown as a gap
//
// The model proposes a basis. This module decides whether it holds: quotes are
// checked against the source text in code, unsupported claims are downgraded,
// and confidence is capped by the basis that survived.
//
// Motion-agnostic on purpose, and free of runtime imports, so it can move
// between the B2B and B2C branches and run under `node --test` directly.
// ============================================================================

import type { IcpDefinition, ProductIntake } from "./types";

export type Basis = "stated" | "derived" | "assumed" | "unknown";

export interface Grounding {
  basis: Basis;
  /** Passages confirmed to exist in the founder's text. */
  quotes: string[];
  /** Set when the model claimed more support than the text gave. */
  downgraded?: { from: Basis; reason: string };
}

/** The most confidence each basis can carry, whatever the model reported. */
export const CONFIDENCE_CAP: Record<Basis, number> = {
  stated: 1,
  derived: 0.8,
  assumed: 0.45,
  unknown: 0,
};

/**
 * A real quote proves the passage exists, not that the conclusion follows. A
 * derived field the model itself rates below this is a guess with a citation
 * attached, so it is treated as one.
 */
export const MIN_DERIVED_CONFIDENCE = 0.5;

/** Shorter than this and a "quote" matches nearly anything. "$12" still passes. */
const MIN_QUOTE_LENGTH = 3;

export const capConfidence = (confidence: number, basis: Basis): number =>
  Math.max(0, Math.min(confidence, CONFIDENCE_CAP[basis]));

/** Folds the differences that should not fail a quote: case, curly quotes, dashes, spacing. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const isWordChar = (ch: string | undefined) => Boolean(ch && /[\p{L}\p{N}]/u.test(ch));

/** True when the quote appears in the source on word boundaries, so "art" misses "start". */
export function quoteExists(quote: string, source: string): boolean {
  const needle = normalizeText(quote).replace(/^["'\s]+|["'\s]+$/g, "");
  if (needle.length < MIN_QUOTE_LENGTH) return false;
  const haystack = normalizeText(source);

  let at = haystack.indexOf(needle);
  while (at !== -1) {
    const before = haystack[at - 1];
    const after = haystack[at + needle.length];
    const startsClean = !isWordChar(needle[0]) || !isWordChar(before);
    const endsClean = !isWordChar(needle[needle.length - 1]) || !isWordChar(after);
    if (startsClean && endsClean) return true;
    at = haystack.indexOf(needle, at + 1);
  }
  return false;
}

/** Empty arrays, blank strings and all-zero objects carry no information. */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number") return value === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    const numbers = Object.values(value).filter((v) => typeof v === "number");
    return numbers.length > 0 ? numbers.every((n) => n === 0) : Object.values(value).every(isEmptyValue);
  }
  return false;
}

/** The same shape with nothing in it, so a gap cannot pass as an answer. */
export function blankValue<T>(value: T): T {
  if (Array.isArray(value)) return [] as unknown as T;
  if (typeof value === "number") return 0 as unknown as T;
  if (typeof value === "string") return "" as unknown as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, blankValue(v)]),
    ) as unknown as T;
  }
  return value;
}

export interface RawGroundedField<T> {
  value: T;
  confidence: number;
  rationale: string;
  basis: Basis;
  quotes: string[];
}

export interface GroundedField<T> {
  value: T;
  confidence: number;
  rationale: string;
  grounding: Grounding;
}

/** Turns the model's claim about a field into what the source text supports. */
export function applyGrounding<T>(raw: RawGroundedField<T>, source: string): GroundedField<T> {
  const claimed: Basis = raw.basis ?? "assumed";
  const verified = (raw.quotes ?? []).filter((q) => quoteExists(q, source));

  let basis = claimed;
  let reason: string | undefined;

  if (claimed !== "unknown" && isEmptyValue(raw.value)) {
    basis = "unknown";
    reason = "No value was produced for this field.";
  } else if ((claimed === "stated" || claimed === "derived") && verified.length === 0) {
    basis = "assumed";
    reason = "The passage it cited is not in the description.";
  } else if (claimed === "derived" && (raw.confidence ?? 0) < MIN_DERIVED_CONFIDENCE) {
    basis = "assumed";
    reason = "The description only weakly supports this.";
  }

  return {
    value: basis === "unknown" ? blankValue(raw.value) : raw.value,
    confidence: capConfidence(raw.confidence ?? 0, basis),
    rationale: raw.rationale,
    grounding: {
      basis,
      quotes: basis === "stated" || basis === "derived" ? verified : [],
      ...(reason ? { downgraded: { from: claimed, reason } } : {}),
    },
  };
}

/**
 * Fields with no grounding record (fixtures, older snapshots) predate this
 * check and are treated as usable, so they keep their existing behaviour.
 */
export const isActionable = (field: { grounding?: Grounding }): boolean =>
  !field.grounding || field.grounding.basis === "stated" || field.grounding.basis === "derived";

/**
 * Everything the founder actually said, and nothing the system wrote around it.
 * Confirmed facts contribute their answers only: a question is our wording.
 */
export function groundingSource(intake: ProductIntake): string {
  return [
    intake.companyName,
    intake.productName,
    intake.description,
    ...intake.features,
    ...intake.referenceCustomers,
    intake.pricingModel,
    intake.averageContractValue,
    ...(intake.technicalConstraints ?? []),
    ...(intake.confirmedFacts ?? []).map((f) => f.answer),
  ]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join("\n");
}

// --- coverage ---------------------------------------------------------------

export interface ChecklistItem {
  field: string;
  label: string;
}

/** What a complete B2B profile has to address. A B2C motion supplies its own list. */
export const B2B_CHECKLIST: ChecklistItem[] = [
  { field: "industries", label: "Target industries" },
  { field: "headcountRange", label: "Company size" },
  { field: "revenueBand", label: "Revenue band" },
  { field: "geographies", label: "Geographies" },
  { field: "personas", label: "Buyer personas" },
  { field: "triggerEvents", label: "Buying triggers" },
  { field: "negativeSignals", label: "Disqualifiers" },
  { field: "techStackAffinity", label: "Tech stack" },
];

export interface Coverage {
  supported: number;
  bestGuesses: number;
  gaps: number;
  total: number;
  items: (ChecklistItem & { basis: Basis })[];
}

export function coverageOf(
  fields: Record<string, { grounding?: Grounding } | undefined>,
  checklist: ChecklistItem[],
): Coverage {
  const items = checklist.map((item) => ({
    ...item,
    basis: fields[item.field]?.grounding?.basis ?? ("unknown" as Basis),
  }));
  const count = (...bases: Basis[]) => items.filter((i) => bases.includes(i.basis)).length;
  return {
    supported: count("stated", "derived"),
    bestGuesses: count("assumed"),
    gaps: count("unknown"),
    total: items.length,
    items,
  };
}

// --- decisions --------------------------------------------------------------

/**
 * The profile as searches, filters and scoring may use it. Best guesses and
 * gaps stay visible to the founder but are blanked here, so nothing is spent
 * or disqualified on the strength of something the description never said.
 */
export function actionableIcp(icp: IcpDefinition): IcpDefinition {
  const keep = <T extends { value: unknown; grounding?: Grounding }>(field: T): T =>
    isActionable(field) ? field : { ...field, value: blankValue(field.value) };

  return {
    ...icp,
    industries: keep(icp.industries),
    headcountRange: keep(icp.headcountRange),
    revenueBand: keep(icp.revenueBand),
    geographies: keep(icp.geographies),
    personas: keep(icp.personas),
    triggerEvents: keep(icp.triggerEvents),
    negativeSignals: keep(icp.negativeSignals),
    techStackAffinity: keep(icp.techStackAffinity),
  };
}
