// ============================================================================
// Band Desktop integration — multi-agent orchestration.
//
// Four specialist roles collaborate in a shared Band room with @mention
// handoffs. Each role authenticates as its own registered Band agent, so the
// room transcript is a real record of which agent said what — not one process
// narrating four personas.
//
// We drive the REST Agent API rather than the SDK's WebSocket listener for one
// structural reason: Band agents are long-lived socket processes, and this app
// is request-scoped. Posting over REST lets the orchestration run inside the
// same lifecycle as the pipeline it is orchestrating, and the room still
// receives genuine per-agent messages and execution events.
//
// Auth note worth recording: the Agent API takes `x-api-key`, NOT
// `Authorization: Bearer` — a bearer token is rejected as an invalid JWT.
// ============================================================================

import { emit } from "../thinking";
import { db } from "../db";
import { totalCostUsd, usageLedger } from "./anthropic";
import { id as mkId, now } from "../ids";
import type { BandRole } from "../types";

const BASE = "https://app.band.ai/api/v1/agent";

export interface BandAgentCreds {
  role: BandRole;
  handle: string;
  agentId: string;
  apiKey: string;
}

export function bandAgents(): BandAgentCreds[] {
  const spec: { role: BandRole; env: string; handle: string }[] = [
    { role: "planner", env: "PLANNER", handle: "gv-planner" },
    { role: "builder", env: "BUILDER", handle: "gv-builder" },
    { role: "reviewer", env: "REVIEWER", handle: "gv-reviewer" },
    { role: "security", env: "SECURITY", handle: "gv-security" },
  ];
  return spec
    .map((s) => ({
      role: s.role,
      handle: s.handle,
      agentId: process.env[`BAND_${s.env}_AGENT_ID`] ?? "",
      apiKey: process.env[`BAND_${s.env}_API_KEY`] ?? "",
    }))
    .filter((a) => a.agentId && a.apiKey);
}

export const bandConfigured = () => bandAgents().length > 0;
export const bandRoom = () => process.env.BAND_ROOM_ID ?? "";

async function call(
  creds: BandAgentCreds,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      // Not a bearer token. Band rejects Authorization: Bearer as invalid JWT.
      "x-api-key": creds.apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON error body */
  }
  return { ok: res.ok, status: res.status, data };
}

/** Confirms each registered agent can authenticate. Used by the status panel. */
export async function verifyAgents(): Promise<
  { role: BandRole; handle: string; ok: boolean; status: number; name?: string }[]
> {
  return Promise.all(
    bandAgents().map(async (creds) => {
      const res = await call(creds, "/me");
      const name =
        res.ok && typeof res.data === "object" && res.data
          ? ((res.data as { data?: { name?: string } }).data?.name ?? undefined)
          : undefined;
      return { role: creds.role, handle: creds.handle, ok: res.ok, status: res.status, name };
    }),
  );
}

/** Peers this agent can recruit — proves cross-agent visibility is configured. */
export async function listPeers(role: BandRole = "planner") {
  const creds = bandAgents().find((a) => a.role === role);
  if (!creds) return null;
  return call(creds, "/peers");
}

function record(role: BandRole, body: string, mentions: string[], kind: "message" | "event") {
  const ledger = usageLedger();
  const last = ledger[ledger.length - 1];
  db.band.push({
    id: mkId("band"),
    roomId: bandRoom(),
    from: `kaushikkannan2/gv-${role}`,
    role,
    mentions,
    body,
    kind,
    tokens: last ? { input: last.inputTokens, output: last.outputTokens } : undefined,
    costUsd: Number(totalCostUsd().toFixed(4)),
    at: now(),
  });
}

/**
 * Post a chat message into the room as one of the agents. Band routes by
 * @mention — an agent only sees messages that mention it, while humans in the
 * room see everything.
 */
export async function say(
  role: BandRole,
  body: string,
  mentions: BandRole[] = [],
  runId?: string,
): Promise<{ ok: boolean; status: number; data: unknown } | null> {
  const creds = bandAgents().find((a) => a.role === role);
  const room = bandRoom();
  if (!creds || !room) {
    record(role, body, mentions.map((m) => `@gv-${m}`), "message");
    if (runId) {
      emit(runId, "Band", "reasoning", `[${role}] ${body.slice(0, 90)}`, {
        detail: creds
          ? "BAND_ROOM_ID not set — recorded locally instead of posted to the room."
          : `No credentials for ${role} — recorded locally.`,
      });
    }
    return null;
  }

  const text = mentions.length
    ? `${mentions.map((m) => `@gv-${m}`).join(" ")} ${body}`
    : body;

  const res = await call(creds, `/chats/${room}/messages`, {
    method: "POST",
    body: { content: text },
  });

  record(role, body, mentions.map((m) => `@gv-${m}`), "message");

  if (runId) {
    emit(
      runId,
      "Band",
      res.ok ? "reasoning" : "error",
      `[${role} → ${mentions.map((m) => `@gv-${m}`).join(" ") || "room"}] ${body.slice(0, 80)}`,
      { detail: res.ok ? `Posted to Band room ${room}` : `Band ${res.status}: ${JSON.stringify(res.data).slice(0, 180)}` },
    );
  }
  return res;
}

/** Execution records (tool calls, findings, errors) rather than chat. */
export async function event(role: BandRole, summary: string, payload: Record<string, unknown>, runId?: string) {
  const creds = bandAgents().find((a) => a.role === role);
  const room = bandRoom();
  record(role, summary, [], "event");
  if (!creds || !room) return null;
  return call(creds, `/chats/${room}/events`, {
    method: "POST",
    body: { type: "tool_call", summary, payload },
  });
}

/** Token and cost telemetry for the operational-visibility panel. */
export function telemetry() {
  const ledger = usageLedger();
  const byRole = new Map<string, { messages: number; events: number }>();
  for (const m of db.band) {
    if (!byRole.has(m.role)) byRole.set(m.role, { messages: 0, events: 0 });
    const row = byRole.get(m.role)!;
    if (m.kind === "message") row.messages++;
    else row.events++;
  }
  return {
    room: bandRoom() || null,
    agents: bandAgents().map((a) => ({ role: a.role, handle: a.handle })),
    transcript: db.band.slice(-40),
    activity: [...byRole.entries()].map(([role, v]) => ({ role, ...v })),
    llm: {
      calls: ledger.length,
      inputTokens: ledger.reduce((s, u) => s + u.inputTokens, 0),
      outputTokens: ledger.reduce((s, u) => s + u.outputTokens, 0),
      costUsd: Number(totalCostUsd().toFixed(4)),
    },
  };
}
