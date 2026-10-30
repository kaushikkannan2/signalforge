/**
 * One place to change model routing.
 *
 * REASONING  — ICP inference, competitor analysis, the Reviewer agent's
 *              fact-checking. Correctness matters more than cost here, and
 *              adaptive thinking is on by default on Opus 5.
 * DRAFTING   — outreach copy. Still quality-sensitive, but cheaper per call
 *              and there are three touches per lead.
 * MECHANICAL — classification, short summaries, stage notes.
 */
export const MODELS = {
  REASONING: "claude-opus-5",
  DRAFTING: "claude-sonnet-5",
  MECHANICAL: "claude-sonnet-5",
} as const;

/** Published list rates, used by the cost telemetry panel. */
export const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function costUsd(model: string, input: number, output: number): number {
  const p = PRICING_PER_MTOK[model] ?? { input: 5, output: 25 };
  return (input / 1_000_000) * p.input + (output / 1_000_000) * p.output;
}
