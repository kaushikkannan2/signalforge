"use client";

import { useMemo } from "react";

/* ---------------------------------------------------------------------------
   The learning view.

   Two things are shown, and a third is shown by its absence.

   1. The POLICY: a contextual bandit's actual posterior densities, drawn. A
      wide curve is an arm we are still unsure about; a narrow one is an arm we
      have evidence for. Watching curves narrow as outcomes arrive is what
      "learning" looks like, and it is more convincing than any badge.

   2. The DATASET: preference triples harvested from the approval gate, in the
      shape DPO consumes, with a real sample shown and a real file to download.

   3. What does NOT learn. The honesty table is deliberately given the same
      visual weight as the rest. For an audience that knows this field, being
      precise about the boundary is the credibility move — a system that claims
      to learn everywhere is a system nobody believes anywhere.
   --------------------------------------------------------------------------- */

interface Posterior {
  context: string;
  arm: string;
  alpha: number;
  beta: number;
  pulls: number;
  rewards: number;
  mean: number;
  ciLow: number;
  ciHigh: number;
}

export interface LearningData {
  policy: {
    algorithm: string;
    arms: string[];
    contexts: string[];
    posteriors: Posterior[];
    totalPulls: number;
    totalReward: number;
    recentDecisions: { context: string; arm: string; sampled: Record<string, number>; at: string }[];
  };
  preference: {
    format: string;
    pairs: number;
    usableForDpo: number;
    negativeOnly: number;
    sample: { prompt: string; chosen: string; rejected: string; source: string } | null;
  };
  components: { component: string; learns: boolean; method: string; note: string }[];
}

/** log B(a,b) via lgamma, so the density is normalised rather than eyeballed. */
function lgamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betaPdf(x: number, a: number, b: number): number {
  if (x <= 0 || x >= 1) return 0;
  const logB = lgamma(a) + lgamma(b) - lgamma(a + b);
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logB);
}

const ARM_COLOR: Record<string, string> = {
  "signal-led": "var(--color-ember)",
  "peer-proof": "var(--color-steel-blue)",
};
const armColor = (arm: string) => ARM_COLOR[arm.split("|")[0]] ?? "var(--color-bridge)";

