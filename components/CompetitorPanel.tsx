"use client";

import { Citations } from "./Confidence";
import type { Competitor } from "@/lib/types";

const CATEGORY_TONE: Record<Competitor["category"], { bg: string; fg: string; note: string }> = {
  direct: { bg: "#fee2e2", fg: "var(--color-alarm)", note: "same problem, same buyer" },
  indirect: { bg: "#fef3c7", fg: "var(--color-tier-b)", note: "part of the problem, or a different buyer" },
  alternative: { bg: "#e0e7ff", fg: "#3730a3", note: "what they do instead of buying software" },
};

export function CompetitorPanel({ competitors }: { competitors: Competitor[] }) {
  if (!competitors.length) return null;
  const order: Competitor["category"][] = ["direct", "indirect", "alternative"];

  return (
    <section className="border rounded-lg bg-white" style={{ borderColor: "var(--color-rule)" }}>
      <header className="px-4 py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
        <h2 className="display" style={{ fontSize: "1.25rem" }}>
          Competitive landscape
        </h2>
        <p className="mt-0.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
          Prices are shown only where they are actually published. &ldquo;Not published&rdquo; is the
          honest answer — a rep will repeat a fabricated price to a prospect.
        </p>
      </header>

      <div className="divide-y" style={{ borderColor: "var(--color-rule)" }}>
        {order.flatMap((cat) =>
          competitors
            .filter((c) => c.category === cat)
            .map((c) => {
              const tone = CATEGORY_TONE[c.category];
              return (
                <article key={c.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span
                        className="rule-label px-1.5 py-0.5 rounded"
                        style={{ background: tone.bg, color: tone.fg }}
                        title={tone.note}
                      >
                        {c.category}
                      </span>
                      <h3 style={{ fontSize: "0.9375rem", fontWeight: 600 }}>{c.name}</h3>
                      {c.domain && (
                        <a
                          href={`https://${c.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mono no-underline"
                          style={{ color: "var(--color-ink-faint)" }}
                        >
                          {c.domain}
                        </a>
                      )}
                    </div>
                    <Citations evidence={c.evidence} />
                  </div>

                  <p className="mt-1.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
                    {c.positioning}
                  </p>

                  <div className="mt-2.5 grid gap-4" style={{ gridTemplateColumns: "14rem 1fr" }}>
                    <div>
                      <span className="rule-label">Published pricing</span>
                      <ul className="mt-1 grid-surface" style={{ fontSize: "0.8125rem" }}>
                        {c.pricingTiers.map((t, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span style={{ color: "var(--color-ink-soft)" }}>{t.name}</span>
                            <span
                              className="mono"
                              style={{
                                color:
                                  t.price.toLowerCase().includes("not published")
                                    ? "var(--color-ink-faint)"
                                    : "var(--color-ink)",
                              }}
                            >
                              {t.price}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span className="rule-label">Where we differ</span>
                      <ul className="mt-1 flex flex-col gap-1" style={{ fontSize: "0.8125rem" }}>
                        {c.ourDifferentiators.slice(0, 3).map((d) => (
                          <li key={d} className="flex gap-2">
                            <span style={{ color: "var(--color-vine)" }}>▸</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                      {c.structuralAdvantages.length > 0 && (
                        <p
                          className="mt-1.5"
                          style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)" }}
                        >
                          <span className="rule-label mr-1">Their moat</span>
                          {c.structuralAdvantages.join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            }),
        )}
      </div>
    </section>
  );
}
