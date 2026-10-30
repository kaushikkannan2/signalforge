// ============================================================================
// Claude client.
//
// Two call shapes are used throughout the engine:
//   structured() — forces a JSON schema, for anything that becomes data
//   prose()      — free text, for outreach copy and explanations
//
// Both record token usage and dollar cost so the telemetry panel can report
// real spend rather than an uninterpretable token count.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { MODELS, costUsd } from "../models";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set — see YOUR-TASKS.md step 1.");
    }
    client = new Anthropic();
  }
  return client;
}

export interface CallUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const ledger: CallUsage[] = [];
export const usageLedger = () => [...ledger];
export const totalCostUsd = () => ledger.reduce((s, u) => s + u.costUsd, 0);

function record(model: string, usage: { input_tokens: number; output_tokens: number }): CallUsage {
  const entry: CallUsage = {
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    costUsd: costUsd(model, usage.input_tokens, usage.output_tokens),
  };
  ledger.push(entry);
  return entry;
}

export interface StructuredOptions {
  system?: string;
  /** JSON Schema the response is constrained to. */
  schema: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
  /** low | medium | high | xhigh | max */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * Fast mode: the same model at up to ~2.5x output tokens/sec, at premium
   * pricing ($10/$50 per MTok vs $5/$25). Opus 5 and 4.8 only, Claude API
   * only, and it needs the beta endpoint plus a top-level `speed` parameter.
   *
   * Worth it where wall-clock is the bottleneck rather than cost — which for
   * this engine is exactly the interactive ICP step a person sits and watches.
   */
  fast?: boolean;
}

const FAST_CAPABLE = new Set(["claude-opus-5", "claude-opus-4-8"]);

/**
 * Set to false the first time fast mode is refused, so the rest of the run
 * stops paying a failed round-trip per call. Reported by /api/state so the UI
 * can say what is actually in use rather than what was requested.
 */
let fastModeAvailable = true;
export const isFastModeAvailable = () => fastModeAvailable;

/** The only parts of a response this module reads. */
interface MinimalMessage {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Schema-constrained call. The schema is enforced by the API, so the parsed
 * result is trusted shape-wise — only the *content* needs reviewing, which is
 * what the Reviewer agent and the citation checks are for.
 */
export async function structured<T>(
  prompt: string,
  opts: StructuredOptions,
): Promise<{ data: T; usage: CallUsage }> {
  const model = opts.model ?? MODELS.REASONING;
  const useFast = Boolean(opts.fast) && fastModeAvailable && FAST_CAPABLE.has(model);

  const base = {
    model,
    max_tokens: opts.maxTokens ?? 16000,
    ...(opts.system ? { system: opts.system } : {}),
    output_config: {
      format: { type: "json_schema", schema: opts.schema },
      ...(opts.effort ? { effort: opts.effort } : {}),
    },
    messages: [{ role: "user" as const, content: prompt }],
  };

  // Always stream. Large max_tokens at high effort can exceed the SDK's
  // non-streaming timeout ceiling, and the SDK rejects the request outright
  // rather than letting it hang — so streaming is the only safe default here.
  // The beta and non-beta message types differ (BetaContentBlock vs
  // ContentBlock), so both paths are narrowed to the minimal shape this
  // function actually reads rather than fighting the union.
  const standard = async (): Promise<MinimalMessage> =>
    (await anthropic()
      .messages.stream(base as Anthropic.MessageStreamParams)
      .finalMessage()) as unknown as MinimalMessage;

  let res: MinimalMessage;
  if (useFast) {
    try {
      res = (await anthropic()
        .beta.messages.stream({
          ...base,
          speed: "fast",
          betas: ["fast-mode-2026-02-01"],
        } as never)
        .finalMessage()) as unknown as MinimalMessage;
    } catch (err) {
      // Fast mode draws on a rate-limit pool separate from standard Opus, and
      // an org without fast mode enabled has a limit of zero — so a 429 here
      // means "not available to you", not "try again later". Falling back to
      // standard is the documented handling and keeps the request alive
      // instead of failing a user-visible step over an optional speedup.
      const status = (err as { status?: number }).status;
      const message = err instanceof Error ? err.message : String(err);
      const notAvailable =
        status === 429 || status === 403 || status === 404 || /fast mode/i.test(message);
      if (!notAvailable) throw err;
      fastModeAvailable = false;
      res = await standard();
    }
  } else {
    res = await standard();
  }

  if (res.stop_reason === "refusal") {
    throw new Error("Model declined the request (stop_reason: refusal).");
  }
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  if (!text.trim()) {
    throw new Error(
      `Empty response (stop_reason: ${res.stop_reason}) — likely truncated; raise maxTokens.`,
    );
  }
  return { data: JSON.parse(text) as T, usage: record(model, res.usage) };
}

export async function prose(
  prompt: string,
  opts: { system?: string; model?: string; maxTokens?: number } = {},
): Promise<{ text: string; usage: CallUsage }> {
  const model = opts.model ?? MODELS.DRAFTING;
  const res = await anthropic()
    .messages.stream({
      model,
      max_tokens: opts.maxTokens ?? 4000,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: prompt }],
    })
    .finalMessage();

  if (res.stop_reason === "refusal") throw new Error("Model declined the request.");
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return { text, usage: record(model, res.usage) };
}
