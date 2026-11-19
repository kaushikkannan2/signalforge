import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCadence, gapDays } from "../lib/cadence.ts";
import type { DispatchRecord, OutreachMessage } from "../lib/types.ts";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-11-01T09:00:00.000Z");

function msg(touch: number, status: OutreachMessage["status"] = "approved"): OutreachMessage {
  return {
    id: `msg_${touch}`,
    sequenceId: "seq_1",
    personId: "person_1",
    companyId: "company_1",
    channel: "email",
    touch,
    body: "hi",
    variant: "signal-led",
    signalsUsed: [],
    valueProp: "",
    toneConstraints: { tone: "", maxWords: 120, cta: "" },
    wordCount: 1,
    status,
    createdAt: new Date(T0).toISOString(),
  };
}

function sent(messageId: string, atMs: number, status: DispatchRecord["status"] = "simulated"): DispatchRecord {
  return {
    id: `disp_${messageId}`,
    messageId,
    approvalId: "appr_1",
    channel: "email",
    to: "demo@example.com",
    provider: "none",
    status,
    dispatchedAt: new Date(atMs).toISOString(),
  };
}

test("touch 1 is ready immediately", () => {
  const m = msg(1);
  assert.equal(computeCadence(m, { messages: [m], dispatches: [], nowMs: T0 }).state, "ready");
});

test("touch 2 is blocked until touch 1 is sent", () => {
  const messages = [msg(1, "approved"), msg(2)];
  const c = computeCadence(messages[1], { messages, dispatches: [], nowMs: T0 });
  assert.equal(c.state, "blocked");
});

test("touch 2 waits for its gap after touch 1, then becomes ready", () => {
  const messages = [msg(1, "sent"), msg(2)];
  const dispatches = [sent("msg_1", T0)];
  assert.equal(gapDays(2), 3);

  const early = computeCadence(messages[1], { messages, dispatches, nowMs: T0 + 1 * DAY });
  assert.equal(early.state, "waiting");
  assert.equal(early.dueAt, new Date(T0 + 3 * DAY).toISOString());

  const due = computeCadence(messages[1], { messages, dispatches, nowMs: T0 + 3 * DAY });
  assert.equal(due.state, "ready");
});

test("touch 3 is spaced from touch 2, not from touch 1", () => {
  const messages = [msg(1, "sent"), msg(2, "sent"), msg(3)];
  const dispatches = [sent("msg_1", T0), sent("msg_2", T0 + 5 * DAY)];
  const c = computeCadence(messages[2], { messages, dispatches, nowMs: T0 + 8 * DAY });
  assert.equal(c.state, "waiting");
  assert.equal(c.dueAt, new Date(T0 + 9 * DAY).toISOString());
});

test("a failed send does not start the clock", () => {
  const messages = [msg(1, "sent"), msg(2)];
  const dispatches = [sent("msg_1", T0 - 10 * DAY, "failed")];
  const c = computeCadence(messages[1], { messages, dispatches, nowMs: T0 });
  assert.equal(c.state, "ready", "no delivered dispatch, so the send time is unknown");
});

test("a reply halts every unsent touch", () => {
  const messages = [msg(1, "sent"), msg(2), msg(3)];
  const dispatches = [sent("msg_1", T0)];
  for (const stage of ["replied", "meeting_booked", "closed_won", "closed_lost"] as const) {
    const c = computeCadence(messages[1], { messages, dispatches, leadStage: stage, nowMs: T0 + 30 * DAY });
    assert.equal(c.state, "halted", stage);
  }
});

test("moving the lead back to contacted reopens the sequence", () => {
  const messages = [msg(1, "sent"), msg(2)];
  const dispatches = [sent("msg_1", T0)];
  const c = computeCadence(messages[1], { messages, dispatches, leadStage: "contacted", nowMs: T0 + 4 * DAY });
  assert.equal(c.state, "ready");
});
