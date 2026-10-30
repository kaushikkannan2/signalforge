"use client";

import { LEAD_STAGES, type Actor, type Company, type Lead, type LeadStage, type Person } from "@/lib/types";
import { TierBadge } from "./Confidence";

const STAGE_LABEL: Record<LeadStage, string> = {
  matched: "Matched",
  contacted: "Contacted",
  replied: "Replied",
  meeting_booked: "Meeting booked",
  closed_won: "Closed won",
  closed_lost: "Closed/Lost",
};

const ACTOR_BADGE: Record<Actor, { label: string; bg: string; fg: string }> = {
  ai_agent: { label: "AI", bg: "var(--color-bridge-soft)", fg: "var(--color-bridge)" },
  sales_rep: { label: "Rep", bg: "var(--color-person-soft)", fg: "var(--color-person)" },
  system: { label: "Sys", bg: "rgba(100,116,139,0.16)", fg: "var(--color-ink-soft)" },
};

/** Kanban with drag between stages. A rep dragging a card is attributed as a rep action. */
export function PipelineBoard({
  leads,
  people,
  companies,
  onMove,
}: {
  leads: Lead[];
  people: Person[];
  companies: Company[];
  onMove: (personId: string, to: LeadStage) => void;
}) {
  if (!leads.length) return null;
  const personOf = (id: string) => people.find((p) => p.id === id);
  const companyOf = (id: string) => companies.find((c) => c.id === id);

  return (
    <section className="surface" style={{ borderColor: "var(--color-rule)" }}>
      <header className="px-4 py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
        <h2 className="display" style={{ fontSize: "1.25rem" }}>
          Pipeline
        </h2>
        <p className="mt-0.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
          Drag a card to move it. Every transition records who moved it — the badge on each
          card is the last actor, and the full history is in the tooltip.
        </p>
      </header>

      <div className="scroll-x px-4 py-3">
        <div className="flex gap-3" style={{ minWidth: "64rem" }}>
          {LEAD_STAGES.map((stage) => {
            const inStage = leads.filter((l) => l.stage === stage);
            return (
              <div
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const personId = e.dataTransfer.getData("text/plain");
                  if (personId) onMove(personId, stage);
                }}
                className="flex-1 rounded-lg border p-2"
                style={{
                  borderColor: "var(--color-rule)",
                  background: "rgba(23,30,42,0.6)",
                  minWidth: "10rem",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="rule-label">{STAGE_LABEL[stage]}</span>
                  <span className="mono" style={{ color: "var(--color-ink-faint)" }}>
                    {inStage.length}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {inStage.map((lead) => {
                    const person = personOf(lead.personId);
                    const company = companyOf(lead.companyId);
                    const badge = ACTOR_BADGE[lead.owner.actor];
                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.personId)}
                        title={lead.history
                          .map(
                            (h) =>
                              `${h.from ?? "—"} → ${h.to}  [${h.actor === "ai_agent" ? "AI" : h.actor === "sales_rep" ? "Rep" : "Sys"}: ${h.actorName}]  ${h.reason}`,
                          )
                          .join("\n")}
                        className="surface-flat p-2 cursor-grab active:cursor-grabbing relative overflow-hidden"
                        style={{
                          borderColor: "var(--color-rule)",
                          boxShadow: `inset 3px 0 0 ${
                            lead.tier === "A"
                              ? "var(--color-tier-a)"
                              : lead.tier === "B"
                                ? "var(--color-tier-b)"
                                : "var(--color-tier-c)"
                          }`,
                        }}
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-1">
                          <TierBadge tier={lead.tier} />
                          <span
                            className="rule-label px-1 rounded"
                            style={{ background: badge.bg, color: badge.fg }}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <p style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{person?.fullName}</p>
                        <p style={{ fontSize: "0.6875rem", color: "var(--color-ink-soft)" }}>
                          {person?.title}
                        </p>
                        <p className="mono" style={{ fontSize: "0.6875rem", color: "var(--color-ink-faint)" }}>
                          {company?.name} · fit {lead.fitScore}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

interface AnalyticsData {
  funnel: { stage: LeadStage; count: number; stepConversion: number | null }[];
  attribution: { counts: Record<Actor, number>; sharePct: Record<Actor, number>; total: number };
  variants: {
    variant: string;
    channel: string;
    drafted: number;
    approved: number;
    rejected: number;
    sent: number;
    approvalRatePct: number | null;
    replyRatePct: number | null;
  }[];
  byIndustry: { industry: string; leads: number; contacted: number; replied: number }[];
  byTier: { tier: string; leads: number; contacted: number; replied: number; meetings: number }[];
}

export function Analytics({ data }: { data: AnalyticsData }) {
  const max = Math.max(1, ...data.funnel.map((f) => f.count));
  return (
    <section className="surface" style={{ borderColor: "var(--color-rule)" }}>
      <header className="px-4 py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
        <h2 className="display" style={{ fontSize: "1.25rem" }}>
          Conversion &amp; attribution
        </h2>
        <p className="mt-0.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
          Step conversion, not conversion-from-top — the number next to each stage is the
          share that made it from the stage immediately before.
        </p>
      </header>

      <div className="px-4 py-3 grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <span className="rule-label">Funnel</span>
          <div className="mt-2 flex flex-col gap-1.5">
            {data.funnel.map((f) => (
              <div key={f.stage} className="grid items-center gap-2" style={{ gridTemplateColumns: "7.5rem 1fr 3.5rem" }}>
                <span style={{ fontSize: "0.75rem" }}>{STAGE_LABEL[f.stage]}</span>
                <div
                  className="relative rounded-md overflow-hidden"
                  style={{ height: 20, background: "var(--color-surface-2)" }}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-md"
                    style={{
                      width: `${(f.count / max) * 100}%`,
                      background: "linear-gradient(90deg, rgba(52,211,153,0.9), rgba(56,189,248,0.75))",
                      boxShadow: "0 0 12px rgba(52,211,153,0.3)",
                      transition: "width 700ms cubic-bezier(0.16,1,0.3,1)",
                    }}
                  />
                </div>
                <span className="mono grid-surface" style={{ fontSize: "0.75rem" }}>
                  {f.count}
                  {f.stepConversion !== null && (
                    <span style={{ color: "var(--color-ink-faint)" }}> · {f.stepConversion}%</span>
                  )}
                </span>
              </div>
            ))}
          </div>

          <span className="rule-label block mt-4">Who moved the pipeline</span>
          <div className="mt-2 flex flex-col gap-1">
            {(["ai_agent", "sales_rep", "system"] as Actor[]).map((a) => (
              <div key={a} className="flex items-center justify-between" style={{ fontSize: "0.8125rem" }}>
                <span
                  className="rule-label px-1.5 py-0.5 rounded"
                  style={{ background: ACTOR_BADGE[a].bg, color: ACTOR_BADGE[a].fg }}
                >
                  {a === "ai_agent" ? "AI agent" : a === "sales_rep" ? "Sales rep" : "System"}
                </span>
                <span className="mono grid-surface">
                  {data.attribution.counts[a]} · {data.attribution.sharePct[a]}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="rule-label">A/B variants</span>
          <table className="w-full mt-2 grid-surface" style={{ fontSize: "0.75rem" }}>
            <thead>
              <tr style={{ color: "var(--color-ink-faint)" }}>
                <th className="text-left font-semibold pb-1">Variant</th>
                <th className="text-left font-semibold pb-1">Ch</th>
                <th className="text-right font-semibold pb-1">Draft</th>
                <th className="text-right font-semibold pb-1">Appr</th>
                <th className="text-right font-semibold pb-1">Rej</th>
                <th className="text-right font-semibold pb-1">Appr %</th>
              </tr>
            </thead>
            <tbody>
              {data.variants.map((v) => (
                <tr key={v.variant + v.channel} className="border-t" style={{ borderColor: "var(--color-rule)" }}>
                  <td className="py-1">{v.variant}</td>
                  <td className="py-1 mono">{v.channel.slice(0, 2)}</td>
                  <td className="py-1 text-right mono">{v.drafted}</td>
                  <td className="py-1 text-right mono">{v.approved}</td>
                  <td className="py-1 text-right mono">{v.rejected}</td>
                  <td className="py-1 text-right mono">{v.approvalRatePct ?? "—"}</td>
                </tr>
              ))}
              {!data.variants.length && (
                <tr>
                  <td colSpan={6} className="py-2" style={{ color: "var(--color-ink-faint)" }}>
                    No messages drafted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <span className="rule-label block mt-4">By tier</span>
          <table className="w-full mt-2 grid-surface" style={{ fontSize: "0.75rem" }}>
            <thead>
              <tr style={{ color: "var(--color-ink-faint)" }}>
                <th className="text-left font-semibold pb-1">Tier</th>
                <th className="text-right font-semibold pb-1">Leads</th>
                <th className="text-right font-semibold pb-1">Contacted</th>
                <th className="text-right font-semibold pb-1">Replied</th>
                <th className="text-right font-semibold pb-1">Meetings</th>
              </tr>
            </thead>
            <tbody>
              {data.byTier.map((t) => (
                <tr key={t.tier} className="border-t" style={{ borderColor: "var(--color-rule)" }}>
                  <td className="py-1">Tier {t.tier}</td>
                  <td className="py-1 text-right mono">{t.leads}</td>
                  <td className="py-1 text-right mono">{t.contacted}</td>
                  <td className="py-1 text-right mono">{t.replied}</td>
                  <td className="py-1 text-right mono">{t.meetings}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.byIndustry.length > 0 && (
            <>
              <span className="rule-label block mt-4">By industry</span>
              <table className="w-full mt-2 grid-surface" style={{ fontSize: "0.75rem" }}>
                <tbody>
                  {data.byIndustry.slice(0, 5).map((r) => (
                    <tr key={r.industry} className="border-t" style={{ borderColor: "var(--color-rule)" }}>
                      <td className="py-1">{r.industry}</td>
                      <td className="py-1 text-right mono">{r.leads} leads</td>
                      <td className="py-1 text-right mono">{r.contacted} contacted</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function GraphInsights({
  results,
}: {
  results: {
    queryName: string;
    question: string;
    cypher: string;
    tookMs: number;
    findings: { headline: string; explanation: string; actionable: string; strength: number }[];
  }[];
}) {
  if (!results.length) return null;
  return (
    <section className="surface" style={{ borderColor: "var(--color-rule)" }}>
      <header className="px-4 py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
        <h2 className="display" style={{ fontSize: "1.25rem" }}>
          Graph reasoning
        </h2>
        <p className="mt-0.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
          Multi-hop questions a relational schema makes painful. The Cypher shown is the
          real query, kept adjacent to the traversal so the two cannot drift.
        </p>
      </header>
      <div className="divide-y" style={{ borderColor: "var(--color-rule)" }}>
        {results.map((r) => (
          <div key={r.queryName} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h3 className="mono" style={{ fontWeight: 600 }}>
                {r.queryName}
              </h3>
              <span className="mono" style={{ color: "var(--color-ink-faint)", fontSize: "0.6875rem" }}>
                {r.findings.length} findings · {r.tookMs}ms
              </span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>{r.question}</p>
            <details className="mt-1.5">
              <summary className="mono cursor-pointer" style={{ fontSize: "0.6875rem", color: "var(--color-ink-faint)" }}>
                show Cypher
              </summary>
              <pre
                className="mono mt-1 p-2 rounded border scroll-x"
                style={{
                  borderColor: "var(--color-rule)",
                  background: "var(--color-surface-2)",
                  fontSize: "0.6875rem",
                }}
              >
                {r.cypher}
              </pre>
            </details>
            {r.findings.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-2">
                {r.findings.slice(0, 4).map((f) => (
                  <li key={f.headline} className="pl-2.5 border-l-2" style={{ borderColor: "var(--color-vine)" }}>
                    <p style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{f.headline}</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)" }}>{f.explanation}</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--color-vine)" }}>→ {f.actionable}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1" style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)" }}>
                No paths found. Reported as empty rather than padded with weak matches.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
