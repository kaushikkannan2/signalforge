"use client";

import { useState } from "react";
import { Citations, TierBadge } from "./Confidence";
import type { Company, Signal } from "@/lib/types";

/**
 * The dense operating surface. A spreadsheet is what a rep actually wants
 * here, so the design concedes that and makes the dense thing good: tabular
 * numerals, score arithmetic exposed on hover, citations inline on every row,
 * and disqualified accounts shown struck-through rather than hidden — the
 * operator needs to see what was filtered out and why.
 */
export function AccountGrid({
  companies,
  signals,
  selectedId,
  onSelect,
}: {
  companies: Company[];
  signals: Signal[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const [showDisqualified, setShowDisqualified] = useState(true);

  const sorted = companies
    .slice()
    .sort((a, b) => Number(a.disqualified) - Number(b.disqualified) || b.fit.total - a.fit.total);
  const visible = showDisqualified ? sorted : sorted.filter((c) => !c.disqualified);
  const dqCount = companies.filter((c) => c.disqualified).length;

  return (
    <section className="border rounded-lg bg-white" style={{ borderColor: "var(--color-rule)" }}>
      <header
        className="px-4 py-3 border-b flex items-center justify-between gap-4 flex-wrap"
        style={{ borderColor: "var(--color-rule)" }}
      >
        <div>
          <h2 className="display" style={{ fontSize: "1.25rem" }}>
            Discovered accounts
          </h2>
          <p className="mt-0.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
            {companies.filter((c) => !c.disqualified).length} qualified ·{" "}
            {companies.filter((c) => c.fit.tier === "A").length} Tier A · {dqCount} disqualified.
            Every row carries its sources; a row with none cannot exist.
          </p>
        </div>
        {dqCount > 0 && (
          <button
            onClick={() => setShowDisqualified((v) => !v)}
            className="mono px-2.5 py-1.5 rounded border shrink-0"
            style={{ borderColor: "var(--color-rule-strong)", color: "var(--color-ink-soft)" }}
          >
            {showDisqualified ? "hide" : "show"} disqualified ({dqCount})
          </button>
        )}
      </header>

      <div className="scroll-x">
        <table className="w-full grid-surface" style={{ fontSize: "0.8125rem", minWidth: "60rem" }}>
          <thead>
            <tr
              className="border-b"
              style={{ borderColor: "var(--color-rule)", color: "var(--color-ink-faint)" }}
            >
              <th className="text-right font-semibold px-3 py-2 w-16">Fit</th>
              <th className="text-left font-semibold px-2 py-2 w-16">Tier</th>
              <th className="text-left font-semibold px-2 py-2">Account</th>
              <th className="text-left font-semibold px-2 py-2 w-28">NAICS</th>
              <th className="text-right font-semibold px-2 py-2 w-20">Headcount</th>
              <th className="text-left font-semibold px-2 py-2 w-36">HQ</th>
              <th className="text-left font-semibold px-2 py-2 w-20">Signals</th>
              <th className="text-left font-semibold px-3 py-2 w-40">Sources</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => {
              const mine = signals.filter((s) => s.companyId === c.id);
              const comp = c.fit.components;
              const arithmetic = `industry ${comp.industryMatch} + size ${comp.sizeMatch} + geo ${comp.geoMatch} + tech ${comp.techStackMatch} + intent ${comp.intentSignals}${
                c.fit.penalties.length
                  ? ` − ${c.fit.penalties.reduce((s, p) => s + p.points, 0)} (${c.fit.penalties.map((p) => p.reason).join("; ")})`
                  : ""
              } = ${c.fit.total}`;
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect?.(c.id)}
                  className="border-b cursor-pointer hover:bg-[var(--color-paper)]"
                  style={{
                    borderColor: "var(--color-rule)",
                    background: selectedId === c.id ? "var(--color-vine-soft)" : undefined,
                    opacity: c.disqualified ? 0.55 : 1,
                  }}
                >
                  <td className="px-3 py-2 text-right align-top">
                    <span className="mono font-semibold" title={arithmetic}>
                      {c.fit.total}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <TierBadge tier={c.fit.tier} />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-medium"
                        style={{ textDecoration: c.disqualified ? "line-through" : undefined }}
                      >
                        {c.name}
                      </span>
                      {c.domain && (
                        <a
                          href={`https://${c.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mono no-underline"
                          style={{ color: "var(--color-ink-faint)" }}
                        >
                          {c.domain}
                        </a>
                      )}
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)", maxWidth: "30rem" }}>
                      {c.description}
                    </p>
                    {c.disqualified && (
                      <p
                        className="mt-1 px-1.5 py-0.5 rounded inline-block"
                        style={{
                          background: "var(--color-alarm-soft)",
                          color: "var(--color-alarm)",
                          fontSize: "0.6875rem",
                        }}
                      >
                        Disqualified — {c.disqualificationReason}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top mono" style={{ color: "var(--color-ink-soft)" }}>
                    {c.naics}
                  </td>
                  <td
                    className="px-2 py-2 align-top text-right mono"
                    style={{ color: c.headcount ? undefined : "var(--color-ink-faint)" }}
                    title={c.headcount ? undefined : "Not stated in any source — scored as unknown, not guessed"}
                  >
                    {c.headcount ?? "—"}
                  </td>
                  <td className="px-2 py-2 align-top" style={{ color: "var(--color-ink-soft)" }}>
                    {c.hqLocation ?? "—"}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {mine.length ? (
                      <span
                        className="mono px-1.5 py-0.5 rounded"
                        style={{ background: "var(--color-signal-soft)", color: "var(--color-signal)" }}
                        title={mine.map((s) => `+${s.intentWeight} ${s.headline}`).join("\n")}
                      >
                        {mine.length} · +{mine.reduce((s, x) => s + x.intentWeight, 0)}
                      </span>
                    ) : (
                      <span className="mono" style={{ color: "var(--color-ink-faint)" }}>
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Citations evidence={c.evidence} />
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--color-ink-faint)" }}>
                  No accounts yet. Approve an ICP and run discovery.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SignalFeed({ signals, companies }: { signals: Signal[]; companies: Company[] }) {
  if (!signals.length) return null;
  const nameOf = (id: string) => companies.find((c) => c.id === id)?.name ?? id;
  return (
    <section className="border rounded-lg bg-white" style={{ borderColor: "var(--color-rule)" }}>
      <header className="px-4 py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
        <h2 className="display" style={{ fontSize: "1.25rem" }}>
          Buying signals
        </h2>
        <p className="mt-0.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
          Specific dated events, not characteristics. Each one is what the outreach copy
          will actually quote.
        </p>
      </header>
      <ul className="divide-y" style={{ borderColor: "var(--color-rule)" }}>
        {signals
          .slice()
          .sort((a, b) => b.intentWeight - a.intentWeight)
          .map((s) => (
            <li key={s.id} className="px-4 py-2.5 flex items-start gap-3">
              <span
                className="mono shrink-0 px-1.5 py-0.5 rounded grid-surface"
                style={{ background: "var(--color-signal-soft)", color: "var(--color-signal)" }}
              >
                +{s.intentWeight}
              </span>
              <div className="min-w-0">
                <div style={{ fontSize: "0.875rem" }}>
                  <span className="font-medium">{nameOf(s.companyId)}</span> — {s.headline}
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)" }}>{s.detail}</p>
                <div className="mt-1">
                  <Citations evidence={s.evidence} />
                </div>
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}