function PosteriorChart({ posteriors }: { posteriors: Posterior[] }) {
  const w = 300;
  const h = 96;
  const curves = useMemo(() => {
    const samples = 90;
    const series = posteriors.map((p) => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= samples; i++) {
        const x = i / samples;
        pts.push([x, betaPdf(x, p.alpha, p.beta)]);
      }
      return { p, pts };
    });
    const peak = Math.max(1, ...series.flatMap((s) => s.pts.map(([, y]) => y)));
    return series.map((s) => ({
      ...s,
      path:
        "M " +
        s.pts
          .map(([x, y]) => `${(x * w).toFixed(1)} ${(h - (y / peak) * (h - 8)).toFixed(1)}`)
          .join(" L "),
    }));
  }, [posteriors]);

  if (!posteriors.length) return null;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 14}`} style={{ display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={t * w} y1={0} x2={t * w} y2={h} stroke="var(--color-rule)" strokeWidth={0.5} />
          <text
            x={t * w}
            y={h + 11}
            textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
            style={{ fontSize: 7.5, fill: "var(--color-ink-faint)", fontFamily: "ui-monospace, monospace" }}
          >
            {t}
          </text>
        </g>
      ))}
      {curves.map(({ p, path }) => (
        <g key={`${p.context}-${p.arm}`}>
          <path d={path} fill="none" stroke={armColor(p.arm)} strokeWidth={1.6} opacity={0.95} />
          <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill={armColor(p.arm)} opacity={0.1} />
          <line
            x1={p.mean * w}
            y1={6}
            x2={p.mean * w}
            y2={h}
            stroke={armColor(p.arm)}
            strokeWidth={0.8}
            strokeDasharray="2 2"
          />
        </g>
      ))}
    </svg>
  );
}

export function Learning({ data, onRefresh }: { data: LearningData | null; onRefresh: () => void }) {
  // Hooks run unconditionally — an early return above a useMemo is a hooks
  // violation that only shows up once the component re-renders with data.
  const byContext = useMemo(() => {
    const m = new Map<string, Posterior[]>();
    for (const p of data?.policy.posteriors ?? []) {
      if (!m.has(p.context)) m.set(p.context, []);
      m.get(p.context)!.push(p);
    }
    return [...m.entries()];
  }, [data]);

  if (!data) return null;
  const { policy, preference, components } = data;

  return (
    <div className="flex flex-col gap-5">
      <section className="surface px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap">
        <div style={{ maxWidth: "46rem" }}>
          <h1 className="display" style={{ fontSize: "1.3125rem" }}>
            Learning layer
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
            One policy that genuinely learns, one dataset being collected for training, and
            an explicit account of everything that does not learn.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href="/api/learning?format=jsonl"
            className="btn-ghost px-3.5 py-2 rounded-md no-underline"
            style={{ fontSize: "0.875rem" }}
          >
            Download DPO .jsonl
          </a>
          <button onClick={onRefresh} className="btn-primary px-3.5 py-2 rounded-md" style={{ fontSize: "0.875rem" }}>
            Refresh
          </button>
        </div>
      </section>

      {/* --- policy --- */}
      <section className="surface">
        <header className="px-4 py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="display" style={{ fontSize: "1.125rem" }}>
              Outreach policy
            </h2>
            <span
              className="rule-label px-1.5 py-0.5 rounded"
              style={{ background: "var(--color-vine-soft)", color: "var(--color-vine)" }}
            >
              learns
            </span>
            <span className="mono grid-surface ml-auto" style={{ fontSize: "0.6875rem", color: "var(--color-ink-faint)" }}>
              {policy.totalPulls} pulls · {policy.totalReward} cumulative reward
            </span>
          </div>
          <p className="mono mt-0.5" style={{ fontSize: "0.6875rem", color: "var(--color-ink-soft)" }}>
            {policy.algorithm}
          </p>
          <p className="mt-1.5" style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)", maxWidth: "52rem" }}>
            Each curve is an arm&rsquo;s posterior belief about its own success rate. Wide means
            we don&rsquo;t know yet, so the policy explores; narrow means we have evidence, so it
            exploits. Exploration comes from sampling the posterior — there is no tuned
            exploration rate to get wrong.
          </p>
        </header>

        {byContext.length ? (
          <div className="px-4 py-3 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(19rem, 1fr))" }}>
            {byContext.map(([context, arms]) => (
              <div key={context}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="rule-label">context</span>
                  <span className="mono" style={{ fontSize: "0.75rem", color: "var(--color-ink)" }}>
                    {context}
                  </span>
                  <span className="mono ml-auto" style={{ fontSize: "0.625rem", color: "var(--color-ink-faint)" }}>
                    {arms.reduce((s, a) => s + a.pulls, 0)} obs
                  </span>
                </div>
                <PosteriorChart posteriors={arms} />
                <table className="w-full grid-surface mt-1" style={{ fontSize: "0.6875rem", tableLayout: "fixed" }}>
                  <colgroup>
                    <col />
                    <col style={{ width: "3.25rem" }} />
                    <col style={{ width: "3.25rem" }} />
                    <col style={{ width: "3.25rem" }} />
                  </colgroup>
                  <tbody>
                    {arms.map((a) => (
                      <tr key={a.arm} className="border-t" style={{ borderColor: "var(--color-rule)" }}>
                        <td className="py-1">
                          <span
                            className="inline-block rounded-full mr-1.5"
                            style={{ width: 6, height: 6, background: armColor(a.arm) }}
                          />
                          <span className="mono">{a.arm.replace("|", " · ")}</span>
                        </td>
                        <td className="py-1 text-right mono grid-surface" title="posterior mean">
                          {a.mean.toFixed(2)}
                        </td>
                        <td className="py-1 text-right mono grid-surface" style={{ color: "var(--color-ink-faint)" }} title="approximate 95% interval">
                          ±{((a.ciHigh - a.ciLow) / 2).toFixed(2)}
                        </td>
                        <td className="py-1 text-right mono grid-surface" style={{ color: "var(--color-ink-faint)" }}>
                          {a.rewards}/{a.pulls}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-8 text-center" style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)" }}>
            No observations yet. Draft outreach and approve or reject it — each decision is a
            reward signal and the posteriors will appear.
          </p>
        )}

        {policy.recentDecisions.length > 0 && (
          <div className="px-4 py-3 border-t" style={{ borderColor: "var(--color-rule)" }}>
            <span className="rule-label">Recent decisions — every arm&rsquo;s sampled draw</span>
            <div className="mt-1.5 flex flex-col gap-1">
              {policy.recentDecisions.slice(0, 6).map((d, i) => (
                <div key={i} className="flex items-center gap-2 mono" style={{ fontSize: "0.6875rem" }}>
                  <span style={{ color: "var(--color-ink-faint)", width: "7rem" }}>{d.context}</span>
                  {Object.entries(d.sampled).map(([arm, v]) => (
                    <span
                      key={arm}
                      className="px-1.5 rounded"
                      style={{
                        background: arm === d.arm ? `${armColor(arm)}22` : "transparent",
                        color: arm === d.arm ? armColor(arm) : "var(--color-ink-faint)",
                        border: `1px solid ${arm === d.arm ? `${armColor(arm)}66` : "transparent"}`,
                      }}
                    >
                      {arm.split("|")[0]} {v.toFixed(3)}
                      {arm === d.arm ? " ←" : ""}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* --- preference dataset --- */}
      <section className="surface">
        <header className="px-4 py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="display" style={{ fontSize: "1.125rem" }}>
              Preference dataset
            </h2>
            <span
              className="rule-label px-1.5 py-0.5 rounded"
              style={{ background: "var(--color-signal-soft)", color: "var(--color-signal)" }}
            >
              collected, not trained
            </span>
            <span className="mono grid-surface ml-auto" style={{ fontSize: "0.6875rem", color: "var(--color-ink-faint)" }}>
              {preference.usableForDpo} DPO pairs · {preference.negativeOnly} negative-only
            </span>
          </div>
          <p className="mono mt-0.5" style={{ fontSize: "0.6875rem", color: "var(--color-ink-soft)" }}>
            {preference.format}
          </p>
          <p className="mt-1.5" style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)", maxWidth: "52rem" }}>
            Every message a human <em>edits</em> before approving is a preference triple: the
            model&rsquo;s draft is the rejected completion and the human&rsquo;s edit is the chosen one.
            That is exactly the shape DPO consumes. We collect and export it —{" "}
            <strong>we have not fine-tuned on it</strong>, and a dataset is not a trained policy.
          </p>
        </header>

        {preference.sample ? (
          <div className="px-4 py-3 grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="col-span-2">
              <span className="rule-label">prompt</span>
              <pre
                className="mono mt-1 p-2 rounded-md whitespace-pre-wrap"
                style={{ background: "var(--color-void)", border: "1px solid var(--color-rule)", fontSize: "0.625rem", color: "var(--color-ink-soft)" }}
              >
                {preference.sample.prompt}
              </pre>
            </div>
            <div>
              <span className="rule-label" style={{ color: "var(--color-alarm)" }}>
                rejected — model draft
              </span>
              <pre
                className="mono mt-1 p-2 rounded-md whitespace-pre-wrap"
                style={{ background: "var(--color-void)", border: "1px solid rgba(251,113,133,0.3)", fontSize: "0.625rem", color: "var(--color-ink-soft)" }}
              >
                {preference.sample.rejected}
              </pre>
            </div>
            <div>
              <span className="rule-label" style={{ color: "var(--color-vine)" }}>
                chosen — human edit
              </span>
              <pre
                className="mono mt-1 p-2 rounded-md whitespace-pre-wrap"
                style={{ background: "var(--color-void)", border: "1px solid rgba(52,211,153,0.3)", fontSize: "0.625rem", color: "var(--color-ink)" }}
              >
                {preference.sample.chosen || "(rejection with no replacement — negative-only example)"}
              </pre>
            </div>
          </div>
        ) : (
          <p className="px-4 py-8 text-center" style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)" }}>
            No pairs yet. Edit a message in the approval queue before approving it — that edit
            becomes the chosen completion.
          </p>
        )}
      </section>

      {/* --- the honesty table --- */}
      <section className="surface">
        <header className="px-4 py-3 border-b" style={{ borderColor: "var(--color-rule)" }}>
          <h2 className="display" style={{ fontSize: "1.125rem" }}>
            What learns, and what doesn&rsquo;t
          </h2>
          <p className="mt-0.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
            Three of these five do not learn. Saying so is the point — a system that claims to
            learn everywhere is a system nobody believes anywhere.
          </p>
        </header>
        <div className="scroll-x">
          <table className="w-full" style={{ fontSize: "0.8125rem", minWidth: "44rem" }}>
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--color-rule)", color: "var(--color-ink-faint)" }}>
                <th className="text-left font-semibold px-4 py-2 w-56">Component</th>
                <th className="text-left font-semibold px-2 py-2 w-24">Learns</th>
                <th className="text-left font-semibold px-2 py-2 w-60">Method</th>
                <th className="text-left font-semibold px-4 py-2">Why</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.component} className="border-b" style={{ borderColor: "var(--color-rule)" }}>
                  <td className="px-4 py-2.5 align-top" style={{ fontWeight: 600 }}>
                    {c.component}
                  </td>
                  <td className="px-2 py-2.5 align-top">
                    <span
                      className="rule-label px-1.5 py-0.5 rounded"
                      style={{
                        background: c.learns ? "var(--color-vine-soft)" : "rgba(100,116,139,0.16)",
                        color: c.learns ? "var(--color-vine)" : "var(--color-ink-faint)",
                      }}
                    >
                      {c.learns ? "yes" : "no"}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 align-top mono" style={{ fontSize: "0.6875rem", color: "var(--color-ink-soft)" }}>
                    {c.method}
                  </td>
                  <td className="px-4 py-2.5 align-top" style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)" }}>
                    {c.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
