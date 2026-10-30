"use client";

import { Citations, Confidence, TierBadge } from "./Confidence";
import type {
  Company,
  Lead,
  OutreachMessage,
  Person,
  Signal,
  StageTransition,
} from "@/lib/types";

/* ---------------------------------------------------------------------------
   Record detail, as a right-hand slide-over.

   The pattern is borrowed (Attio/Linear-style record panels); the content is
   the argument. One click from any row you get the full provenance of a
   record: which sources produced it, how the fit score was arithmetically
   arrived at, which resolution strategy produced the email and what that
   strategy can and cannot prove, every message drafted to the person, and the
   complete stage history with the actor on each transition.

   The point is that nothing in this product should require you to take its
   word for anything.
   --------------------------------------------------------------------------- */

const METHOD_NOTE: Record<string, string> = {
  hunter_verified: "A vendor confirmed this mailbox exists.",
  mx_validated_pattern:
    "Pattern inferred, then a real DNS MX lookup confirmed the domain accepts mail. This does not prove the mailbox exists — hence the capped confidence.",
  pattern_inferred: "Pattern only. The domain has no MX record, so this is a guess and is labelled as one.",
  manual: "Entered by hand.",
};

export function RecordDrawer({
  person,
  company,
  signals,
  messages,
  lead,
  onClose,
}: {
  person?: Person;
  company?: Company;
  signals: Signal[];
  messages: OutreachMessage[];
  lead?: Lead;
  onClose: () => void;
}) {
  if (!person && !company) return null;
  const e = person?.enrichment;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div style={{ flex: 1, background: "rgba(3,6,12,0.6)" }} />
      <aside
        onClick={(ev) => ev.stopPropagation()}
        className="h-full overflow-y-auto border-l shadow-lg"
        style={{
          width: "min(34rem, 92vw)",
          background: "var(--color-surface)",
          borderColor: "var(--color-rule-strong)",
        }}
      >
        <header
          className="sticky top-0 px-4 py-3 border-b flex items-start justify-between gap-3"
          style={{ borderColor: "var(--color-rule)", background: "var(--color-surface)" }}
        >
          <div className="min-w-0">
            <h2 className="display" style={{ fontSize: "1.1875rem" }}>
              {person?.fullName ?? company?.name}
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
              {person ? `${person.title} · ${company?.name ?? ""}` : company?.industry}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {company && <TierBadge tier={company.fit.tier} />}
            <button
              onClick={onClose}
              className="mono px-2 py-1 rounded border"
              style={{ borderColor: "var(--color-rule-strong)", color: "var(--color-ink-soft)" }}
            >
              esc
            </button>
          </div>
        </header>

        <div className="px-4 py-3 flex flex-col gap-5">
          {company && (
            <Section title="Fit score — the arithmetic">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="display" style={{ fontSize: "2rem", lineHeight: 1 }}>
                  {company.fit.total}
                </span>
                <span className="rule-label">/ 100</span>
                {company.disqualified && (
                  <span
                    className="rule-label px-1.5 py-0.5 rounded ml-auto"
                    style={{ background: "var(--color-alarm-soft)", color: "var(--color-alarm)" }}
                  >
                    disqualified
                  </span>
                )}
              </div>
              <table className="w-full grid-surface" style={{ fontSize: "0.8125rem" }}>
                <tbody>
                  {Object.entries(company.fit.components).map(([k, v]) => (
                    <tr key={k} className="border-t" style={{ borderColor: "var(--color-rule)" }}>
                      <td className="py-1" style={{ color: "var(--color-ink-soft)" }}>
                        {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                      </td>
                      <td className="py-1 text-right mono">+{v}</td>
                    </tr>
                  ))}
                  {company.fit.penalties.map((p) => (
                    <tr key={p.reason} className="border-t" style={{ borderColor: "var(--color-rule)" }}>
                      <td className="py-1" style={{ color: "var(--color-alarm)" }}>
                        {p.reason}
                      </td>
                      <td className="py-1 text-right mono" style={{ color: "var(--color-alarm)" }}>
                        −{p.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {company && (
            <Section title="Account">
              <Row label="Domain">
                <a href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer" className="mono">
                  {company.domain || "—"}
                </a>
              </Row>
              <Row label="NAICS">
                <span className="mono">{company.naics}</span> {company.industry}
              </Row>
              <Row label="Headcount">
                {company.headcount ? (
                  <span className="mono">{company.headcount}</span>
                ) : (
                  <span style={{ color: "var(--color-ink-faint)" }} title="Not stated in any source — scored as unknown rather than guessed">
                    unknown
                  </span>
                )}
              </Row>
              <Row label="HQ">{company.hqLocation ?? "—"}</Row>
              {company.techStack.length > 0 && <Row label="Stack">{company.techStack.join(", ")}</Row>}
              <Row label="Sources">
                <Citations evidence={company.evidence} />
              </Row>
            </Section>
          )}

          {person && (
            <Section title="Contact resolution">
              <Row label="Persona match">
                {person.matchedPersona ?? "—"}{" "}
                <Confidence value={person.personaMatchScore / 100} compact />
              </Row>
              <Row label="Email">
                {e?.email ? <span className="mono">{e.email}</span> : <span style={{ color: "var(--color-ink-faint)" }}>unresolved</span>}
              </Row>
              {e?.emailMethod && (
                <Row label="Method">
                  <span
                    className="rule-label px-1.5 py-0.5 rounded"
                    style={{
                      background:
                        e.emailMethod === "hunter_verified" ? "var(--color-vine-soft)" : "var(--color-signal-soft)",
                      color: e.emailMethod === "hunter_verified" ? "var(--color-vine)" : "var(--color-signal)",
                    }}
                  >
                    {e.emailMethod.replace(/_/g, " ")}
                  </span>{" "}
                  <Confidence value={e.emailConfidence} compact />
                </Row>
              )}
              {e?.emailMethod && (
                <p
                  className="pl-2.5 border-l-2 my-1.5"
                  style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)", borderColor: "var(--color-rule-strong)" }}
                >
                  {METHOD_NOTE[e.emailMethod]}
                </p>
              )}
              <Row label="MX record">
                {e?.mxValid ? (
                  <span className="mono" style={{ color: "var(--color-tier-a)" }}>
                    {e.mxRecords?.[0] ?? "present"}
                  </span>
                ) : (
                  <span className="mono" style={{ color: "var(--color-alarm)" }}>
                    none — domain cannot receive mail
                  </span>
                )}
              </Row>
              <Row label="Deliverability">{e?.deliverability ?? "unknown"}</Row>
              {e?.linkedinUrl && (
                <Row label="LinkedIn">
                  <a href={e.linkedinUrl} target="_blank" rel="noopener noreferrer" className="mono">
                    profile ↗
                  </a>
                </Row>
              )}
              {person.previousEmployers.length > 0 && (
                <Row label="Previously">{person.previousEmployers.join(", ")}</Row>
              )}
              {person.education.length > 0 && <Row label="Studied">{person.education.join(", ")}</Row>}
              <Row label="Sources">
                <Citations evidence={person.evidence} />
              </Row>
            </Section>
          )}

          {signals.length > 0 && (
            <Section title={`Buying signals (${signals.length})`}>
              {signals.map((s) => (
                <div key={s.id} className="py-1.5 border-t" style={{ borderColor: "var(--color-rule)" }}>
                  <div className="flex items-start gap-2">
                    <span
                      className="mono shrink-0 px-1.5 rounded grid-surface"
                      style={{ background: "var(--color-signal-soft)", color: "var(--color-signal)" }}
                    >
                      +{s.intentWeight}
                    </span>
                    <div className="min-w-0">
                      <p style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{s.headline}</p>
                      <p style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)" }}>{s.detail}</p>
                      <div className="mt-1">
                        <Citations evidence={s.evidence} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {messages.length > 0 && (
            <Section title={`Outreach (${messages.length})`}>
              {messages
                .slice()
                .sort((a, b) => a.touch - b.touch)
                .map((m) => (
                  <div key={m.id} className="py-2 border-t" style={{ borderColor: "var(--color-rule)" }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rule-label">
                        touch {m.touch} · {m.channel}
                      </span>
                      <span className="mono" style={{ fontSize: "0.625rem", color: "var(--color-ink-faint)" }}>
                        {m.variant} · {m.wordCount}w
                      </span>
                      <span
                        className="rule-label px-1.5 rounded ml-auto"
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
                    {m.subject && <p style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{m.subject}</p>}
                    <p
                      className="whitespace-pre-wrap mt-0.5"
                      style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)" }}
                    >
                      {m.body}
                    </p>
                    <p className="mono mt-1" style={{ fontSize: "0.625rem", color: "var(--color-ink-faint)" }}>
                      {m.signalsUsed.length
                        ? `grounded in ${m.signalsUsed.length} cited signal(s)`
                        : "no cited signal — flagged generic"}
                      {m.review && ` · reviewer ${m.review.factChecksPassed ? "passed" : "flagged"}`}
                    </p>
                  </div>
                ))}
            </Section>
          )}

          {lead && (
            <Section title="Stage history">
              {lead.history.map((h: StageTransition) => (
                <div
                  key={h.id}
                  className="py-1.5 border-t flex items-start gap-2"
                  style={{ borderColor: "var(--color-rule)" }}
                >
                  <span
                    className="rule-label px-1 rounded shrink-0"
                    style={{
                      background: h.actor === "ai_agent" ? "var(--color-bridge-soft)" : h.actor === "sales_rep" ? "var(--color-person-soft)" : "rgba(100,116,139,0.16)",
                      color: h.actor === "ai_agent" ? "var(--color-bridge)" : h.actor === "sales_rep" ? "var(--color-person)" : "var(--color-ink-soft)",
                    }}
                  >
                    {h.actor === "ai_agent" ? "AI" : h.actor === "sales_rep" ? "Rep" : "Sys"}
                  </span>
                  <div className="min-w-0">
                    <p style={{ fontSize: "0.8125rem" }}>
                      <span className="mono">{h.from ?? "—"}</span> →{" "}
                      <span className="mono" style={{ fontWeight: 600 }}>
                        {h.to}
                      </span>
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)" }}>
                      {h.actorName} · {h.reason}
                    </p>
                    <p className="mono" style={{ fontSize: "0.625rem", color: "var(--color-ink-faint)" }}>
                      {new Date(h.at).toLocaleString("en-GB", { hour12: false })}
                    </p>
                  </div>
                </div>
              ))}
            </Section>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="rule-label mb-1.5">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-1" style={{ gridTemplateColumns: "7.5rem 1fr", fontSize: "0.8125rem" }}>
      <span style={{ color: "var(--color-ink-faint)" }}>{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
