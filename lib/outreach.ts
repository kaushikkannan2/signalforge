// ============================================================================
// Module 4b — Context-driven outreach synthesis.
//
// The thing that makes this personalisation rather than mail-merge: the
// generator is handed the specific cited signals for that account and is
// required to name the signal IDs it actually used. A message that claims no
// signal is flagged as generic in the queue, so "personalised" is an
// auditable property rather than a marketing claim.
//
// Variants are a real A/B arm, recorded per message so the analytics view can
// compare them rather than asserting a winner.
// ============================================================================

import { structured } from "./providers/anthropic";
import { emit, traced } from "./thinking";
import { db, findCompany, findPerson, signalsFor } from "./db";
import { MODELS } from "./models";
import { id as mkId, now } from "./ids";
import type { Channel, IcpDefinition, OutreachMessage } from "./types";

export const VARIANTS = {
  signal_led: {
    label: "signal-led",
    brief:
      "Open on the specific trigger event, by name. The first sentence must be something only someone who read about this company could write.",
  },
  peer_proof: {
    label: "peer-proof",
    brief:
      "Open on the pattern you see across companies in their position, then connect it to their situation. No invented customer names.",
  },
} as const;

export type VariantKey = keyof typeof VARIANTS;

const SEQUENCE_SCHEMA = {
  type: "object",
  properties: {
    touches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          touch: { type: "integer", description: "1, 2 or 3" },
          channel: { type: "string", enum: ["email", "linkedin"] },
          subject: { type: "string", description: "Email only; empty string for linkedin." },
          body: { type: "string" },
          signalIdsUsed: {
            type: "array",
            items: { type: "string" },
            description: "IDs of the signals actually referenced in this copy. Empty if none.",
          },
          valueProp: { type: "string", description: "The single value proposition this touch leads with." },
          cta: { type: "string" },
        },
        required: ["touch", "channel", "subject", "body", "signalIdsUsed", "valueProp", "cta"],
        additionalProperties: false,
      },
    },
  },
  required: ["touches"],
  additionalProperties: false,
} as const;

const SYSTEM = `You write cold outbound that a specific named person would actually reply to.

THE EVIDENCE RULE — this is the one that matters most.
You will be given cited signals and an account description. Those are the only
facts about the recipient's company you may ASSERT. Anything else you believe
about them — that they have no outbound team, no defined ICP, a particular tool
in production, a hiring plan, a headcount, a per-client workflow — you do not
know. State it as a question or a hypothesis, never as a fact.

  Wrong: "You don't have an SDR team yet, so..."
  Right: "If outbound is still founder-led, ..."

  Wrong: "You're running Lemlist across client campaigns."
  Right: "You list Lemlist expertise publicly — is that running across client
          campaigns, or mostly advisory?"

A reviewer model checks every first touch against the same evidence you were
given and flags assertions it cannot support. Writing a hypothesis as a fact
gets the message blocked, so phrase it as the hypothesis it is.

Also non-negotiable:
- signalIdsUsed must list the signal IDs you genuinely referenced.
- No invented metrics, no invented customer names, no claimed mutual connection.
- No fake familiarity ("hope you're crushing it"), no flattery, no
  "quick question" subject lines.
- Touch 1: lead with the trigger. Touch 2: a different concrete angle — do not
  restate touch 1. Touch 3: short, graceful, easy to say no to.
- Respect the word limit exactly. Shorter beats padded.
- Write like a person emailing a peer, not like marketing copy.

`;

interface RawTouch {
  touch: number;
  channel: Channel;
  subject: string;
  body: string;
  signalIdsUsed: string[];
  valueProp: string;
  cta: string;
}

