"use client";

import { useMemo, useState } from "react";
import { Citations, ScoreRing, TierBadge } from "./Confidence";
import type { Company, Signal } from "@/lib/types";

/**
 * The dense operating surface. A spreadsheet is what a rep actually wants
 * here, so the design concedes that and makes the dense thing good: tabular
 * numerals, score arithmetic exposed on hover, citations inline on every row,
 * and disqualified accounts shown struck-through rather than hidden — the
 * operator needs to see what was filtered out and why.
 */
type SortKey = "fit" | "name" | "signals" | "headcount";

export function AccountGrid({
  companies,
  signals,
  selectedId,
  onSelect,
  onFocusGraph,
}: {
  companies: Company[];
  signals: Signal[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onFocusGraph?: (id: string) => void;
}) {
  const [showDisqualified, setShowDisqualified] = useState(true);
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<"all" | "A" | "B" | "C">("all");
  const [onlySignals, setOnlySignals] = useState(false);
  const [sort, setSort] = useState<SortKey>("fit");
  const [dense, setDense] = useState(true);
  const [page, setPage] = useState(50);

  const signalCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of signals) m.set(s.companyId, (m.get(s.companyId) ?? 0) + 1);
    return m;
  }, [signals]);

  const dqCount = companies.filter((c) => c.disqualified).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = companies.filter((c) => {
      if (!showDisqualified && c.disqualified) return false;
      if (tier !== "all" && c.fit.tier !== tier) return false;
      if (onlySignals && !(signalCount.get(c.id) ?? 0)) return false;
      if (
        q &&
        !(
          c.name.toLowerCase().includes(q) ||
          c.domain.toLowerCase().includes(q) ||
          c.industry.toLowerCase().includes(q) ||
          (c.hqLocation ?? "").toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
    rows = rows.sort((a, b) => {
      // Disqualified rows always sink, whatever the sort — they are reference,
      // not workable pipeline.
      const dq = Number(a.disqualified) - Number(b.disqualified);
      if (dq !== 0) return dq;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "signals") return (signalCount.get(b.id) ?? 0) - (signalCount.get(a.id) ?? 0);
      if (sort === "headcount") return (b.headcount ?? -1) - (a.headcount ?? -1);
      return b.fit.total - a.fit.total;
    });
    return rows;
  }, [companies, query, tier, onlySignals, showDisqualified, sort, signalCount]);

  const visible = filtered.slice(0, page);
  const pad = dense ? "py-1.5" : "py-3";

  return (
    <section className="surface" style={{ borderColor: "var(--color-rule)" }}>
      <header className="px-4 py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
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
          <span className="mono grid-surface shrink-0" style={{ color: "var(--color-ink-faint)" }}>
            {filtered.length === companies.length
              ? `${companies.length} rows`
              : `${filtered.length} of ${companies.length} rows`}
          </span>
        </div>

        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(50);
            }}
            placeholder="Filter by name, domain, industry or location…"
            className="px-2.5 py-1.5 rounded border"
            style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem", minWidth: "17rem" }}
          />

          <Segmented
            value={tier}
            onChange={(v) => {
              setTier(v as typeof tier);
              setPage(50);
            }}
            options={[
              { value: "all", label: "All tiers" },
              { value: "A", label: "A" },
              { value: "B", label: "B" },
              { value: "C", label: "C" },
            ]}
          />

          <Toggle active={onlySignals} onClick={() => setOnlySignals((v) => !v)} label="has signal" />
          {dqCount > 0 && (
            <Toggle
              active={showDisqualified}
              onClick={() => setShowDisqualified((v) => !v)}
              label={`disqualified (${dqCount})`}
            />
          )}

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="px-2 py-1.5 rounded border mono"
            style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.75rem" }}
          >
            <option value="fit">sort: fit</option>
            <option value="signals">sort: signals</option>
            <option value="headcount">sort: headcount</option>
            <option value="name">sort: name</option>
          </select>

          <Toggle active={dense} onClick={() => setDense((v) => !v)} label="dense" />
        </div>
      </header>

      <div className="scroll-x">
        <table className="w-full grid-surface" style={{ fontSize: "0.8125rem", minWidth: "60rem" }}>
          <thead>
            <tr
              className="border-b"
              style={{ borderColor: "var(--color-rule)", color: "var(--color-ink-faint)" }}
            >
              <th className="text-center font-semibold px-3 py-2 w-16">Fit</th>
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
                  className={`border-b cursor-pointer row-hover ${selectedId === c.id ? "row-active" : ""}`}
                  style={{
                    borderColor: "var(--color-rule)",
                    opacity: c.disqualified ? 0.5 : 1,
                  }}
                >
                  <td className={`px-3 ${pad} align-top`} title={arithmetic}>
                    <span className="flex justify-center">
                      <ScoreRing value={c.fit.total} tier={c.fit.tier} muted={c.disqualified} />
                    </span>
                  </td>
                  <td className={`px-2 ${pad} align-top`}>
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
                    className="px-2 py-2 align-top text-right mono grid-surface"
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
                        className="mono grid-surface px-1.5 py-0.5 rounded inline-block text-center"
                        style={{
                          background: "var(--color-signal-soft)",
                          color: "var(--color-signal)",
                          minWidth: "3.25rem",
                        }}
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
                  <td className={`px-3 ${pad} align-top`}>
                    <div className="flex items-center gap-2">
                      <Citations evidence={c.evidence} />
                      {onFocusGraph && (
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onFocusGraph(c.id);
                          }}
                          title="Show this account's neighbourhood in the graph"
                          className="mono px-1.5 py-0.5 rounded border shrink-0"
                          style={{
                            borderColor: "var(--color-rule-strong)",
                            color: "var(--color-ink-faint)",
                            fontSize: "0.625rem",
                          }}
                        >
                          ⬡
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--color-ink-faint)" }}>
                  {companies.length
                    ? "No rows match these filters."
                    : "No accounts yet. Approve an ICP and run discovery."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > visible.length && (
        <footer
          className="px-4 py-2.5 border-t flex items-center justify-between gap-3"
          style={{ borderColor: "var(--color-rule)" }}
        >
          <span className="mono" style={{ fontSize: "0.6875rem", color: "var(--color-ink-faint)" }}>
            Showing {visible.length} of {filtered.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p + 100)}
              className="px-2.5 py-1 rounded border"
              style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem" }}
            >
              Load 100 more
            </button>
            <button
              onClick={() => setPage(filtered.length)}
              className="px-2.5 py-1 rounded border"
              style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem" }}
            >
              Show all
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}

export function SignalFeed({ signals, companies }: { signals: Signal[]; companies: Company[] }) {
  if (!signals.length) return null;
  const nameOf = (id: string) => companies.find((c) => c.id === id)?.name ?? id;
  return (
    <section className="surface" style={{ borderColor: "var(--color-rule)" }}>
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


function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex rounded border overflow-hidden" style={{ borderColor: "var(--color-rule-strong)" }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="px-2 py-1.5"
          style={{
            background: value === o.value ? "var(--color-vine-soft)" : "transparent",
            color: value === o.value ? "var(--color-vine)" : "var(--color-ink-soft)",
            fontSize: "0.75rem",
            fontWeight: value === o.value ? 600 : 400,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 rounded border mono"
      style={{
        borderColor: active ? "var(--color-vine)" : "var(--color-rule-strong)",
        background: active ? "var(--color-vine-soft)" : "transparent",
        color: active ? "var(--color-vine)" : "var(--color-ink-faint)",
        fontSize: "0.75rem",
      }}
    >
      {active ? "✓ " : ""}
      {label}
    </button>
  );
}
