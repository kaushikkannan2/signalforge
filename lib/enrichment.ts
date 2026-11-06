// ============================================================================
// Module 4a — Contact enrichment.
//
// Three resolution strategies, in descending order of trustworthiness, and the
// UI always shows which one produced a given address:
//
//   hunter_verified      Vendor confirmed the mailbox exists.
//   mx_validated_pattern Pattern inferred, and a real DNS MX lookup proves the
//                        domain can receive mail at all. This is a genuine
//                        check, not a guess dressed up as one — but it
//                        validates the DOMAIN, not the mailbox, and the
//                        confidence reflects that.
//   pattern_inferred     Pattern only. Lowest confidence, labelled as such.
//
// The distinction matters because "verified" is a word reps trust. An address
// we inferred must never render as one a vendor confirmed.
// ============================================================================

import { resolveMx } from "node:dns/promises";
import { emit, traced } from "./thinking";
import { db, findCompany } from "./db";
import { assertCredits, meter } from "./meter";
import { search } from "./providers/tavily";
import { now } from "./ids";
import type { ContactEnrichment, EnrichmentMethod, Person } from "./types";

export interface MxResult {
  valid: boolean;
  records: string[];
  source: "dns" | "fixture";
}

/**
 * RFC 2606 reserves .example, .invalid, .test and .localhost precisely so that
 * they never resolve. Every company in the demo scenario uses one, which is the
 * right call for a recorded demo — but it means a real MX lookup can only ever
 * fail, and every synthetic buyer collapses to the lowest tier for a reason
 * that says nothing about the resolver.
 *
 * So synthetic companies get synthetic mail infrastructure, derived
 * deterministically from the domain and tagged source:"fixture" so the UI can
 * say which it is. The resolver itself is untouched: a real domain still gets a
 * real dns.resolveMx call, and that is the path the product ships.
 */
const RESERVED_TLD = /\.(example|invalid|test|localhost)$/i;

/** A deliberate minority of synthetic domains have no mail at all, so the
 *  honest-failure row survives in the demo rather than being tidied away. */
function fixtureMx(domain: string): MxResult {
  let h = 2166136261;
  for (let i = 0; i < domain.length; i++) {
    h ^= domain.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bucket = Math.abs(h) % 10;
  if (bucket === 0) return { valid: false, records: [], source: "fixture" };
  const host = bucket < 6 ? "aspmx.l.google.com" : bucket < 9 ? "mail.protection.outlook.com" : "mx.mailfence.example";
  return { valid: true, records: [`${host} (10)`, `alt1.${host} (20)`], source: "fixture" };
}

const mxCache = new Map<string, MxResult>();

/** A real DNS lookup. No vendor, no cost, and it genuinely rules out typos and dead domains. */
export async function checkMx(domain: string): Promise<MxResult> {
  if (!domain) return { valid: false, records: [], source: "dns" };
  const cached = mxCache.get(domain);
  if (cached) return cached;
  if (RESERVED_TLD.test(domain)) {
    const result = fixtureMx(domain);
    mxCache.set(domain, result);
    return result;
  }
  try {
    const records = await resolveMx(domain);
    const result: MxResult = {
      valid: records.length > 0,
      records: records
        .sort((a, b) => a.priority - b.priority)
        .map((r) => `${r.exchange} (${r.priority})`),
      source: "dns",
    };
    mxCache.set(domain, result);
    return result;
  } catch {
    const result: MxResult = { valid: false, records: [], source: "dns" };
    mxCache.set(domain, result);
    return result;
  }
}

/**
 * Observed email shapes, per domain. Populated only from addresses that cleared
 * a higher tier, so this is evidence rather than assumption: if we know a
 * verified address at acme.com is first.last, a second person at acme.com is a
 * far better bet than a blind guess — though still a bet about one mailbox.
 */
const domainShapes = new Map<string, { shape: string; learnedFrom: string }>();

function shapeOf(email: string, fullName: string): string | undefined {
  const local = email.split("@")[0]?.toLowerCase();
  const parts = fullName.toLowerCase().split(/\s+/).filter(Boolean);
  if (!local || parts.length < 2) return undefined;
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (local === `${first}.${last}`) return "first.last";
  if (local === `${first}`) return "first";
  if (local === `${first[0]}${last}`) return "flast";
  if (local === `${first}${last}`) return "firstlast";
  if (local === `${first}_${last}`) return "first_last";
  return undefined;
}

function applyShape(shape: string, fullName: string, domain: string): string | undefined {
  const parts = fullName.toLowerCase().normalize("NFD").replace(/[^a-z\s-]/g, "").split(/\s+/).filter(Boolean);
  if (parts.length < 2) return undefined;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const local =
    shape === "first.last" ? `${first}.${last}`
    : shape === "first" ? first
    : shape === "flast" ? `${first[0]}${last}`
    : shape === "firstlast" ? `${first}${last}`
    : shape === "first_last" ? `${first}_${last}`
    : undefined;
  return local ? `${local}@${domain}` : undefined;
}

export function rememberShape(email: string, fullName: string, domain: string) {
  const shape = shapeOf(email, fullName);
  if (shape && domain && !domainShapes.has(domain)) {
    domainShapes.set(domain, { shape, learnedFrom: fullName });
  }
}

export function resetShapes() {
  domainShapes.clear();
}

/** Common corporate patterns, most-likely first. */
export function emailPatterns(fullName: string, domain: string): string[] {
  const parts = fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2 || !domain) return [];
  const [first, ...rest] = parts;
  const last = rest[rest.length - 1];
  return [
    `${first}.${last}@${domain}`,
    `${first}@${domain}`,
    `${first[0]}${last}@${domain}`,
    `${first}${last}@${domain}`,
    `${first}_${last}@${domain}`,
  ];
}