export async function draftSequence(
  personId: string,
  icp: IcpDefinition,
  runId: string,
  variant: VariantKey = "signal_led",
): Promise<OutreachMessage[]> {
  const person = findPerson(personId);
  if (!person) throw new Error(`Person ${personId} not found`);
  const company = findCompany(person.companyId);
  if (!company) throw new Error(`Company ${person.companyId} not found`);

  const signals = signalsFor(company.id);
  const persona =
    icp.personas.value.find((p) => p.title === person.matchedPersona) ?? icp.personas.value[0];

  const constraints = {
    tone:
      persona?.seniority === "C-Suite" || persona?.seniority === "Founder"
        ? "direct, peer-level, zero preamble"
        : "practical and specific, focused on their day-to-day",
    maxWords: persona?.seniority === "C-Suite" || persona?.seniority === "Founder" ? 90 : 120,
    cta:
      persona?.seniority === "C-Suite" || persona?.seniority === "Founder"
        ? "a 15-minute conversation"
        : "a short walkthrough",
  };

  const prompt = `Write a 3-touch sequence to one person.

RECIPIENT
${person.fullName} — ${person.title} (${person.seniority}, ${person.department}) at ${company.name}
${person.enrichment.linkedinUrl ? `LinkedIn: ${person.enrichment.linkedinUrl}` : ""}

WHAT THIS PERSON IS MEASURED ON
${persona?.jobToBeDone ?? "unknown"}
Pain points for this persona: ${persona?.painPoints.join("; ") ?? "unknown"}

THEIR COMPANY
${company.name} (${company.domain}) — ${company.description}
${company.industry}${company.headcount ? `, roughly ${company.headcount} people` : ""}${company.hqLocation ? `, ${company.hqLocation}` : ""}
${company.techStack.length ? `Known stack: ${company.techStack.join(", ")}` : ""}

CITED SIGNALS — these are the only facts about them you may assert
${
  signals.length
    ? signals
        .map(
          (s) =>
            `[${s.id}] (${s.category}, intent +${s.intentWeight}) ${s.headline}\n      ${s.detail}\n      source: ${s.evidence[0]?.url ?? "n/a"}`,
        )
        .join("\n")
    : "NONE. Do not assert anything specific about this company beyond its description — lead with the persona's pain instead, and leave signalIdsUsed empty."
}

WHAT WE SELL
${db.intakes.find((i) => i.id === icp.intakeId)?.description ?? ""}

VARIANT: ${VARIANTS[variant].label}
${VARIANTS[variant].brief}

CONSTRAINTS
Tone: ${constraints.tone}. Maximum ${constraints.maxWords} words per touch. Ask for ${constraints.cta}.
Touch 1: email. Touch 2: linkedin. Touch 3: email.

Every touch should reference at least one cited signal where one exists — a
follow-up that drops the specific reason you reached out is just a nudge, and
nudges get ignored. Record the IDs in signalIdsUsed.`;

  const { data, usage } = await traced(
    runId,
    "Outreach",
    "reasoning",
    `Drafting ${VARIANTS[variant].label} sequence for ${person.fullName}`,
    () =>
      structured<{ touches: RawTouch[] }>(prompt, {
        system: SYSTEM,
        schema: SEQUENCE_SCHEMA as unknown as Record<string, unknown>,
        model: MODELS.DRAFTING,
        maxTokens: 8000,
      }),
    { detail: `${signals.length} cited signals available` },
  );

  const sequenceId = mkId("seq");
  const validSignalIds = new Set(signals.map((s) => s.id));

  const messages: OutreachMessage[] = data.touches
    .slice(0, 3)
    .sort((a, b) => a.touch - b.touch)
    .map((t) => {
      // Only signal IDs that actually exist count. A hallucinated ID is
      // silently dropped here, which means the "generic" flag in the queue is
      // trustworthy rather than self-reported.
      const used = t.signalIdsUsed.filter((id) => validSignalIds.has(id));
      return {
        id: mkId("msg"),
        sequenceId,
        personId: person.id,
        companyId: company.id,
        channel: t.channel,
        touch: t.touch,
        subject: t.channel === "email" ? t.subject : undefined,
        body: t.body,
        variant: VARIANTS[variant].label,
        signalsUsed: used,
        valueProp: t.valueProp,
        toneConstraints: { ...constraints, cta: t.cta || constraints.cta },
        wordCount: t.body.trim().split(/\s+/).length,
        status: "pending_approval",
        createdAt: now(),
      } satisfies OutreachMessage;
    });

  db.messages.push(...messages);

  const generic = messages.filter((m) => m.signalsUsed.length === 0).length;
  emit(runId, "Outreach", "validation", `3 touches drafted for ${person.fullName}`, {
    detail: `${messages.length - generic} of ${messages.length} touches reference a cited signal${
      generic ? `; ${generic} flagged generic` : ""
    }. Words: ${messages.map((m) => m.wordCount).join("/")}. $${usage.costUsd.toFixed(4)}`,
  });

  return messages;
}

