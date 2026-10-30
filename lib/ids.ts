/**
 * Deterministic IDs. Demo state must be reproducible across restarts so the
 * recorded run, the fixtures and the video all line up, which rules out
 * random UUIDs for seeded entities.
 */
let counters: Record<string, number> = {};

export function id(prefix: string): string {
  counters[prefix] = (counters[prefix] ?? 0) + 1;
  return `${prefix}_${String(counters[prefix]).padStart(4, "0")}`;
}

/** Stable slug-based id, for entities keyed by a natural identifier. */
export function slugId(prefix: string, natural: string): string {
  return `${prefix}_${natural.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function resetIds() {
  counters = {};
}

/** Clock is injectable so recorded runs render identical timestamps. */
export function now(): string {
  return new Date().toISOString();
}