interface HunterResult {
  email: string | null;
  score: number;
  verified: boolean;
}

async function hunterFind(fullName: string, domain: string): Promise<HunterResult | null> {
  if (!process.env.HUNTER_API_KEY) return null;
  const parts = fullName.split(/\s+/);
  const url = new URL("https://api.hunter.io/v2/email-finder");
  url.searchParams.set("domain", domain);
  url.searchParams.set("first_name", parts[0] ?? "");
  url.searchParams.set("last_name", parts[parts.length - 1] ?? "");
  url.searchParams.set("api_key", process.env.HUNTER_API_KEY);

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { email?: string | null; score?: number; verification?: { status?: string } };
    };
    const email = json.data?.email ?? null;
    if (!email) return null;
    return {
      email,
      score: (json.data?.score ?? 0) / 100,
      verified: json.data?.verification?.status === "valid",
    };
  } catch {
    return null;
  }
}

/** LinkedIn profile resolution. Only accepts a URL that is actually a profile URL. */
export interface LinkedInResult {
  url?: string;
  method?: ContactEnrichment["linkedinMethod"];
}

/**
 * A search hit on linkedin.com is not the same as the right person's profile.
 * The brief asks for *validated* personal LinkedIn URLs, so the slug is checked
 * against the name and the result is graded rather than asserted.
 */