// --- Reviewer pass ---------------------------------------------------------

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    factChecksPassed: { type: "boolean" },
    unsupportedClaims: {
      type: "array",
      items: { type: "string" },
      description: "Statements the provided evidence does not support. Empty if none.",
    },
    notes: { type: "string" },
  },
  required: ["factChecksPassed", "unsupportedClaims", "notes"],
  additionalProperties: false,
} as const;

/**
 * Independent fact check before a human sees the message. The reviewer only
 * gets the evidence and the copy — never the drafting prompt — so it cannot
 * inherit the drafter's assumptions.
 */
export async function reviewMessage(messageId: string, runId: string) {
  const message = db.messages.find((m) => m.id === messageId);
  if (!message) throw new Error("Message not found");
  const company = findCompany(message.companyId);
  const person = findPerson(message.personId);
  const signals = signalsFor(message.companyId);

  const urls = [...message.body.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) => m[0]);
  const brokenLinks: string[] = [];
  for (const url of urls.slice(0, 5)) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow" });
      if (!res.ok) brokenLinks.push(`${url} (${res.status})`);
    } catch {
      brokenLinks.push(`${url} (unreachable)`);
    }
  }

  const { data } = await traced(
    runId,
    "Review",
    "validation",
    `Fact-checking touch ${message.touch} to ${person?.fullName}`,
    () =>
      structured<{ factChecksPassed: boolean; unsupportedClaims: string[]; notes: string }>(
        `Verify this outbound message against the only evidence available about the recipient's company.

EVIDENCE
Company: ${company?.name} — ${company?.description}
${company?.headcount ? `Headcount: ${company.headcount}` : "Headcount: not known"}
${company?.hqLocation ? `HQ: ${company.hqLocation}` : ""}
Recipient: ${person?.fullName}, ${person?.title}
Signals:
${signals.map((s) => `- ${s.headline}: ${s.detail}`).join("\n") || "- none"}

MESSAGE
Subject: ${message.subject ?? "(linkedin, no subject)"}
${message.body}

List any statement the message makes about the company or the person that this
evidence does not support. Be strict about numbers, dates, named customers and
claims about what they are currently doing. Do not flag ordinary sales framing
or questions — only assertions of fact.`,
        {
          schema: REVIEW_SCHEMA as unknown as Record<string, unknown>,
          model: MODELS.REASONING,
          effort: "low",
          maxTokens: 4000,
        },
      ),
  );

  message.review = {
    reviewedBy: "reviewer-agent",
    factChecksPassed: data.factChecksPassed && brokenLinks.length === 0,
    brokenLinks,
    notes: [data.notes, ...data.unsupportedClaims.map((c) => `Unsupported: ${c}`)]
      .filter(Boolean)
      .join(" · "),
    reviewedAt: now(),
  };

  emit(
    runId,
    "Review",
    data.factChecksPassed && !brokenLinks.length ? "validation" : "error",
    `Touch ${message.touch}: ${message.review.factChecksPassed ? "passed" : "flagged"}`,
    { detail: message.review.notes || "No unsupported claims found." },
  );

  return message.review;
}
