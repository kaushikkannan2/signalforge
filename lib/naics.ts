// ============================================================================
// NAICS validation.
//
// An LLM-generated industry code is a guess until something checks it. This is
// a deterministic check against a curated list, which converts one field from
// "inferred" to "verified" and legitimately lifts its confidence.
//
// Honesty constraint: absence from this list is NOT proof a code is wrong —
// the full 2022 NAICS set is ~1,000 six-digit codes and this is a working
// subset for B2B software and adjacent verticals. So a miss returns
// "unverified", never "invalid". Claiming a code is wrong because we didn't
// happen to list it would be the same overconfidence this file exists to fix.
// ============================================================================

export const NAICS: Record<string, string> = {
  // Information / software
  "511210": "Software Publishers (2017 basis)",
  "513210": "Software Publishers",
  "518210": "Computing Infrastructure Providers, Data Processing, Web Hosting",
  "519290": "Web Search Portals and All Other Information Services",
  "517121": "Telecommunications Resellers",
  // Professional, scientific, technical
  "541511": "Custom Computer Programming Services",
  "541512": "Computer Systems Design Services",
  "541513": "Computer Facilities Management Services",
  "541519": "Other Computer Related Services",
  "541611": "Administrative Management and General Management Consulting",
  "541613": "Marketing Consulting Services",
  "541614": "Process, Physical Distribution, and Logistics Consulting",
  "541618": "Other Management Consulting Services",
  "541690": "Other Scientific and Technical Consulting Services",
  "541715": "R&D in Physical, Engineering, and Life Sciences",
  "541810": "Advertising Agencies",
  "541820": "Public Relations Agencies",
  "541910": "Marketing Research and Public Opinion Polling",
  "541330": "Engineering Services",
  "541211": "Offices of Certified Public Accountants",
  // Finance / insurance
  "522320": "Financial Transactions Processing, Reserve, and Clearinghouse",
  "522110": "Commercial Banking",
  "523999": "Miscellaneous Financial Investment Activities",
  "524210": "Insurance Agencies and Brokerages",
  "522291": "Consumer Lending",
  // Health care
  "621111": "Offices of Physicians (except Mental Health)",
  "621610": "Home Health Care Services",
  "622110": "General Medical and Surgical Hospitals",
  "621498": "All Other Outpatient Care Centers",
  "325412": "Pharmaceutical Preparation Manufacturing",
  // Transport / logistics
  "488510": "Freight Transportation Arrangement",
  "484121": "General Freight Trucking, Long-Distance, Truckload",
  "493110": "General Warehousing and Storage",
  // Manufacturing / hardware
  "334413": "Semiconductor and Related Device Manufacturing",
  "333998": "All Other General Purpose Machinery Manufacturing",
  "334111": "Electronic Computer Manufacturing",
  "336414": "Guided Missile and Space Vehicle Manufacturing",
  // Retail / consumer
  "454110": "Electronic Shopping and Mail-Order Houses (2017 basis)",
  "459999": "All Other Miscellaneous Retailers",
  // Education / nonprofit / public
  "611310": "Colleges, Universities, and Professional Schools",
  "813211": "Grantmaking Foundations",
  "921190": "Other General Government Support",
  // Real estate
  "531210": "Offices of Real Estate Agents and Brokers",
  "531390": "Other Activities Related to Real Estate",
  // Admin support
  "561320": "Temporary Help Services",
  "561499": "All Other Business Support Services",
  "561612": "Security Guards and Patrol Services",
};

export type NaicsVerdict = "verified" | "unverified" | "malformed";

export interface NaicsCheck {
  code: string;
  verdict: NaicsVerdict;
  officialTitle?: string;
  note: string;
}

export function checkNaics(code: string): NaicsCheck {
  const trimmed = (code ?? "").trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return {
      code: trimmed,
      verdict: "malformed",
      note: "Not a six-digit code. This is a definite error, not an unknown.",
    };
  }
  const title = NAICS[trimmed];
  if (title) {
    return { code: trimmed, verdict: "verified", officialTitle: title, note: "Matches a known NAICS code." };
  }
  return {
    code: trimmed,
    verdict: "unverified",
    note: "Well-formed but not in our curated subset. Not necessarily wrong — treat as unconfirmed.",
  };
}

/**
 * Confidence adjustment from code verification. Deliberately small and
 * asymmetric: verifying codes is weak evidence that the vertical judgement is
 * right, while a malformed code is strong evidence something went wrong.
 */
export function naicsConfidenceDelta(checks: NaicsCheck[]): {
  delta: number;
  rationale: string;
} {
  if (!checks.length) return { delta: 0, rationale: "No codes to check." };
  const verified = checks.filter((c) => c.verdict === "verified").length;
  const malformed = checks.filter((c) => c.verdict === "malformed").length;
  const share = verified / checks.length;

  if (malformed) {
    return {
      delta: -0.15 * (malformed / checks.length),
      rationale: `${malformed} of ${checks.length} codes are malformed, which is a definite error.`,
    };
  }
  return {
    delta: 0.08 * share,
    rationale: `${verified} of ${checks.length} NAICS codes verified against a known list${
      share < 1 ? `; ${checks.length - verified} well-formed but unconfirmed` : ""
    }.`,
  };
}
