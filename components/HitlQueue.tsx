"use client";

import { useEffect, useState } from "react";
import { computeCadence, type CadenceStatus } from "@/lib/cadence";
import type { ApprovalRecord, DispatchRecord, Lead, OutreachMessage, Person } from "@/lib/types";

/**
 * The approval gate as a working surface. Three things are deliberately
 * visible on every card: which cited signal the copy used (or that it used
 * none), what the reviewer agent found, and the audit record once a decision
 * is made. Send is disabled until an approval exists — and the server refuses
 * it independently, so the button state is a convenience, not the control.
 */
export function HitlQueue({
  messages,
  people,
  approvals,
  dispatches,
  leads = [],
  onDecide,
  onDispatch,
  busy,
}: {
  messages: OutreachMessage[];
  people: Person[];
  approvals: ApprovalRecord[];
  dispatches: DispatchRecord[];
  /** Used to stop a sequence once the lead has replied. */
  leads?: Lead[];
  onDecide: (
    messageId: string,
    action: "approve" | "edit_and_approve" | "reject",
    payload?: { editedBody?: string; rejectionReason?: string },
  ) => void;
  onDispatch: (messageId: string, opts?: { sendEarly?: boolean }) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // The clock for "due in N days". Ticks each minute so a touch becomes
  // sendable without a reload.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!messages.length) return null;
  const nameOf = (id: string) => people.find((p) => p.id === id);
  const approvalOf = (id: string) =>
    approvals.filter((a) => a.messageId === id).slice(-1)[0];
  const dispatchOf = (id: string) => dispatches.filter((d) => d.messageId === id).slice(-1)[0];
  // Same rule the server enforces in dispatch(), computed here so the button
  // can explain itself. The server still decides.
  const cadenceOf = (m: OutreachMessage): CadenceStatus =>
    computeCadence(m, {
      messages,
      dispatches,
      leadStage: leads.find((l) => l.personId === m.personId)?.stage,
      nowMs,
    });

  const bySequence = new Map<string, OutreachMessage[]>();
  for (const m of messages) {
    if (!bySequence.has(m.sequenceId)) bySequence.set(m.sequenceId, []);
    bySequence.get(m.sequenceId)!.push(m);
  }

  const pending = messages.filter((m) => m.status === "pending_approval").length;

  return (
    <section className="surface" style={{ borderColor: "var(--color-rule)" }}>
      <header className="px-4 py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
        <h2 className="display" style={{ fontSize: "1.25rem" }}>
          Approval queue
        </h2>
        <p className="mt-0.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
          {pending} awaiting a decision. Nothing can be dispatched without an approval
          record — the send function checks for one before it touches a transport, so
          there is no code path that skips this screen.
        </p>
      </header>

      <div className="divide-y" style={{ borderColor: "var(--color-rule)" }}>
        {[...bySequence.entries()].map(([seqId, touches]) => {
          const person = nameOf(touches[0].personId);
          return (
            <div key={seqId} className="px-4 py-3.5">
              <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{person?.fullName}</span>
                <span style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
                  {person?.title}
                </span>
                {person?.enrichment.email && (
                  <span
                    className="mono px-1.5 py-0.5 rounded"
                    title={`${person.enrichment.emailMethod} · MX ${person.enrichment.mxRecords?.[0] ?? "none"} · ${person.enrichment.deliverability}`}
                    style={{
                      background:
                        person.enrichment.emailMethod === "hunter_verified"
                          ? "var(--color-vine-soft)"
                          : "var(--color-signal-soft)",
                      color:
                        person.enrichment.emailMethod === "hunter_verified"
                          ? "var(--color-vine)"
                          : "var(--color-signal)",
                      fontSize: "0.6875rem",
                    }}
                  >
                    {person.enrichment.email} · {Math.round(person.enrichment.emailConfidence * 100)}% ·{" "}
                    {person.enrichment.emailMethod?.replace(/_/g, " ")}
                  </span>
                )}
                <span className="mono" style={{ color: "var(--color-ink-faint)", fontSize: "0.6875rem" }}>
                  variant: {touches[0].variant}
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {touches
                  .slice()
                  .sort((a, b) => a.touch - b.touch)
                  .map((m) => {
                    const approval = approvalOf(m.id);
                    const sent = dispatchOf(m.id);
                    const isEditing = editing === m.id;
                    const cadence = cadenceOf(m);
                    return (
                      <article
                        key={m.id}
                        className="border rounded p-2.5"
                        style={{
                          borderColor:
                            m.status === "rejected"
                              ? "var(--color-alarm)"
                              : m.status === "sent"
                                ? "var(--color-vine)"
                                : "var(--color-rule)",
                          background: m.status === "rejected" ? "var(--color-alarm-soft)" : undefined,
                        }}
                      >
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="rule-label">
                            touch {m.touch} · {m.channel}
                          </span>
                          <span className="mono" style={{ color: "var(--color-ink-faint)", fontSize: "0.6875rem" }}>
                            {m.wordCount}/{m.toneConstraints.maxWords} words
                          </span>
                          {cadence.state !== "sent" && cadence.state !== "ready" && m.status !== "rejected" && (
                            <CadenceBadge cadence={cadence} />
                          )}
                          {m.signalsUsed.length > 0 ? (
                            <span
                              className="rule-label px-1.5 py-0.5 rounded"
                              style={{ background: "var(--color-signal-soft)", color: "var(--color-signal)" }}
                              title={`References signal(s): ${m.signalsUsed.join(", ")}`}
                            >
                              {m.signalsUsed.length} signal{m.signalsUsed.length > 1 ? "s" : ""} cited
                            </span>
                          ) : (
                            <span
                              className="rule-label px-1.5 py-0.5 rounded"
                              style={{ background: "var(--color-rule)", color: "var(--color-ink-faint)" }}
                              title="This copy references no cited signal, so it is generic by definition."
                            >
                              generic
                            </span>
                          )}
                          {m.review && (
                            <span
                              className="rule-label px-1.5 py-0.5 rounded"
                              title={m.review.notes}
                              style={{
                                background: m.review.factChecksPassed ? "var(--color-vine-soft)" : "var(--color-alarm-soft)",
                                color: m.review.factChecksPassed ? "var(--color-vine)" : "var(--color-alarm)",
                              }}
                            >
                              reviewer: {m.review.factChecksPassed ? "passed" : "flagged"}
                            </span>
                          )}
                          <span
                            className="rule-label px-1.5 py-0.5 rounded ml-auto"
                            style={{
                              background:
                                m.status === "sent"
                                  ? "var(--color-vine-soft)"
                                  : m.status === "rejected"
                                    ? "var(--color-alarm-soft)"
                                    : "var(--color-rule)",
                              color:
                                m.status === "sent"
                                  ? "var(--color-vine)"
                                  : m.status === "rejected"
                                    ? "var(--color-alarm)"
                                    : "var(--color-ink-soft)",
                            }}
                          >
                            {m.status.replace(/_/g, " ")}
                          </span>
                        </div>

                        {m.subject && (
                          <p style={{ fontSize: "0.875rem", fontWeight: 600 }}>{m.subject}</p>
                        )}

                        {isEditing ? (
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={7}
                            className="w-full mt-1 px-2 py-1.5 rounded border"
                            style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem" }}
                          />
                        ) : (
                          <p
                            className="mt-1 whitespace-pre-wrap"
                            style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}
                          >
                            {m.body}
                          </p>
                        )}

                        {approval && (
                          <p
                            className="mono mt-1.5 pt-1.5 border-t"
                            style={{
                              borderColor: "var(--color-rule)",
                              color: "var(--color-ink-faint)",
                              fontSize: "0.6875rem",
                            }}
                          >
                            {approval.decision.replace(/_/g, " ")} by {approval.decidedBy} ·{" "}
                            {new Date(approval.decidedAt).toLocaleTimeString("en-GB", { hour12: false })} ·{" "}
                            {approval.id}
                            {approval.rejectionReason && ` · reason: ${approval.rejectionReason}`}
                            {sent && ` → ${sent.status} via ${sent.provider} (${sent.id})`}
                          </p>
                        )}

                        {rejecting === m.id && (
                          <div className="mt-2 flex gap-2">
                            <input
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Why are you rejecting this?"
                              className="flex-1 px-2 py-1.5 rounded border"
                              style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem" }}
                            />
                            <button
                              onClick={() => {
                                onDecide(m.id, "reject", { rejectionReason: reason || "Not specified" });
                                setRejecting(null);
                                setReason("");
                              }}
                              className="px-2.5 py-1 rounded-md"
                              style={{ background: "var(--color-alarm)", color: "#2a0810", fontWeight: 600, fontSize: "0.8125rem" }}
                            >
                              Confirm reject
                            </button>
                          </div>
                        )}

                        {m.status !== "sent" && m.status !== "rejected" && rejecting !== m.id && (
                          <div className="mt-2 flex gap-1.5 flex-wrap">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => {
                                    onDecide(m.id, "edit_and_approve", { editedBody: draft });
                                    setEditing(null);
                                  }}
                                  disabled={busy}
                                  className="btn-primary px-2.5 py-1 rounded-md disabled:opacity-50"
                                  style={{ fontSize: "0.8125rem" }}
                                >
                                  Save &amp; approve
                                </button>
                                <button
                                  onClick={() => setEditing(null)}
                                  className="px-2.5 py-1 rounded border"
                                  style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem" }}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                {m.status !== "approved" && (
                                  <button
                                    onClick={() => onDecide(m.id, "approve")}
                                    disabled={busy}
                                    className="btn-primary px-2.5 py-1 rounded-md disabled:opacity-50"
                                    style={{ fontSize: "0.8125rem" }}
                                  >
                                    Approve
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setEditing(m.id);
                                    setDraft(m.body);
                                  }}
                                  className="px-2.5 py-1 rounded border"
                                  style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem" }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => setRejecting(m.id)}
                                  className="px-2.5 py-1 rounded border"
                                  style={{
                                    borderColor: "var(--color-rule-strong)",
                                    color: "var(--color-alarm)",
                                    fontSize: "0.8125rem",
                                  }}
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => {
                                    if (cadence.state !== "waiting") return onDispatch(m.id);
                                    if (window.confirm(`${cadence.reason}\n\nSend touch ${m.touch} now anyway?`)) {
                                      onDispatch(m.id, { sendEarly: true });
                                    }
                                  }}
                                  disabled={
                                    busy ||
                                    m.status !== "approved" ||
                                    cadence.state === "halted" ||
                                    cadence.state === "blocked"
                                  }
                                  title={
                                    m.status !== "approved"
                                      ? "Blocked: no approval record exists for this message yet."
                                      : cadence.state === "ready"
                                        ? "Send now"
                                        : cadence.reason
                                  }
                                  className="px-2.5 py-1 rounded border disabled:opacity-40 ml-auto"
                                  style={{
                                    borderColor: "var(--color-vine)",
                                    color: "var(--color-vine)",
                                    fontSize: "0.8125rem",
                                  }}
                                >
                                  {cadence.state === "waiting" ? "Send early →" : "Send →"}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CadenceBadge({ cadence }: { cadence: CadenceStatus }) {
  const halted = cadence.state === "halted";
  const label =
    cadence.state === "halted"
      ? "sequence stopped"
      : cadence.state === "blocked"
        ? "waiting on earlier touch"
        : cadence.dueAt
          ? `due ${new Date(cadence.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
          : "scheduled";
  return (
    <span
      className="rule-label px-1.5 py-0.5 rounded"
      title={cadence.reason}
      style={{
        background: halted ? "var(--color-alarm-soft)" : "var(--color-rule)",
        color: halted ? "var(--color-alarm)" : "var(--color-ink-soft)",
      }}
    >
      {label}
    </span>
  );
}
