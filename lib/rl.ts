// ============================================================================
// The learning layer — and an honest account of what does and does not learn.
//
// This file contains ONE real learning algorithm and ONE real dataset pipeline.
// It deliberately does not claim more than that, because the rest of the engine
// is deterministic scoring and LLM inference, and mislabelling those as
// "reinforcement learning" is the kind of claim that collapses under one
// follow-up question from someone who knows the field.
//
// What is genuinely here:
//
//  1. A CONTEXTUAL MULTI-ARMED BANDIT over outreach variants, with
//     Beta-Bernoulli Thompson sampling. Arms are (variant × channel). Context
//     is (buyer seniority band × whether a cited signal exists). Reward comes
//     from the human approval gate and, with a delay, from replies. This is a
//     real sequential-decision policy that improves with observed outcomes —
//     exploration and exploitation are handled by sampling from the posterior
//     rather than by an epsilon schedule.
//
//  2. A PREFERENCE DATASET in DPO format, harvested from the HITL gate. Every
//     edited-and-approved message yields a (prompt, chosen, rejected) triple
//     where the human's edit is the preferred completion — which is exactly
//     the shape RLHF/DPO training consumes. We collect and export it; we do
//     not claim to have fine-tuned on it.
//
// What is NOT learned, and is labelled as such in the UI:
//   - The fit score's component weights are hand-set. They could be fit by
//     logistic regression against closed-won outcomes, and the plumbing to do
//     that is here, but n is far too small to fit anything honest.
//   - ICP inference is a frozen model with no gradient flowing back.
//   - The reviewer's thresholds are fixed rules.
// ============================================================================

import { db } from "./db";
import { emit } from "./thinking";
import { id as mkId, now } from "./ids";
import type { Channel, OutreachMessage, Person } from "./types";

/* --- arms and context ----------------------------------------------------- */

export type ArmId = string; // `${variant}|${channel}`

export const ARMS: { variant: string; channel: Channel }[] = [
  { variant: "signal-led", channel: "email" },
  { variant: "peer-proof", channel: "email" },
  { variant: "signal-led", channel: "linkedin" },
  { variant: "peer-proof", channel: "linkedin" },
];

export const armId = (variant: string, channel: Channel): ArmId => `${variant}|${channel}`;

/**
 * Context buckets. Kept coarse on purpose: a contextual bandit with more
 * contexts than observations learns nothing, and pretending otherwise is the
 * most common way this technique is misapplied.
 */
export type SeniorityBand = "exec" | "leader" | "operator";
export type ContextId = string; // `${band}|${hasSignal ? "signal" : "cold"}`

export function seniorityBand(person: Person): SeniorityBand {
  if (person.seniority === "Founder" || person.seniority === "C-Suite") return "exec";
  if (person.seniority === "VP" || person.seniority === "Director") return "leader";
  return "operator";
}

export const contextId = (band: SeniorityBand, hasSignal: boolean): ContextId =>
  `${band}|${hasSignal ? "signal" : "cold"}`;

/* --- posterior state ------------------------------------------------------ */

export interface ArmPosterior {
  context: ContextId;
  arm: ArmId;
  /** Beta(alpha, beta). Priors start at 1,1 — a uniform belief, not a guess. */
  alpha: number;
  beta: number;
  pulls: number;
  rewards: number;
}

export interface RewardEvent {
  id: string;
  context: ContextId;
  arm: ArmId;
  reward: number;
  source: "approval" | "rejection" | "reply" | "meeting";
  messageId?: string;
  at: string;
}

interface BanditState {
  posteriors: Map<string, ArmPosterior>;
  rewards: RewardEvent[];
  decisions: { context: ContextId; arm: ArmId; sampled: Record<ArmId, number>; at: string }[];
}

const g = globalThis as unknown as { __vouchBandit?: BanditState };
const state: BanditState =
  g.__vouchBandit ?? (g.__vouchBandit = { posteriors: new Map(), rewards: [], decisions: [] });

const key = (context: ContextId, arm: ArmId) => `${context}::${arm}`;

