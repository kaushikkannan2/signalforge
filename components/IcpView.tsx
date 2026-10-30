"use client";

import { useState } from "react";
import { Citations, Confidence, ConfidenceDial } from "./Confidence";
import type { IcpDefinition, IcpExpansion } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The profile, with the friction taken out.

   The previous version showed eight scored fields, each with a rationale
   paragraph, all expanded, all at once. That is a wall of text a founder has
   to read before they can agree or disagree with any of it — and the thing
   they actually need to do is agree or disagree.

   So: ONE verifiable sentence first. Then the eight fields grouped into the
   same three units the inference actually ran in, collapsed. Rationales
   behind a "why" toggle rather than always on.

   Nothing is hidden — every field and every rationale is one click away. The
   change is what you see *by default*, which is the difference between a
   document and an interface.
   --------------------------------------------------------------------------- */

const Chip = ({ children, tone }: { children: React.ReactNode; tone?: string }) => (
  <span
    className="inline-block px-2 py-0.5 rounded-md mr-1.5 mb-1.5"
    style={{
      border: `1px solid ${tone ?? "var(--color-rule-strong)"}`,
      color: tone ?? "var(--color-ink)",
      fontSize: "0.8125rem",
      background: "var(--color-surface-2)",
    }}
  >
    {children}
  </span>
);

/**
 * The reasoning behind a field.
 *
 * Framed as "how this was inferred" rather than "why?" on purpose: the first
 * invites someone who wants to understand the method, the second only invites
 * someone who already suspects it is wrong. Most people opening this are
 * learning how the engine thinks, and that is a feature worth inviting.
 */
function Reasoning({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="mono inline-flex items-center gap-1"
        style={{ fontSize: "0.5625rem", color: open ? "var(--color-ember)" : "var(--color-ink-faint)" }}
      >
        <span>{open ? "\u2212" : "+"}</span>
        how this was inferred
      </button>
      {open && (
        <p
          className="mt-1 pl-2.5 border-l-2"
          style={{
            fontSize: "0.75rem",
            color: "var(--color-ink-soft)",
            borderColor: "var(--color-rule-strong)",
            lineHeight: 1.5,
          }}
        >
          {text}
        </p>
      )}
    </>
  );
}

function Group({
  title,
  preview,
  confidence,
  defaultOpen = false,
  children,
}: {
  title: string;
  preview: string;
  confidence: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t" style={{ borderColor: "var(--color-rule)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center gap-3 text-left row-hover"
      >
        <span className="mono shrink-0" style={{ fontSize: "0.625rem", color: "var(--color-ink-faint)" }}>
          {open ? "▾" : "▸"}
        </span>
        <span className="rule-label shrink-0" style={{ width: "9.5rem" }}>
          {title}
        </span>
        {!open && (
          <span
            className="truncate"
            style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)", flex: 1 }}
          >
            {preview}
          </span>
        )}
        <span className="ml-auto shrink-0">
          <Confidence value={confidence} compact />
        </span>
      </button>
      {open && <div className="px-4 pb-3.5 pl-[3.6rem] flex flex-col gap-3.5">{children}</div>}
    </section>
  );
}

function Field({
  label,
  rationale,
  children,
}: {
  label: string;
  rationale: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="rule-label" style={{ fontSize: "0.5625rem" }}>
        {label}
      </span>
      <div className="mt-1" style={{ fontSize: "0.875rem" }}>
        {children}
      </div>
      <div className="mt-1">
        <Reasoning text={rationale} />
      </div>
    </div>
  );
}

