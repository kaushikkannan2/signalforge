// ============================================================================
// Grapevine domain model.
// Every externally-sourced claim in this system carries an Evidence[] array.
// There is no code path that renders a company, buyer, signal or competitor
// fact without its citations — that is a hard requirement of the brief
// ("mandatory inline source citations to eliminate hallucinations").
// ============================================================================

/** A single citation. `fetchedAt` lets the UI show how stale a claim is. */
export interface Evidence {
  url: string;
  title: string;
  /** Verbatim snippet from the source. Never paraphrased by the LLM. */
  snippet: string;
  publisher?: string;
  fetchedAt: string;
  /** 'live' = fetched this session. 'recorded' = replayed from a captured run. */
  provenance: "live" | "recorded";
}

/** Wraps any inferred value with how sure we are and why. */
export interface Scored<T> {
  value: T;
  /** 0.00 – 1.00 */
  confidence: number;
  /** Plain-language justification shown on hover in the UI. */
  rationale: string;
  evidence: Evidence[];
}

// ---------------------------------------------------------------------------
// Module 1 — Product intake & ICP
// ---------------------------------------------------------------------------

export interface ProductIntake {
  id: string;
  companyName: string;
  productName: string;
  /** The founder's plain-language description. The only required input. */
  description: string;
  features: string[];
  referenceCustomers: string[];
  pricingModel?: string;
  averageContractValue?: string;
  technicalConstraints?: string[];
  createdAt: string;
}

export interface BuyerPersona {
  title: string;
  seniority: "IC" | "Manager" | "Director" | "VP" | "C-Suite" | "Founder";
  department: string;
  /** What this persona is measured on — drives message framing. */
  jobToBeDone: string;
  painPoints: string[];
}

export type TriggerCategory =
  | "funding"
  | "exec_hire"
  | "tech_stack_change"
  | "headcount_growth"
  | "expansion"
  | "competitor_churn"
  | "regulatory"
  | "product_launch";

export interface TriggerEvent {
  category: TriggerCategory;
  label: string;
  /** Why this event means they are in-market right now. */
  buyingImplication: string;
  /** How much this moves the intent score, 0–30. */
  intentWeight: number;
}

export interface IcpDefinition {
  id: string;
  intakeId: string;
  /** NAICS-aligned, as the brief requires. */
  industries: Scored<{ name: string; naics: string }[]>;
  headcountRange: Scored<{ min: number; max: number; tierLabel: string }>;
  revenueBand: Scored<{ min: number; max: number; currency: string }>;
  geographies: Scored<string[]>;
  personas: Scored<BuyerPersona[]>;
  triggerEvents: Scored<TriggerEvent[]>;
  /** Disqualifiers. Applied as a hard filter during discovery. */
  negativeSignals: Scored<string[]>;
  techStackAffinity: Scored<string[]>;
  /** Mean of all field confidences — the headline number in the UI. */
  overallConfidence: number;
  status: "draft" | "approved";
  createdAt: string;
}

/** An adjacent segment the founder can accept, adjust, or dismiss. */
export interface IcpExpansion {
  id: string;
  icpId: string;
  segmentName: string;
  naics: string;
  /** Evidence-based reasoning, per the brief. */
  thesis: string;
  nonObviousBecause: string;
  estimatedAccountCount: number;
  confidence: number;
  evidence: Evidence[];
  decision: "pending" | "accepted" | "adjusted" | "dismissed";
  adjustmentNote?: string;
}

// ---------------------------------------------------------------------------
// Module 2 — Discovery
// ---------------------------------------------------------------------------

export type FitTier = "A" | "B" | "C";

/** Composite 0–100 score, decomposed so the UI can show the maths. */
export interface FitScore {
  total: number;
  tier: FitTier;
  components: {
    industryMatch: number;
    sizeMatch: number;
    geoMatch: number;
    techStackMatch: number;
    intentSignals: number;
  };
  /** Negative signals that fired, with the points they removed. */
  penalties: { reason: string; points: number }[];
}

export interface Company {
  id: string;
  name: string;
  domain: string;
  description: string;
  industry: string;
  naics: string;
  headcount?: number;
  revenueEstimate?: string;
  hqLocation?: string;
  techStack: string[];
  evidence: Evidence[];
  fit: FitScore;
  discoveredAt: string;
  /** True when a hard negative signal disqualified the account. */
  disqualified: boolean;
  disqualificationReason?: string;
}

export type EnrichmentMethod =
  | "hunter_verified"
  | "mx_validated_pattern"
  | "pattern_inferred"
  | "manual";

export interface ContactEnrichment {
  email?: string;
  emailConfidence: number;
  emailMethod?: EnrichmentMethod;
  /** Result of a real DNS MX lookup against the company domain. */
  mxValid?: boolean;
  mxRecords?: string[];
  deliverability?: "deliverable" | "risky" | "undeliverable" | "unknown";
  linkedinUrl?: string;
  enrichedAt?: string;
  /** Which vendor answered, for cost attribution. */
  vendor?: string;
}

export interface Person {
  id: string;
  companyId: string;
  fullName: string;
  title: string;
  seniority: BuyerPersona["seniority"];
  department: string;
  /** Which ICP persona this person matched, and how well. */
  matchedPersona?: string;
  personaMatchScore: number;
  evidence: Evidence[];
  enrichment: ContactEnrichment;
  previousEmployers: string[];
  education: string[];
}