/** Clears learned state. A reset that leaves posteriors behind is not a reset. */
export function resetBandit() {
  state.posteriors.clear();
  state.rewards.length = 0;
  state.decisions.length = 0;
  originalBodies.clear();
}

function posterior(context: ContextId, arm: ArmId): ArmPosterior {
  const k = key(context, arm);
  let p = state.posteriors.get(k);
  if (!p) {
    p = { context, arm, alpha: 1, beta: 1, pulls: 0, rewards: 0 };
    state.posteriors.set(k, p);
  }
  return p;
}

/* --- Thompson sampling ---------------------------------------------------- */

/**
 * Gamma sampler (Marsaglia–Tsang) → Beta sampler. Needed because Thompson
 * sampling draws from each arm's posterior rather than using its mean; using
 * the mean would collapse exploration entirely and lock in whichever arm got
 * lucky first.
 */
function gamma(shape: number): number {
  if (shape < 1) {
    const u = Math.random();
    return gamma(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      const u1 = Math.random();
      const u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(a: number, b: number): number {
  const x = gamma(a);
  const y = gamma(b);
  return x / (x + y);
}

export interface Selection {
  variant: string;
  channel: Channel;
  arm: ArmId;
  context: ContextId;
  /** Every arm's sampled value, so the choice is inspectable rather than opaque. */
  sampled: Record<ArmId, number>;
  reason: string;
}

/**
 * Selects a variant by sampling each arm's posterior and taking the argmax.
 * Early on the posteriors are wide, so this explores; as evidence accumulates
 * they narrow and it exploits. No hand-tuned exploration rate.
 */
export function selectVariant(
  person: Person,
  hasSignal: boolean,
  channel: Channel,
  runId?: string,
): Selection {
  const ctx = contextId(seniorityBand(person), hasSignal);
  const candidates = ARMS.filter((a) => a.channel === channel);

  const sampled: Record<ArmId, number> = {};
  let best = candidates[0];
  let bestValue = -1;

  for (const cand of candidates) {
    const id = armId(cand.variant, cand.channel);
    const p = posterior(ctx, id);
    const draw = sampleBeta(p.alpha, p.beta);
    sampled[id] = Number(draw.toFixed(4));
    if (draw > bestValue) {
      bestValue = draw;
      best = cand;
    }
  }

  const chosen = armId(best.variant, best.channel);
  const p = posterior(ctx, chosen);
  const totalPulls = candidates.reduce((s, c) => s + posterior(ctx, armId(c.variant, c.channel)).pulls, 0);

  const reason =
    totalPulls < candidates.length * 2
      ? `Exploring: only ${totalPulls} observation(s) in context ${ctx}, so the posteriors are still wide.`
      : `Exploiting: ${chosen} has ${p.rewards}/${p.pulls} reward in context ${ctx} (posterior mean ${(p.alpha / (p.alpha + p.beta)).toFixed(2)}).`;

  state.decisions.push({ context: ctx, arm: chosen, sampled, at: now() });
  if (state.decisions.length > 500) state.decisions.splice(0, state.decisions.length - 500);

  if (runId) {
    emit(runId, "Policy", "reasoning", `Bandit chose ${best.variant} for ${person.fullName}`, {
      detail: `${reason} Sampled: ${Object.entries(sampled).map(([a, v]) => `${a.split("|")[0]}=${v}`).join(", ")}`,
    });
  }

  return { variant: best.variant, channel: best.channel, arm: chosen, context: ctx, sampled, reason };
}

/* --- reward --------------------------------------------------------------- */

const REWARD: Record<RewardEvent["source"], number> = {
  rejection: 0,
  approval: 1,
  reply: 2,
  meeting: 3,
};

/**
 * Posterior update. Approval is the immediate signal; replies and meetings are
 * delayed and worth more, so they arrive as additional pseudo-observations
 * rather than overwriting the approval outcome.
 */
export function recordReward(
  message: OutreachMessage,
  person: Person | undefined,
  source: RewardEvent["source"],
  runId?: string,
): RewardEvent | null {
  if (!person) return null;
  const ctx = contextId(seniorityBand(person), message.signalsUsed.length > 0);
  const arm = armId(message.variant, message.channel);
  const p = posterior(ctx, arm);
  const reward = REWARD[source];

  p.pulls += 1;
  if (reward > 0) {
    p.alpha += reward;
    p.rewards += reward;
  } else {
    p.beta += 1;
  }

  const event: RewardEvent = {
    id: mkId("rw"),
    context: ctx,
    arm,
    reward,
    source,
    messageId: message.id,
    at: now(),
  };
  state.rewards.push(event);

  if (runId) {
    emit(runId, "Policy", "validation", `Reward ${reward} (${source}) → ${arm}`, {
      detail: `Context ${ctx}. Posterior now Beta(${p.alpha.toFixed(1)}, ${p.beta.toFixed(1)}), mean ${(p.alpha / (p.alpha + p.beta)).toFixed(2)} over ${p.pulls} pulls.`,
    });
  }

  return event;
}

/* --- preference pairs (DPO format) --------------------------------------- */

export interface PreferencePair {
  id: string;
  /** The instruction the model was given. */
  prompt: string;
  /** The human-preferred completion. */
  chosen: string;
  /** What the model originally produced. */
  rejected: string;
  source: "human_edit" | "rejection";
  messageId: string;
  at: string;
}

/**
 * Harvests preference pairs from the approval gate.
 *
 * An edited-and-approved message is the cleanest possible preference signal: a
 * human read the model's output, changed it, and shipped their version. That
 * is a (prompt, chosen, rejected) triple in exactly the shape DPO consumes.
 *
 * We COLLECT and EXPORT this. We have not fine-tuned on it, and the UI says so
 * — a dataset is not a trained policy, and conflating them would be the same
 * category error this file exists to avoid.
 */
export function preferencePairs(): PreferencePair[] {
  const pairs: PreferencePair[] = [];
  for (const approval of db.approvals) {
    const message = db.messages.find((m) => m.id === approval.messageId);
    if (!message) continue;

    if (approval.decision === "edited_and_approved" && approval.editedBody) {
      const original = findOriginalBody(message.id) ?? message.body;
      if (approval.editedBody.trim() !== original.trim()) {
        pairs.push({
          id: mkId("pref"),
          prompt: promptFor(message),
          chosen: approval.editedBody,
          rejected: original,
          source: "human_edit",
          messageId: message.id,
          at: approval.decidedAt,
        });
      }
    }

    if (approval.decision === "rejected" && approval.rejectionReason) {
      // A rejection without a replacement is a negative-only example. Recorded
      // separately because DPO needs a chosen completion, and inventing one
      // would be fabricating the human's preference.
      pairs.push({
        id: mkId("pref"),
        prompt: promptFor(message),
        chosen: "",
        rejected: message.body,
        source: "rejection",
        messageId: message.id,
        at: approval.decidedAt,
      });
    }
  }
  return pairs;
}

/** Reconstructs the instruction that produced a message, for the dataset. */
function promptFor(message: OutreachMessage): string {
  const person = db.people.find((p) => p.id === message.personId);
  const company = db.companies.find((c) => c.id === message.companyId);
  const signals = db.signals.filter((s) => message.signalsUsed.includes(s.id));
  return [
    `Write touch ${message.touch} of a ${message.channel} sequence.`,
    `Recipient: ${person?.fullName ?? "unknown"}, ${person?.title ?? ""} at ${company?.name ?? ""}.`,
    `Variant: ${message.variant}. Tone: ${message.toneConstraints.tone}. Max ${message.toneConstraints.maxWords} words. CTA: ${message.toneConstraints.cta}.`,
    signals.length
      ? `Cited signals available:\n${signals.map((s) => `- ${s.headline}: ${s.detail}`).join("\n")}`
      : "No cited signals available.",
  ].join("\n");
}

const originals = globalThis as unknown as { __vouchOriginals?: Map<string, string> };
const originalBodies: Map<string, string> =
  originals.__vouchOriginals ?? (originals.__vouchOriginals = new Map());

/** Called at draft time so an edit has something to be compared against. */
export function recordOriginal(messageId: string, body: string) {
  if (!originalBodies.has(messageId)) originalBodies.set(messageId, body);
}
const findOriginalBody = (messageId: string) => originalBodies.get(messageId);

/* --- introspection for the UI -------------------------------------------- */

export interface LearningReport {
  policy: {
    algorithm: string;
    arms: ArmId[];
    contexts: string[];
    posteriors: (ArmPosterior & { mean: number; ciLow: number; ciHigh: number })[];
    totalPulls: number;
    totalReward: number;
    recentDecisions: BanditState["decisions"];
  };
  preference: {
    format: string;
    pairs: number;
    usableForDpo: number;
    negativeOnly: number;
    sample: PreferencePair | null;
  };
  /** The honesty table. Rendered verbatim in the UI. */
  components: {
    component: string;
    learns: boolean;
    method: string;
    note: string;
  }[];
}

export function learningReport(): LearningReport {
  const posteriors = [...state.posteriors.values()].map((p) => {
    const mean = p.alpha / (p.alpha + p.beta);
    // Normal approximation to the Beta — adequate for a display interval, and
    // labelled as approximate rather than presented as exact.
    const variance = (p.alpha * p.beta) / (Math.pow(p.alpha + p.beta, 2) * (p.alpha + p.beta + 1));
    const sd = Math.sqrt(variance);
    return {
      ...p,
      mean: Number(mean.toFixed(3)),
      ciLow: Number(Math.max(0, mean - 1.96 * sd).toFixed(3)),
      ciHigh: Number(Math.min(1, mean + 1.96 * sd).toFixed(3)),
    };
  });

  const pairs = preferencePairs();

  return {
    policy: {
      algorithm: "Contextual multi-armed bandit, Beta-Bernoulli Thompson sampling",
      arms: ARMS.map((a) => armId(a.variant, a.channel)),
      contexts: [...new Set(posteriors.map((p) => p.context))],
      posteriors: posteriors.sort((a, b) => b.mean - a.mean),
      totalPulls: posteriors.reduce((s, p) => s + p.pulls, 0),
      totalReward: state.rewards.reduce((s, r) => s + r.reward, 0),
      recentDecisions: state.decisions.slice(-12).reverse(),
    },
    preference: {
      format: "DPO / RLHF preference triples (prompt, chosen, rejected)",
      pairs: pairs.length,
      usableForDpo: pairs.filter((p) => p.source === "human_edit").length,
      negativeOnly: pairs.filter((p) => p.source === "rejection").length,
      sample: pairs.find((p) => p.source === "human_edit") ?? pairs[0] ?? null,
    },
    components: [
      {
        component: "Outreach variant selection",
        learns: true,
        method: "Contextual bandit, Thompson sampling",
        note: "Real sequential decision policy. Posteriors update from approval, reply and meeting outcomes; exploration comes from posterior sampling rather than a tuned epsilon.",
      },
      {
        component: "Copy quality preferences",
        learns: false,
        method: "DPO dataset collected, not yet trained on",
        note: "Every human edit is a (chosen, rejected) pair in DPO format. We collect and export it. We have NOT fine-tuned — a dataset is not a trained policy.",
      },
      {
        component: "Fit score weights",
        learns: false,
        method: "Hand-set, decomposed and visible",
        note: "Could be fit by logistic regression against closed-won outcomes. n is far too small to fit anything honest, so the weights stay hand-set and the arithmetic stays on screen.",
      },
      {
        component: "ICP inference",
        learns: false,
        method: "Frozen foundation model, structured output",
        note: "No gradient flows back. Confidence is the model's own calibrated estimate, not a learned parameter.",
      },
      {
        component: "Reviewer thresholds",
        learns: false,
        method: "Fixed rules",
        note: "Fact-check verdict and link validation are deterministic. Nothing adapts.",
      },
    ],
  };
}

/** JSONL export, the format DPO trainers actually ingest. */
export function exportDpoJsonl(): string {
  return preferencePairs()
    .filter((p) => p.source === "human_edit")
    .map((p) => JSON.stringify({ prompt: p.prompt, chosen: p.chosen, rejected: p.rejected }))
    .join("\n");
}