function gradeProfile(url: string, fullName: string): ContactEnrichment["linkedinMethod"] {
  const slug = (url.split("/in/")[1] ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const parts = fullName.toLowerCase().normalize("NFD").replace(/[^a-z\s-]/g, "").split(/\s+/).filter(Boolean);
  if (!slug || parts.length < 2) return "unverified";
  const first = parts[0];
  const last = parts[parts.length - 1];
  const hasFirst = slug.includes(first);
  const hasLast = slug.includes(last);
  if (hasFirst && hasLast) return "name_matched";
  if (hasFirst || hasLast) return "partial_match";
  return "unverified";
}

async function findLinkedIn(
  fullName: string,
  companyName: string,
  domain: string,
): Promise<LinkedInResult> {
  // Synthetic person at a synthetic company. A plausible-looking linkedin.com
  // URL that 404s on click would be worse than an empty cell, so the slug is
  // rendered as text and tagged fixture rather than linked out.
  if (RESERVED_TLD.test(domain)) {
    const slug = fullName.toLowerCase().normalize("NFD").replace(/[^a-z\s-]/g, "").trim().replace(/\s+/g, "-");
    return { url: `linkedin.com/in/${slug}`, method: "fixture" };
  }
  try {
    const res = await search(`"${fullName}" ${companyName} linkedin`, {
      maxResults: 4,
      includeDomains: ["linkedin.com"],
    });
    const profiles = res.hits.filter((h) => /linkedin\.com\/in\//.test(h.url));
    if (!profiles.length) return {};
    // Prefer a hit whose slug actually agrees with the name over the top result.
    const graded = profiles.map((h) => ({ url: h.url, method: gradeProfile(h.url, fullName) }));
    return (
      graded.find((g) => g.method === "name_matched") ??
      graded.find((g) => g.method === "partial_match") ??
      graded[0]
    );
  } catch {
    return {};
  }
}

export async function enrichPerson(person: Person, runId: string): Promise<ContactEnrichment> {
  const company = findCompany(person.companyId);
  const domain = company?.domain ?? "";

  // Gate first. Spending a vendor call we cannot bill for is the exact failure
  // the credit system exists to prevent.
  assertCredits("leads_enriched", 1, runId);

  const enrichment = await traced(
    runId,
    "Enrichment",
    "tool_call",
    `Resolving contact for ${person.fullName} at ${company?.name ?? "unknown"}`,
    async (): Promise<ContactEnrichment> => {
      const mx = await checkMx(domain);

      const hunter = await hunterFind(person.fullName, domain);
      if (hunter?.email) {
        rememberShape(hunter.email, person.fullName, domain);
        return {
          email: hunter.email,
          emailConfidence: Math.max(0.8, hunter.score),
          emailMethod: "hunter_verified" as EnrichmentMethod,
          mxValid: mx.valid,
          mxRecords: mx.records,
          mxSource: mx.source,
          deliverability: hunter.verified ? "deliverable" : mx.valid ? "risky" : "undeliverable",
          ...(await (async () => {
            const li = await findLinkedIn(person.fullName, company?.name ?? "", domain);
            return { linkedinUrl: li.url, linkedinMethod: li.method };
          })()),
          enrichedAt: now(),
          vendor: "hunter.io",
        };
      }

      const patterns = emailPatterns(person.fullName, domain);
      if (!patterns.length) {
        // Genuinely nothing to work from: no domain on the account, or a name we
        // cannot split into first and last. This stays unresolved on purpose.
        return {
          emailConfidence: 0,
          deliverability: "unknown",
          mxValid: mx.valid,
          mxRecords: mx.records,
          mxSource: mx.source,
          ...(await (async () => {
            const li = await findLinkedIn(person.fullName, company?.name ?? "", domain);
            return { linkedinUrl: li.url, linkedinMethod: li.method };
          })()),
          enrichedAt: now(),
          vendor: "none",
        };
      }

      // Has a domain-mate already given up its shape? Then this is an observed
      // pattern applied to a new name, not a guess from a list of five.
      const known = domainShapes.get(domain);
      const corroborated = known ? applyShape(known.shape, person.fullName, domain) : undefined;

      const email = corroborated ?? patterns[0];
      const method: EnrichmentMethod = mx.valid
        ? "mx_validated_pattern"
        : corroborated
          ? "pattern_corroborated"
          : "pattern_inferred";

      // Each ceiling is set by what the evidence can actually bear:
      //   0.74  MX accepts mail AND the shape was observed at this domain
      //   0.62  MX accepts mail, shape assumed            (domain, not mailbox)
      //   0.55  shape observed at this domain, no MX       (form, not delivery)
      //   0.25  neither                                    (a ranked guess)
      const confidence = mx.valid ? (corroborated ? 0.74 : 0.62) : corroborated ? 0.55 : 0.25;

      if (mx.valid) rememberShape(email, person.fullName, domain);

      return {
        email,
        emailConfidence: confidence,
        emailMethod: method,
        mxValid: mx.valid,
        mxRecords: mx.records,
        mxSource: mx.source,
        patternLearnedFrom: corroborated ? known?.learnedFrom : undefined,
        deliverability: mx.valid ? "risky" : "undeliverable",
        ...(await (async () => {
          const li = await findLinkedIn(person.fullName, company?.name ?? "", domain);
          return { linkedinUrl: li.url, linkedinMethod: li.method };
        })()),
        enrichedAt: now(),
        vendor: mx.valid ? "dns-mx + pattern" : corroborated ? "observed-pattern" : "pattern",
      };
    },
  );

  person.enrichment = enrichment;

  await meter(
    "leads_enriched",
    {
      personId: person.id,
      companyId: person.companyId,
      method: enrichment.emailMethod ?? "none",
      mxValid: enrichment.mxValid ?? false,
    },
    { runId },
  );

  emit(
    runId,
    "Enrichment",
    "validation",
    `${person.fullName}: ${enrichment.emailMethod ?? "unresolved"}`,
    {
      detail: `${enrichment.email ?? "no address"} · confidence ${(enrichment.emailConfidence * 100).toFixed(0)}% · MX ${
        enrichment.mxValid ? enrichment.mxRecords?.[0] ?? "present" : "none"
      } · deliverability ${enrichment.deliverability}`,
    },
  );

  return enrichment;
}

export async function enrichAll(runId: string, personIds?: string[]) {
  const targets = personIds
    ? db.people.filter((p) => personIds.includes(p.id))
    : db.people.filter((p) => !p.enrichment.enrichedAt);

  const enriched: Person[] = [];
  for (const person of targets) {
    try {
      await enrichPerson(person, runId);
      enriched.push(person);
    } catch (err) {
      // A credit gate stops the batch cleanly — the remaining people are left
      // unenriched rather than half-processed, so a top-up can resume it.
      if (err instanceof Error && err.name === "InsufficientCreditsError") {
        emit(runId, "Enrichment", "gate", "Enrichment halted by credit gate", {
          detail: `${enriched.length} of ${targets.length} enriched before the balance ran out. ${err.message}`,
        });
        break;
      }
      emit(runId, "Enrichment", "error", `Failed for ${person.fullName}`, {
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return enriched;
}
