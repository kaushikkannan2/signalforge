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
  // Always stream. Large max_tokens at high effort can exceed the SDK's
  // non-streaming timeout ceiling, and the SDK rejects the request outright
  // rather than letting it hang — so streaming is the only safe default here.
  const stream = anthropic().messages.stream({
    model,
    max_tokens: opts.maxTokens ?? 16000,
    ...(opts.system ? { system: opts.system } : {}),
    output_config: {
      format: { type: "json_schema", schema: opts.schema },
      ...(opts.effort ? { effort: opts.effort } : {}),
    },
    messages: [{ role: "user", content: prompt }],
  } as Anthropic.MessageStreamParams);
  const res = await stream.finalMessage();

  if (res.stop_reason === "refusal") {
    throw new Error("Model declined the request (stop_reason: refusal).");
  }
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
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