export function IcpView({
  icp,
  summary,
  expansions,
  expansionPending,
  onApprove,
  onDecideExpansion,
  onClarify,
  busy,
}: {
  icp: IcpDefinition;
  summary?: string;
  expansions: IcpExpansion[];
  expansionPending?: boolean;
  onApprove: () => void;
  onDecideExpansion: (id: string, decision: "accepted" | "adjusted" | "dismissed") => void;
  onClarify?: () => void;
  busy: boolean;
}) {
  const money = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(0)}M` : `$${(n / 1000).toFixed(0)}k`;
  const triggers = icp.triggerEvents.value.slice().sort((a, b) => b.intentWeight - a.intentWeight);
  const approved = icp.status === "approved";

  const groupConfidence = (...vals: number[]) =>
    Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));

  return (
    <div className="flex flex-col gap-5">
      <section className="surface overflow-hidden">
        {/* --- the one sentence --- */}
        <div
          className="px-5 py-4 flex items-start gap-5 flex-wrap"
          style={{ background: "linear-gradient(180deg, rgba(255,122,69,0.06), transparent)" }}
        >
          <div style={{ flex: 1, minWidth: "20rem" }}>
            <span className="rule-label">Inferred profile</span>
            <p
              className="display mt-1.5"
              style={{ fontSize: "1.3125rem", lineHeight: 1.35, color: "var(--color-ink)" }}
            >
              {summary ?? "Profile inferred."}
            </p>
            <p className="mt-2" style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)" }}>
              One sentence to check. Open any section below to see the fields and how each
              was inferred.
            </p>
          </div>
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <ConfidenceDial value={icp.overallConfidence} size={84} />
            {icp.overallConfidence < 0.65 && onClarify && (
              <button
                onClick={onClarify}
                disabled={busy}
                className="btn-ghost px-2.5 py-1 rounded-md disabled:opacity-40"
                style={{ fontSize: "0.75rem" }}
                title="The engine asks about its own weakest fields, then re-infers"
              >
                Raise it →
              </button>
            )}
          </div>
        </div>

        {/* --- detail, collapsed, grouped as the inference actually ran --- */}
        <Group
          title="Who to target"
          confidence={groupConfidence(
            icp.industries.confidence,
            icp.headcountRange.confidence,
            icp.revenueBand.confidence,
            icp.geographies.confidence,
          )}
          preview={`${icp.industries.value.map((i) => i.name).join(", ")} · ${icp.headcountRange.value.tierLabel}`}
        >
          <Field label="Verticals (NAICS)" rationale={icp.industries.rationale}>
            {icp.industries.value.map((i) => (
              <Chip key={i.naics + i.name}>
                <span className="mono" style={{ color: "var(--color-ink-faint)" }}>
                  {i.naics}
                </span>{" "}
                {i.name}
              </Chip>
            ))}
          </Field>
          <Field label="Size" rationale={icp.headcountRange.rationale}>
            <span className="grid-surface">
              {icp.headcountRange.value.tierLabel} ·{" "}
              <span className="mono">
                {icp.headcountRange.value.min}–{icp.headcountRange.value.max}
              </span>{" "}
              employees · {money(icp.revenueBand.value.min)}–{money(icp.revenueBand.value.max)} revenue
            </span>
          </Field>
          <Field label="Geographies" rationale={icp.geographies.rationale}>
            {icp.geographies.value.map((g) => (
              <Chip key={g}>{g}</Chip>
            ))}
          </Field>
        </Group>

        <Group
          title="Who to reach, when"
          confidence={groupConfidence(icp.personas.confidence, icp.triggerEvents.confidence)}
          preview={`${icp.personas.value.map((p) => p.title).join(", ")} · ${triggers.length} triggers`}
        >
          <Field label="Buyer personas" rationale={icp.personas.rationale}>
            {/*
              Grid, not flex. As a flex row the seniority badge and the title
              both varied in width, so "measured on…" started at a different x
              on every line and the column read as a ragged mess. Fixed columns
              give the three fields a shared left edge.
            */}
            <div className="flex flex-col gap-1.5">
              {icp.personas.value.map((p) => (
                <div
                  key={p.title}
                  className="grid items-baseline gap-x-3"
                  style={{ gridTemplateColumns: "4.5rem minmax(9rem, 12rem) 1fr" }}
                >
                  <span
                    className="rule-label rounded text-center"
                    style={{
                      background: "var(--color-steel-soft)",
                      color: "var(--color-steel-blue)",
                      fontSize: "0.5625rem",
                      padding: "0.125rem 0",
                    }}
                  >
                    {p.seniority}
                  </span>
                  <span style={{ fontWeight: 600, lineHeight: 1.4 }}>{p.title}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)", lineHeight: 1.45 }}>
                    measured on {p.jobToBeDone.charAt(0).toLowerCase()}
                    {p.jobToBeDone.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          </Field>
          <Field label="Trigger events — ranked by predictive weight" rationale={icp.triggerEvents.rationale}>
            {/* "+8" and "+16" differ by a digit, so a shrink-to-fit pill
                shifted every label. Fixed column, right-aligned figure. */}
            <div className="flex flex-col gap-1.5">
              {triggers.map((t) => (
                <div
                  key={t.label}
                  className="grid items-baseline gap-x-2.5"
                  style={{ gridTemplateColumns: "2.5rem 1fr" }}
                >
                  <span
                    className="mono rounded grid-surface text-center"
                    style={{
                      background: "var(--color-molten-soft)",
                      color: "var(--color-molten)",
                      padding: "0.0625rem 0",
                    }}
                    title={`Intent weight out of 30 — ${t.buyingImplication}`}
                  >
                    +{t.intentWeight}
                  </span>
                  <span style={{ lineHeight: 1.45 }}>
                    {t.label}
                    <span style={{ color: "var(--color-ink-faint)" }}> — {t.buyingImplication}</span>
                  </span>
                </div>
              ))}
            </div>
          </Field>
        </Group>

        <Group
          title="What to exclude"
          confidence={groupConfidence(icp.negativeSignals.confidence, icp.techStackAffinity.confidence)}
          preview={`${icp.negativeSignals.value.length} hard disqualifiers · ${icp.techStackAffinity.value.length} stack signals`}
        >
          <Field label="Hard disqualifiers" rationale={icp.negativeSignals.rationale}>
            <ul className="flex flex-col gap-1">
              {icp.negativeSignals.value.map((n) => (
                <li
                  key={n}
                  className="grid items-baseline gap-x-2"
                  style={{ gridTemplateColumns: "1rem 1fr" }}
                >
                  <span className="text-center" style={{ color: "var(--color-quench)" }}>
                    ✕
                  </span>
                  <span style={{ lineHeight: 1.45 }}>{n}</span>
                </li>
              ))}
            </ul>
          </Field>
          <Field label="Tech stack affinity" rationale={icp.techStackAffinity.rationale}>
            {icp.techStackAffinity.value.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </Field>
        </Group>

        <footer
          className="px-5 py-3 border-t flex items-center justify-between gap-4"
          style={{ borderColor: "var(--color-rule)", background: "var(--color-surface-2)" }}
        >
          <p style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)", maxWidth: "30rem" }}>
            Nothing is searched, enriched or drafted against an unapproved profile.
          </p>
          <button
            onClick={onApprove}
            disabled={busy || approved}
            className={`${approved ? "btn-ghost" : "btn-primary"} px-4 py-2 rounded-md disabled:opacity-60 shrink-0`}
            style={{ fontSize: "0.875rem" }}
          >
            {approved ? "✓ Approved" : "Approve & find accounts"}
          </button>
        </footer>
      </section>

      {/* --- adjacent segments --- */}
      {(expansions.length > 0 || expansionPending) && (
        <section className="surface">
          <header className="px-4 py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="display" style={{ fontSize: "1.125rem" }}>
                Adjacent segments
              </h2>
              {expansionPending && expansions.length === 0 && (
                <span className="mono" style={{ fontSize: "0.625rem", color: "var(--color-molten)" }}>
                  still searching…
                </span>
              )}
            </div>
            <p className="mt-0.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
              Markets standard filtering would exclude. Each thesis was re-searched, so you can
              check it rather than take it.
            </p>
          </header>

          <div className="divide-y" style={{ borderColor: "var(--color-rule)" }}>
            {expansions.map((e) => (
              <article key={e.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <h3 style={{ fontSize: "0.9375rem", fontWeight: 600 }}>{e.segmentName}</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="mono grid-surface text-right"
                      style={{ color: "var(--color-ink-faint)", fontSize: "0.6875rem", minWidth: "3.5rem" }}
                    >
                      ~{e.estimatedAccountCount.toLocaleString()}
                    </span>
                    <Confidence value={e.confidence} compact />
                  </div>
                </div>
                <p
                  className="mt-1 pl-2.5 border-l-2"
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--color-ink-soft)",
                    borderColor: "var(--color-amethyst)",
                  }}
                >
                  <span className="rule-label mr-1" style={{ fontSize: "0.5625rem" }}>
                    missed because
                  </span>
                  {e.nonObviousBecause}
                </p>
                <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                  <Citations evidence={e.evidence} />
                  {e.decision === "pending" ? (
                    <div className="flex gap-1.5">
                      {(["accepted", "adjusted", "dismissed"] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => onDecideExpansion(e.id, d)}
                          disabled={busy}
                          className="px-2.5 py-1 rounded-md border disabled:opacity-50"
                          style={{
                            borderColor: "var(--color-rule-strong)",
                            fontSize: "0.8125rem",
                            background: "var(--color-surface-2)",
                            color:
                              d === "accepted"
                                ? "var(--color-tempered)"
                                : d === "dismissed"
                                  ? "var(--color-quench)"
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
                        background:
                          e.decision === "dismissed" ? "var(--color-quench-soft)" : "var(--color-tempered-soft)",
                        color: e.decision === "dismissed" ? "var(--color-quench)" : "var(--color-tempered)",
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
