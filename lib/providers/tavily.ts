// ============================================================================
// Tavily — live web search, and the source of every citation in live mode.
//
// Everything this module returns is shaped as Evidence, because the rest of
// the engine refuses to render a claim that has no Evidence attached. Snippets
// are passed through verbatim from the provider; the LLM is never allowed to
// paraphrase a snippet, because a paraphrased quote attributed to a URL is
// indistinguishable from a fabricated one.
// ============================================================================

import type { Evidence } from "../types";
import { now } from "../ids";

export interface SearchHit {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

export interface SearchResult {
  query: string;
  hits: SearchHit[];
  evidence: Evidence[];
  mode: "live" | "unavailable";
}

export const dataMode = () =>
  (process.env.VOUCH_DATA_MODE ?? "demo") === "live" ? "live" : "demo";

export const tavilyConfigured = () => Boolean(process.env.TAVILY_API_KEY);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function hitToEvidence(hit: SearchHit): Evidence {
  return {
    url: hit.url,
    title: hit.title,
    // Verbatim from the provider. Trimmed for display, never reworded.
    snippet: hit.content.slice(0, 480).trim(),
    publisher: hostOf(hit.url),
    fetchedAt: now(),
    provenance: "live",
  };
}

export interface SearchOptions {
  maxResults?: number;
  depth?: "basic" | "advanced";
  includeDomains?: string[];
  excludeDomains?: string[];
  /** Restrict to recent results — used for signal discovery. */
  days?: number;
}

export async function search(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult> {
  if (!tavilyConfigured()) {
    return { query, hits: [], evidence: [], mode: "unavailable" };
  }

  const body: Record<string, unknown> = {
    query,
    max_results: opts.maxResults ?? 6,
    search_depth: opts.depth ?? "basic",
    include_answer: false,
  };
  if (opts.includeDomains?.length) body.include_domains = opts.includeDomains;
  if (opts.excludeDomains?.length) body.exclude_domains = opts.excludeDomains;
  if (opts.days) {
    body.topic = "news";
    body.days = opts.days;
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Tavily ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = (await res.json()) as { results?: SearchHit[] };
  const hits = (json.results ?? []).map((h) => ({
    title: h.title ?? "Untitled",
    url: h.url,
    content: h.content ?? "",
    score: h.score ?? 0,
    publishedDate: h.publishedDate,
  }));

  return { query, hits, evidence: hits.map(hitToEvidence), mode: "live" };
}

/** Several queries at once — discovery fans out across angles. */
export async function searchMany(
  queries: string[],
  opts: SearchOptions = {},
): Promise<SearchResult[]> {
  return Promise.all(
    queries.map((q) =>
      search(q, opts).catch((err): SearchResult => {
        // One failed angle must not sink the whole discovery run.
        console.error(`[tavily] "${q}" failed:`, err instanceof Error ? err.message : err);
        return { query: q, hits: [], evidence: [], mode: "unavailable" };
      }),
    ),
  );
}
