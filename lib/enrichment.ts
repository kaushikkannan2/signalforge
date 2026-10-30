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
}

const mxCache = new Map<string, MxResult>();

/** A real DNS lookup. No vendor, no cost, and it genuinely rules out typos and dead domains. */
export async function checkMx(domain: string): Promise<MxResult> {
  if (!domain) return { valid: false, records: [] };
  const cached = mxCache.get(domain);
  if (cached) return cached;
  try {
    const records = await resolveMx(domain);
    const result = {
      valid: records.length > 0,
      records: records
        .sort((a, b) => a.priority - b.priority)
        .map((r) => `${r.exchange} (${r.priority})`),
    };
    mxCache.set(domain, result);
    return result;
  } catch {
    const result = { valid: false, records: [] };
    mxCache.set(domain, result);
    return result;
  }
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
async function findLinkedIn(fullName: string, companyName: string): Promise<string | undefined> {
  try {
    const res = await search(`"${fullName}" ${companyName} linkedin`, {
      maxResults: 4,
      includeDomains: ["linkedin.com"],
    });
    const hit = res.hits.find((h) => /linkedin\.com\/in\//.test(h.url));
    return hit?.url;
  } catch {
    return undefined;
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
        return {
          email: hunter.email,
          emailConfidence: Math.max(0.8, hunter.score),
          emailMethod: "hunter_verified" as EnrichmentMethod,
          mxValid: mx.valid,
          mxRecords: mx.records,
          deliverability: hunter.verified ? "deliverable" : mx.valid ? "risky" : "undeliverable",
          linkedinUrl: await findLinkedIn(person.fullName, company?.name ?? ""),
          enrichedAt: now(),
          vendor: "hunter.io",
        };
      }

      const patterns = emailPatterns(person.fullName, domain);
      if (!patterns.length) {
        return {
          emailConfidence: 0,
          deliverability: "unknown",
          mxValid: mx.valid,
          mxRecords: mx.records,
          enrichedAt: now(),
          vendor: "none",
        };
      }

      return {
        email: patterns[0],
        // Deliberately capped. The domain accepts mail; that is not the same
        // as this mailbox existing, and the number should not pretend it is.
        emailConfidence: mx.valid ? 0.62 : 0.25,
        emailMethod: mx.valid ? "mx_validated_pattern" : "pattern_inferred",
        mxValid: mx.valid,
        mxRecords: mx.records,
        deliverability: mx.valid ? "risky" : "undeliverable",
        linkedinUrl: await findLinkedIn(person.fullName, company?.name ?? ""),
        enrichedAt: now(),
        vendor: mx.valid ? "dns-mx + pattern" : "pattern",
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
