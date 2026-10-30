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
        className="mono grid-surface inline-flex items-center gap-1.5 cursor-help"
        style={{ color: tone }}
      >
        <span className="meter w-8 inline-block align-middle">
          <span style={{ width: `${pct}%`, background: tone, color: tone }} />
        </span>
        {/* Fixed width: "7%" and "100%" are different widths, so without this
            a column of confidences has a ragged right edge. */}
        <span className="text-right" style={{ minWidth: "2.25rem" }}>
          {pct}%
        </span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2" title={rationale}>
      {label && <span className="rule-label">{label}</span>}
      <div className="meter w-16">
        <span style={{ width: `${pct}%`, background: tone }} />
      </div>
      <span className="mono grid-surface text-right" style={{ color: tone, minWidth: "2.25rem" }}>
        {pct}%
      </span>
    </div>
  );
}

export function TierBadge({ tier }: { tier: "A" | "B" | "C" }) {
  const map = {
    A: { bg: "var(--color-vine-soft)", fg: "var(--color-tier-a)", label: "Tier A" },
    B: { bg: "var(--color-signal-soft)", fg: "var(--color-tier-b)", label: "Tier B" },
    C: { bg: "rgba(100,116,139,0.16)", fg: "var(--color-tier-c)", label: "Tier C" },
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
          className="mono px-1.5 py-0.5 rounded border no-underline"
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


/**
 * A fit score as a ring rather than a bare integer.
 *
 * Reason: in a 300-row grid, a column of two-digit numbers is unreadable at a
 * glance — the eye has to compare digits. An arc is pre-attentive: you see the
 * shape of the pipeline scrolling past before you read anything. The number
 * stays inside it, because the operator still needs the exact value.
 */
export function ScoreRing({
  value,
  tier,
  size = 34,
  muted = false,
}: {
  value: number;
  tier: "A" | "B" | "C";
  size?: number;
  muted?: boolean;
}) {
  const color =
    tier === "A" ? "var(--color-tier-a)" : tier === "B" ? "var(--color-tier-b)" : "var(--color-tier-c)";
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size, opacity: muted ? 0.45 : 1 }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-rule)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${color})`, transition: "stroke-dasharray 500ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <span
        className="absolute mono grid-surface"
        style={{ fontSize: size > 30 ? "0.6875rem" : "0.5625rem", color, fontWeight: 600 }}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * The headline confidence dial. This is the first number the audience sees
 * after intake, so it is deliberately large and deliberately honest — a low
 * reading is rendered just as prominently as a high one.
 */
export function ConfidenceDial({ value, size = 92 }: { value: number; size?: number }) {
  const pct = Math.round(value * 100);
  // Three bands, deliberately not a continuous ramp: an operator should read
  // "solid / thin / don't trust this" at a glance, not interpolate a hue.
  const color =
    value >= 0.75 ? "var(--color-tempered)" : value >= 0.5 ? "var(--color-molten)" : "var(--color-quench)";
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-rule)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dasharray 800ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <span className="absolute flex flex-col items-center">
        <span className="display grid-surface" style={{ fontSize: "1.5rem", color, lineHeight: 1 }}>
          {pct}
        </span>
        <span className="rule-label" style={{ fontSize: "0.5rem" }}>
          confidence
        </span>
      </span>
    </span>
  );
}
