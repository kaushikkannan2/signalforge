// ============================================================================
// PII handling.
//
// The problem this file exists for: a GTM engine's whole job is to resolve
// identifiable information about real people who never consented to being in
// our database. Three places that becomes a concrete risk:
//
//   1. A recorded demo is a PUBLICATION. An email address on screen is an
//      address published to everyone who watches, and an *inferred* address
//      may also be WRONG — attributing a wrong contact to a named person is
//      its own harm, separate from the disclosure.
//   2. A snapshot on disk is a data store. It is gitignored for this reason.
//   3. A dispatch button next to a real address is one misclick from sending
//      unsolicited mail to someone who never asked for it.
//
// So: masking is a first-class mode, not a screenshot-editing afterthought,
// and dispatch is hard-guarded rather than trusted to the operator.
// ============================================================================

import type { Company, Person } from "./types";

export type PrivacyMode = "full" | "mask";

export const privacyMode = (): PrivacyMode =>
  (process.env.VOUCH_PRIVACY_MODE ?? "full") === "mask" ? "mask" : "full";

/** `bill.stathopoulos@salescaptain.io` → `b••••••••••@salescaptain.io` */
export function maskEmail(email?: string): string | undefined {
  if (!email) return email;
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 1);
  return `${head}${"•".repeat(Math.max(3, Math.min(local.length - 1, 10)))}@${domain}`;
}

/** `Bill Stathopoulos` → `Bill S.` — keeps the record legible, drops the identifier. */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0].slice(0, 1)}.`;
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1)}.`;
}

export function maskUrl(url?: string): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    // Keep the host — it is the evidence — and drop the path, which is the
    // part that identifies the individual.
    return `${u.origin}/•••`;
  } catch {
    return "•••";
  }
}

/**
 * Masks a person for display. The underlying record is untouched: masking is a
 * presentation boundary, so the pipeline keeps working on real values while
 * nothing identifiable reaches a screen or a video frame.
 */
export function maskPerson(person: Person): Person {
  if (privacyMode() === "full") return person;
  return {
    ...person,
    fullName: maskName(person.fullName),
    enrichment: {
      ...person.enrichment,
      email: maskEmail(person.enrichment.email),
      linkedinUrl: maskUrl(person.enrichment.linkedinUrl),
    },
    // Evidence hosts stay; the deep links that identify the individual do not.
    evidence: person.evidence.map((e) => ({ ...e, url: maskUrl(e.url) ?? e.url })),
  };
}

/** Companies are organisations, not natural persons — far less to mask. */
export function maskCompany(company: Company): Company {
  return company;
}

export function maskPeople(people: Person[]): Person[] {
  return privacyMode() === "mask" ? people.map(maskPerson) : people;
}

/** Redacts addresses out of message bodies when masking is on. */
export function maskBody(body: string): string {
  if (privacyMode() === "full") return body;
  return body.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (m) => maskEmail(m) ?? "•••");
}

// --- dispatch safety -------------------------------------------------------

export class DispatchSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchSafetyError";
  }
}

/**
 * Prevents the demo from mailing a real prospect.
 *
 * `VOUCH_ALLOW_REAL_SEND=true` is the explicit, deliberate opt-out. Until
 * it is set, a dispatch to anything other than DEMO_INBOX is refused — so the
 * safe behaviour is what you get by forgetting to configure something, which
 * is the only way a safety default actually holds.
 */
export function assertSafeRecipient(to: string, intended?: string): string {
  const allowReal = process.env.VOUCH_ALLOW_REAL_SEND === "true";
  const demoInbox = process.env.DEMO_INBOX;

  if (allowReal) return to;

  if (!demoInbox) {
    throw new DispatchSafetyError(
      "Refusing to send: VOUCH_ALLOW_REAL_SEND is not true and DEMO_INBOX is unset, so there is nowhere safe to deliver. Set DEMO_INBOX to your own address.",
    );
  }
  if (to !== demoInbox) {
    throw new DispatchSafetyError(
      `Refusing to send to ${to}: outside demo mode only DEMO_INBOX (${demoInbox}) may receive mail. Set VOUCH_ALLOW_REAL_SEND=true to override deliberately.`,
    );
  }
  if (intended && intended !== demoInbox) {
    // Recorded, not hidden: the audit trail should say who this would have
    // reached in production.
    return demoInbox;
  }
  return to;
}
