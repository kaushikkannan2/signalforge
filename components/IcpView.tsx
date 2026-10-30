"use client";

import { Citations, Confidence } from "./Confidence";
import type { IcpDefinition, IcpExpansion } from "@/lib/types";

function Field({
  label,
  confidence,
  rationale,
  children,
}: {
  label: string;
  confidence: number;
  rationale: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
      <div className="flex items-center justify-between gap-4 mb-1.5">
        <span className="rule-label">{label}</span>
        <Confidence value={confidence} rationale={rationale} compact />
      </div>
      <div style={{ fontSize: "0.875rem" }}>{children}</div>
      <p className="mt-1.5" style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)" }}>
        {rationale}
      </p>
    </div>
  );
}

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span
    className="inline-block px-2 py-0.5 rounded border mr-1.5 mb-1.5"
    style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem" }}
  >
    {children}
  </span>
);

export function IcpView({
  icp,
  expansions,
  onApprove,
  onDecideExpansion,
  busy,
}: {
  icp: IcpDefinition;
  expansions: IcpExpansion[];
  onApprove: () => void;
  onDecideExpansion: (id: string, decision: "accepted" | "adjusted" | "dismissed") => void;
  busy: boolean;
}) {
  const money = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(0)}M` : `$${(n / 1000).toFixed(0)}k`;

  return (
    <div className="flex flex-col gap-6">
      <section className="border rounded-lg bg-white" style={{ borderColor: "var(--color-rule)" }}>
        <header
          className="px-4 py-3 border-b flex items-start justify-between gap-4"
          style={{ borderColor: "var(--color-rule)" }}
        >
          <div>
            <h2 className="display" style={{ fontSize: "1.25rem" }}>
              Inferred ideal customer profile
            </h2>
            <p className="mono mt-0.5" style={{ color: "var(--color-ink-faint)" }}>
              {icp.id} · {icp.status}
            </p>
          </div>
          <div className="text-right shrink-0">
            <Confidence value={icp.overallConfidence} label="overall" />
            <p className="mt-1" style={{ fontSize: "0.6875rem", color: "var(--color-ink-faint)", maxWidth: "15rem" }}>
              Mean of every field. A low number here is the engine telling you the
              intake was thin, not that the profile is wrong.
            </p>
          </div>
        </header>

        <div className="px-4">
          <Field
            label="Target verticals (NAICS)"
            confidence={icp.industries.confidence}
            rationale={icp.industries.rationale}
          >
            {icp.industries.value.map((i) => (
              <Chip key={i.naics + i.name}>
                <span className="mono" style={{ color: "var(--color-ink-faint)" }}>
                  {i.naics}
                </span>{" "}
                {i.name}
              </Chip>
            ))}
          </Field>

          <Field
            label="Company size"
            confidence={icp.headcountRange.confidence}
            rationale={icp.headcountRange.rationale}
          >
            <span className="grid-surface">
              {icp.headcountRange.value.tierLabel} —{" "}
              <span className="mono">
                {icp.headcountRange.value.min}–{icp.headcountRange.value.max}
              </span>{" "}
              employees
            </span>
          </Field>

          <Field
            label="Revenue band"
            confidence={icp.revenueBand.confidence}
            rationale={icp.revenueBand.rationale}
          >
            <span className="grid-surface mono">
              {money(icp.revenueBand.value.min)} – {money(icp.revenueBand.value.max)}{" "}
              {icp.revenueBand.value.currency}
            </span>
          </Field>

          <Field
            label="Buyer personas"
            confidence={icp.personas.confidence}
            rationale={icp.personas.rationale}
          >
            <div className="scroll-x">
              <table className="w-full grid-surface" style={{ fontSize: "0.8125rem" }}>
                <thead>
                  <tr style={{ color: "var(--color-ink-faint)" }}>
                    <th className="text-left font-semibold pb-1 pr-3">Title</th>
                    <th className="text-left font-semibold pb-1 pr-3">Seniority</th>
                    <th className="text-left font-semibold pb-1">Measured on</th>
                  </tr>
                </thead>
                <tbody>
                  {icp.personas.value.map((p) => (
                    <tr key={p.title} className="border-t" style={{ borderColor: "var(--color-rule)" }}>
                      <td className="py-1.5 pr-3 align-top">{p.title}</td>
                      <td className="py-1.5 pr-3 align-top mono" style={{ color: "var(--color-ink-soft)" }}>
                        {p.seniority}
                      </td>
                      <td className="py-1.5 align-top" style={{ color: "var(--color-ink-soft)" }}>
                        {p.jobToBeDone}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Field>

          <Field
            label="Trigger events"
            confidence={icp.triggerEvents.confidence}
            rationale={icp.triggerEvents.rationale}
          >
            <div className="flex flex-col gap-2">
              {icp.triggerEvents.value
                .slice()
                .sort((a, b) => b.intentWeight - a.intentWeight)
                .map((t) => (
                  <div key={t.label} className="flex gap-2.5 items-start">
                    <span
                      className="mono shrink-0 px-1.5 py-0.5 rounded grid-surface"
                      style={{ background: "var(--color-signal-soft)", color: "var(--color-signal)" }}
                      title="Intent weight out of 30"
                    >
                      +{t.intentWeight}
                    </span>
                    <div>
                      <div>{t.label}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)" }}>
                        {t.buyingImplication}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </Field>

          <Field
            label="Negative signals — hard disqualifiers"
            confidence={icp.negativeSignals.confidence}
            rationale={icp.negativeSignals.rationale}
          >
            <ul className="flex flex-col gap-1">
              {icp.negativeSignals.value.map((n) => (
                <li key={n} className="flex gap-2 items-start">
                  <span style={{ color: "var(--color-alarm)" }}>✕</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </Field>

          <div className="py-3">
            <div className="flex items-center justify-between gap-4 mb-1.5">
              <span className="rule-label">Tech stack affinity</span>
              <Confidence
                value={icp.techStackAffinity.confidence}
                rationale={icp.techStackAffinity.rationale}
                compact
              />
            </div>
            <div>
              {icp.techStackAffinity.value.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          </div>
        </div>

        <footer
          className="px-4 py-3 border-t flex items-center justify-between gap-4"
          style={{ borderColor: "var(--color-rule)", background: "var(--color-paper)" }}
        >
          <p style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)", maxWidth: "34rem" }}>
            Discovery is gated on your approval. Nothing is searched for, enriched or
            drafted against an unapproved profile.
          </p>
          <button
            onClick={onApprove}
            disabled={busy || icp.status === "approved"}
            className="px-3.5 py-2 rounded font-medium disabled:opacity-50"
            style={{
              background: icp.status === "approved" ? "var(--color-vine-soft)" : "var(--color-vine)",
              color: icp.status === "approved" ? "var(--color-vine)" : "white",
              fontSize: "0.875rem",
            }}
          >
            {icp.status === "approved" ? "✓ Approved" : "Approve profile"}
          </button>
        </footer>
      </section>

      {expansions.length > 0 && (
        <section className="border rounded-lg bg-white" style={{ borderColor: "var(--color-rule)" }}>
          <header className="px-4 py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
            <h2 className="display" style={{ fontSize: "1.25rem" }}>
              Adjacent segments
            </h2>
            <p className="mt-0.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
              Markets conventional firmographic filtering would exclude. Each thesis was
              sent back out to live search, so you can check it rather than take it.
            </p>
          </header>

          <div className="divide-y" style={{ borderColor: "var(--color-rule)" }}>
            {expansions.map((e) => (
              <article key={e.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-4">
                  <h3 style={{ fontSize: "0.9375rem", fontWeight: 600 }}>{e.segmentName}</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="mono" style={{ color: "var(--color-ink-faint)" }}>
                      ~{e.estimatedAccountCount.toLocaleString()} accts
                    </span>
                    <Confidence value={e.confidence} compact />
                  </div>
                </div>
                <p className="mt-1.5" style={{ fontSize: "0.8125rem" }}>
                  {e.thesis}
                </p>
                <p
                  className="mt-1.5 pl-2.5 border-l-2"
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--color-ink-soft)",
                    borderColor: "var(--color-rule-strong)",
                  }}
                >
                  <span className="rule-label mr-1">Missed because</span>
                  {e.nonObviousBecause}
                </p>
                <div className="mt-2.5 flex items-center justify-between gap-3 flex-wrap">
                  <Citations evidence={e.evidence} />
                  {e.decision === "pending" ? (
                    <div className="flex gap-1.5">
                      {(["accepted", "adjusted", "dismissed"] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => onDecideExpansion(e.id, d)}
                          disabled={busy}
                          className="px-2.5 py-1 rounded border disabled:opacity-50"
                          style={{
                            borderColor: "var(--color-rule-strong)",
                            fontSize: "0.8125rem",
                            color:
                              d === "accepted"
                                ? "var(--color-tier-a)"
                                : d === "dismissed"
                                  ? "var(--color-alarm)"
                                  : "var(--color-ink-soft)",
                          }}
                        >
                          {d === "accepted" ? "Accept" : d === "adjusted" ? "Adjust" : "Dismiss"}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span
                      className="rule-label px-2 py-0.5 rounded"
                      style={{
                        background: e.decision === "dismissed" ? "var(--color-alarm-soft)" : "var(--color-vine-soft)",
                        color: e.decision === "dismissed" ? "var(--color-alarm)" : "var(--color-vine)",
                      }}
                    >
                      {e.decision}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
