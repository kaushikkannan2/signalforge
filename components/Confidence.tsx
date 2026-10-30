/**
 * A confidence figure is never shown as a bare number: the bar encodes the
 * same value, and the rationale is one hover away. A 0.41 that looks like a
 * precise measurement is worse than one that visibly reads as "thin".
 */
export function Confidence({
  value,
  rationale,
  label,
  compact = false,
}: {
  value: number;
  rationale?: string;
  label?: string;
  compact?: boolean;
}) {
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.75 ? "var(--color-tier-a)" : value >= 0.5 ? "var(--color-tier-b)" : "var(--color-alarm)";

  if (compact) {
    return (
      <span
        title={rationale}
        className="mono inline-flex items-center gap-1.5 cursor-help"
        style={{ color: tone }}
      >
        <span className="meter w-8 inline-block align-middle">
          <span style={{ width: `${pct}%`, background: tone }} />
        </span>
        {pct}%
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2" title={rationale}>
      {label && <span className="rule-label">{label}</span>}
      <div className="meter w-16">
        <span style={{ width: `${pct}%`, background: tone }} />
      </div>
      <span className="mono tabular-nums" style={{ color: tone }}>
        {pct}%
      </span>
    </div>
  );
}

export function TierBadge({ tier }: { tier: "A" | "B" | "C" }) {
  const map = {
    A: { bg: "#dcfce7", fg: "var(--color-tier-a)", label: "Tier A" },
    B: { bg: "#fef9c3", fg: "var(--color-tier-b)", label: "Tier B" },
    C: { bg: "#f5f5f4", fg: "var(--color-tier-c)", label: "Tier C" },
  }[tier];
  return (
    <span
      className="rule-label px-1.5 py-0.5 rounded"
      style={{ background: map.bg, color: map.fg, letterSpacing: "0.06em" }}
    >
      {map.label}
    </span>
  );
}

/** Renders citations inline. Used everywhere an externally-sourced claim appears. */
export function Citations({
  evidence,
}: {
  evidence: { url: string; title: string; snippet: string; publisher?: string; provenance: string }[];
}) {
  if (!evidence.length) {
    return (
      <span
        className="rule-label px-1.5 py-0.5 rounded"
        style={{ background: "var(--color-alarm-soft)", color: "var(--color-alarm)" }}
        title="No source was retrieved for this claim. It is shown as unverified rather than hidden."
      >
        Uncited
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-1 items-center">
      {evidence.map((e, i) => (
        <a
          key={e.url + i}
          href={e.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${e.title}\n\n“${e.snippet}”\n\n${e.provenance === "live" ? "Fetched live" : "Recorded run"}`}
          className="mono px-1.5 py-0.5 rounded border no-underline hover:bg-white"
          style={{
            borderColor: "var(--color-rule-strong)",
            color: "var(--color-ink-soft)",
            fontSize: "0.6875rem",
          }}
        >
          [{i + 1}] {e.publisher ?? "source"}
        </a>
      ))}
    </span>
  );
}