export interface Signal {
  id: string;
  companyId: string;
  category: TriggerCategory;
  headline: string;
  detail: string;
  observedAt: string;
  /** Contribution to the company's intent score. */
  intentWeight: number;
  evidence: Evidence[];
}

export interface Competitor {
  id: string;
  name: string;
  domain: string;
  /** Per the brief: direct, indirect, or alternative category. */
  category: "direct" | "indirect" | "alternative";
  positioning: string;
  valueProposition: string;
  pricingTiers: { name: string; price: string; notes?: string }[];
  structuralAdvantages: string[];
  ourDifferentiators: string[];
  evidence: Evidence[];
}

// ---------------------------------------------------------------------------
// Module 4 — Outreach & HITL
// ---------------------------------------------------------------------------

export type Channel = "email" | "linkedin";

export interface OutreachMessage {
  id: string;
  sequenceId: string;
  personId: string;
  companyId: string;
  channel: Channel;
  /** 1 = first touch, 2 = follow-up, 3 = final. */
  touch: number;
  subject?: string;
  body: string;
  /** A/B arm label, e.g. 'signal-led' vs 'peer-proof'. */
  variant: string;
  /** The specific signal IDs woven into this copy — proves personalisation. */
  signalsUsed: string[];
  valueProp: string;
  /** Persona constraints the generator was held to. */
  toneConstraints: { tone: string; maxWords: number; cta: string };
  wordCount: number;
  status: "drafted" | "pending_approval" | "approved" | "rejected" | "sent" | "failed";
  /** Reviewer's verdict on factual accuracy and link validity. */
  review?: {
    reviewedBy: string;
    factChecksPassed: boolean;
    brokenLinks: string[];
    notes: string;
    reviewedAt: string;
  };
  createdAt: string;
}

/**
 * The HITL gate. A message cannot transition to `sent` without one of these,
 * and `enforceGate()` in lib/hitl.ts is the only path to dispatch.
 */
export interface ApprovalRecord {
  id: string;
  messageId: string;
  decision: "approved" | "rejected" | "edited_and_approved";
  decidedBy: string;
  /** 'human' always, for dispatch. Recorded explicitly so audit is unambiguous. */
  actorType: "human";
  editedBody?: string;
  editedSubject?: string;
  rejectionReason?: string;
  decidedAt: string;
}

export interface DispatchRecord {
  id: string;
  messageId: string;
  approvalId: string;
  channel: Channel;
  to: string;
  provider: string;
  providerMessageId?: string;
  status: "sent" | "failed" | "simulated";
  error?: string;
  dispatchedAt: string;
}

// ---------------------------------------------------------------------------
// Module 5 — Pipeline & attribution
// ---------------------------------------------------------------------------

export type LeadStage =
  | "matched"
  | "contacted"
  | "replied"
  | "meeting_booked"
  | "closed_won"
  | "closed_lost";

export const LEAD_STAGES: LeadStage[] = [
  "matched",
  "contacted",
  "replied",
  "meeting_booked",
  "closed_won",
  "closed_lost",
];

/** Who moved the lead — the brief requires AI vs rep to be distinguishable. */
export type Actor = "ai_agent" | "sales_rep" | "system";

export interface StageTransition {
  id: string;
  leadId: string;
  from: LeadStage | null;
  to: LeadStage;
  actor: Actor;
  actorName: string;
  reason: string;
  at: string;
}

export interface Lead {
  id: string;
  personId: string;
  companyId: string;
  icpId: string;
  stage: LeadStage;
  owner: { actor: Actor; name: string };
  /** Full audit trail, newest last. */
  history: StageTransition[];
  fitScore: number;
  tier: FitTier;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Bonus — Flexprice metering
// ---------------------------------------------------------------------------

export type MeteredEventName = "leads_enriched" | "outreach_sent" | "graph_queries";

export interface MeterEvent {
  id: string;
  eventName: MeteredEventName;
  externalCustomerId: string;
  credits: number;
  properties: Record<string, string | number | boolean>;
  /** Did we successfully mirror this to Flexprice's /v1/events? */
  mirroredToFlexprice: boolean;
  flexpriceError?: string;
  at: string;
}

export interface CreditLedger {
  customerId: string;
  granted: number;
  consumed: number;
  balance: number;
  /** Cost in credits per metered operation. */
  unitCosts: Record<MeteredEventName, number>;
}

// ---------------------------------------------------------------------------
// Bonus — Band multi-agent telemetry
// ---------------------------------------------------------------------------

export type BandRole = "planner" | "builder" | "reviewer" | "security";

export interface BandMessage {
  id: string;
  roomId: string;
  from: string;
  role: BandRole | "human";
  mentions: string[];
  body: string;
  kind: "message" | "event";
  /** True only when Band accepted the post (HTTP 2xx). */
  delivered?: boolean;
  /** Token + cost telemetry, per the brief's "operational telemetry". */
  tokens?: { input: number; output: number };
  costUsd?: number;
  at: string;
}

// ---------------------------------------------------------------------------
// Agent Thinking feed — streamed to the collapsible UI panel
// ---------------------------------------------------------------------------

export interface ThinkingStep {
  id: string;
  runId: string;
  phase: string;
  kind: "reasoning" | "tool_call" | "graph_query" | "validation" | "gate" | "error";
  label: string;
  detail?: string;
  /** Cypher or provider call, shown verbatim so judges can see it is real. */
  query?: string;
  durationMs?: number;
  at: string;
}
