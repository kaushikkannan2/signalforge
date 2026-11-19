"use client";

import { useState } from "react";
import { editRatio, wordDiff } from "@/lib/diff";
import {
  REJECTION_CATEGORIES,
  type ApprovalRecord,
  type DispatchRecord,
  type OutreachMessage,
  type Person,
  type RejectionCategory,
} from "@/lib/types";

export interface DecisionPayload {
  editedBody?: string;
  editedSubject?: string;
  rejectionReason?: string;
  rejectionCategory?: RejectionCategory;
}

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
  onDecide,
  onDispatch,
  busy,
}: {
  messages: OutreachMessage[];
  people: Person[];
  approvals: ApprovalRecord[];
  dispatches: DispatchRecord[];
  onDecide: (
    messageId: string,
    action: "approve" | "edit_and_approve" | "reject",
    payload?: DecisionPayload,
  ) => void;
  onDispatch: (messageId: string) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<RejectionCategory | null>(null);
  const [showChanges, setShowChanges] = useState<Set<string>>(new Set());
  const toggleChanges = (id: string) =>
    setShowChanges((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const closeReject = () => {
    setRejecting(null);
    setReason("");
    setCategory(null);
  };

  if (!messages.length) return null;
  const nameOf = (id: string) => people.find((p) => p.id === id);
  const approvalOf = (id: string) =>
    approvals.filter((a) => a.messageId === id).slice(-1)[0];
  const dispatchOf = (id: string) => dispatches.filter((d) => d.messageId === id).slice(-1)[0];

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
                    const wasEdited = m.originalBody !== undefined || m.originalSubject !== undefined;
                    const bodyChanged = isEditing && draft !== m.body;
                    const subjectChanged = isEditing && m.subject !== undefined && draftSubject !== m.subject;
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
                          {wasEdited && (
                            <button
                              onClick={() => toggleChanges(m.id)}
                              className="rule-label px-1.5 py-0.5 rounded"
                              title="Compare the drafter's copy with what was approved"
                              style={{ background: "var(--color-signal-soft)", color: "var(--color-signal)" }}
                            >
                              edited · {Math.round(editRatio(m.originalBody ?? m.body, m.body) * 100)}% rewritten{" "}
                              {showChanges.has(m.id) ? "▴" : "▾"}
                            </button>
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

                        {isEditing && m.subject !== undefined ? (
                          <input
                            value={draftSubject}
                            onChange={(e) => setDraftSubject(e.target.value)}
                            aria-label="Subject"
                            className="w-full px-2 py-1 rounded border"
                            style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.875rem", fontWeight: 600 }}
                          />
                        ) : (
                          m.subject && <p style={{ fontSize: "0.875rem", fontWeight: 600 }}>{m.subject}</p>
                        )}

                        {isEditing ? (
                          <>
                            <textarea
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              aria-label="Message body"
                              rows={7}
                              className="w-full mt-1 px-2 py-1.5 rounded border"
                              style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem" }}
                            />
                            {(bodyChanged || subjectChanged) && (
                              <ChangeView
                                label="Your changes"
                                beforeSubject={subjectChanged ? m.subject : undefined}
                                afterSubject={subjectChanged ? draftSubject : undefined}
                                before={m.body}
                                after={draft}
                              />
                            )}
                          </>
                        ) : wasEdited && showChanges.has(m.id) ? (
                          <ChangeView
                            label="Drafted → approved"
                            beforeSubject={m.originalSubject}
                            afterSubject={m.originalSubject !== undefined ? m.subject : undefined}
                            before={m.originalBody ?? m.body}
                            after={m.body}
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
                            {approval.rejectionCategory && ` · ${REJECTION_CATEGORIES[approval.rejectionCategory]}`}
                            {approval.rejectionReason && ` · ${approval.rejectionReason}`}
                            {sent && ` → ${sent.status} via ${sent.provider} (${sent.id})`}
                          </p>
                        )}

                        {rejecting === m.id && (
                          <fieldset className="mt-2 flex flex-col gap-2">
                            <legend className="rule-label mb-1">Why are you rejecting this?</legend>
                            <div className="flex gap-1.5 flex-wrap">
                              {(Object.keys(REJECTION_CATEGORIES) as RejectionCategory[]).map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  aria-pressed={category === c}
                                  onClick={() => setCategory(c)}
                                  className="px-2 py-0.5 rounded border"
                                  style={{
                                    fontSize: "0.75rem",
                                    borderColor: category === c ? "var(--color-alarm)" : "var(--color-rule-strong)",
                                    background: category === c ? "var(--color-alarm-soft)" : undefined,
                                    color: category === c ? "var(--color-alarm)" : undefined,
                                  }}
                                >
                                  {REJECTION_CATEGORIES[c]}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder={category === "other" ? "Say why (required)" : "Add a note (optional)"}
                                className="flex-1 px-2 py-1.5 rounded border"
                                style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem" }}
                              />
                              <button
                                onClick={() => {
                                  if (!category) return;
                                  onDecide(m.id, "reject", {
                                    rejectionCategory: category,
                                    rejectionReason: reason.trim() || undefined,
                                  });
                                  closeReject();
                                }}
                                disabled={busy || !category || (category === "other" && !reason.trim())}
                                className="px-2.5 py-1 rounded-md disabled:opacity-40"
                                style={{ background: "var(--color-alarm)", color: "#2a0810", fontWeight: 600, fontSize: "0.8125rem" }}
                              >
                                Confirm reject
                              </button>
                              <button
                                onClick={closeReject}
                                className="px-2.5 py-1 rounded border"
                                style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem" }}
                              >
                                Cancel
                              </button>
                            </div>
                          </fieldset>
                        )}

                        {m.status !== "sent" && m.status !== "rejected" && rejecting !== m.id && (
                          <div className="mt-2 flex gap-1.5 flex-wrap">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => {
                                    onDecide(m.id, "edit_and_approve", {
                                      editedBody: bodyChanged ? draft : undefined,
                                      editedSubject: subjectChanged ? draftSubject : undefined,
                                    });
                                    setEditing(null);
                                  }}
                                  disabled={
                                    busy ||
                                    (!bodyChanged && !subjectChanged) ||
                                    !draft.trim() ||
                                    (subjectChanged && !draftSubject.trim())
                                  }
                                  title={!bodyChanged && !subjectChanged ? "Nothing changed yet. Use Approve to approve as drafted." : undefined}
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
                                    setDraftSubject(m.subject ?? "");
                                    closeReject();
                                  }}
                                  className="px-2.5 py-1 rounded border"
                                  style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem" }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    setRejecting(m.id);
                                    setReason("");
                                    setCategory(null);
                                  }}
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
                                  onClick={() => onDispatch(m.id)}
                                  disabled={busy || m.status !== "approved"}
                                  title={
                                    m.status !== "approved"
                                      ? "Blocked: no approval record exists for this message yet."
                                      : "Send now"
                                  }
                                  className="px-2.5 py-1 rounded border disabled:opacity-40 ml-auto"
                                  style={{
                                    borderColor: "var(--color-vine)",
                                    color: "var(--color-vine)",
                                    fontSize: "0.8125rem",
                                  }}
                                >
                                  Send →
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

/** Word-level before/after, so the rep sees exactly what their edit changes. */
function ChangeView({
  label,
  before,
  after,
  beforeSubject,
  afterSubject,
}: {
  label: string;
  before: string;
  after: string;
  beforeSubject?: string;
  afterSubject?: string;
}) {
  const showSubject = beforeSubject !== undefined && afterSubject !== undefined && beforeSubject !== afterSubject;
  return (
    <div
      className="mt-1.5 p-2 rounded border"
      style={{ borderColor: "var(--color-rule)", fontSize: "0.8125rem" }}
    >
      <span className="rule-label">{label}</span>
      {showSubject && (
        <p className="mt-1" style={{ fontWeight: 600 }}>
          <Segments before={beforeSubject} after={afterSubject} />
        </p>
      )}
      <p className="mt-1 whitespace-pre-wrap" style={{ color: "var(--color-ink-soft)" }}>
        <Segments before={before} after={after} />
      </p>
    </div>
  );
}

function Segments({ before, after }: { before: string; after: string }) {
  return (
    <>
      {wordDiff(before, after).map((s, i) =>
        s.type === "same" ? (
          <span key={i}>{s.text}</span>
        ) : s.type === "add" ? (
          <ins key={i} style={{ background: "var(--color-vine-soft)", color: "var(--color-vine)", textDecoration: "none" }}>
            {s.text}
          </ins>
        ) : (
          <del key={i} style={{ background: "var(--color-alarm-soft)", color: "var(--color-alarm)" }}>
            {s.text}
          </del>
        ),
      )}
    </>
  );
}
