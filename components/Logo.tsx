/* ---------------------------------------------------------------------------
   SignalForge — the mark.

   Concept: a forge, read as a revenue instrument.

     · The ANVIL is cold steel at the base — the thing you strike against.
       It is the only cool element in the mark, which is what makes the heat
       above it read as heat.
     · Rising from the strike face are three MOLTEN BARS, ascending
       left-to-right. They are deliberately ambiguous: signal strength bars
       and a revenue chart are the same shape, and this product's whole claim
       is that one becomes the other.
     · SPARKS fly off the tallest bar. The bright one is the signal detected.

   The gradient runs ember → molten → white-gold bottom-to-top, which is the
   actual colour of heated steel, and is where the entire UI palette is
   derived from: hot work against cold ground.

   Built as inline SVG rather than an image so it inherits currentColor where
   needed, stays crisp at any size, and costs no network request.
   --------------------------------------------------------------------------- */

export function Mark({ size = 32, glow = true }: { size?: number; glow?: boolean }) {
  const uid = `sf${size}`;
  // The hammer is omitted below ~26px — at rail size it becomes a smudge, and
  // a mark that is illegible small is a worse mark than a simpler one.
  const detailed = size >= 26;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label="SignalForge"
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={`${uid}-molten`} x1="0" y1="27" x2="0" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E8431F" />
          <stop offset="42%" stopColor="#FF7A45" />
          <stop offset="76%" stopColor="#FFC53D" />
          <stop offset="100%" stopColor="#FFF3D1" />
        </linearGradient>
        <linearGradient id={`${uid}-steel`} x1="0" y1="25" x2="0" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8699AE" />
          <stop offset="52%" stopColor="#4A5A6E" />
          <stop offset="100%" stopColor="#262F3C" />
        </linearGradient>
        <linearGradient id={`${uid}-hammer`} x1="26" y1="4" x2="38" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9FB2C6" />
          <stop offset="60%" stopColor="#5B6B80" />
          <stop offset="100%" stopColor="#36414F" />
        </linearGradient>
        <radialGradient id={`${uid}-heat`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#FF7A45" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FF7A45" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Forge heat rising off the work. */}
      {glow && <ellipse cx="18" cy="19" rx="16" ry="15" fill={`url(#${uid}-heat)`} />}

      {/*
        Three ascending bars of heated metal. Signal strength and a revenue
        chart are the same shape — that ambiguity is the point of the mark.
      */}
      <rect x="7.5" y="18.5" width="4.6" height="8.5" rx="1.8" fill={`url(#${uid}-molten)`} />
      <rect x="14" y="13" width="4.6" height="14" rx="1.8" fill={`url(#${uid}-molten)`} />
      <rect x="20.5" y="7" width="4.6" height="20" rx="1.8" fill={`url(#${uid}-molten)`} />

      {detailed && (
        <>
          {/* The hammer, mid-swing, about to land on the tallest bar. */}
          <g transform="rotate(32 30 10)">
            <rect x="26.4" y="4.2" width="9.6" height="5.6" rx="1.5" fill={`url(#${uid}-hammer)`} />
            <rect x="26.4" y="4.2" width="9.6" height="1.5" rx="0.75" fill="#B8C8D8" opacity="0.6" />
            <rect x="30.2" y="9.4" width="2" height="11" rx="1" fill="#7A5330" />
            <rect x="30.2" y="9.4" width="0.8" height="11" rx="0.4" fill="#9C6B3E" />
          </g>
          {/* Impact sparks off the strike point. */}
          <circle cx="27.6" cy="6.6" r="1.7" fill="#FFF3D1" />
          <circle cx="31.4" cy="21.4" r="1.05" fill="#FFC53D" />
          <circle cx="29" cy="25" r="0.7" fill="#FF7A45" />
        </>
      )}
      {!detailed && (
        <>
          <circle cx="29.5" cy="7.5" r="1.9" fill="#FFF3D1" />
          <circle cx="32.5" cy="12.5" r="1.15" fill="#FFC53D" />
        </>
      )}

      {/* The anvil: horn, waisted stem, splayed base. The only cool mass. */}
      <path
        d="M2.6 28.3c3.1-1.5 4.9-1.8 6.3-1.8h24.1c0.8 0 1.3 0.6 1.3 1.3v1.6c0 0.7-0.6 1.3-1.3 1.3h-8.7l-0.6 3.1h2.6c0.7 0 1.2 0.5 1.2 1.2v1.6c0 0.6-0.5 1.1-1.2 1.1H12.1c-0.6 0-1.2-0.5-1.2-1.1v-1.6c0-0.7 0.6-1.2 1.2-1.2h2.6l-0.6-3.1H9.9c-1.7 0-4 0.5-6.5 1.4-0.7 0.3-1.3-0.1-1.3-0.8v-2.3c0-0.4 0.2-0.6 0.5-0.7Z"
        fill={`url(#${uid}-steel)`}
      />
      {/* Strike-face highlight — this is what makes it read as metal. */}
      <path d="M9.7 26.9h23.3c0.6 0 1 0.4 1 1H9.1c0-0.6 0.2-1 0.6-1Z" fill="#AEC0D4" opacity="0.8" />
    </svg>
  );
}

/** Full lockup. Two-tone wordmark: the heat lands on "Forge". */
export function Logo({
  size = 30,
  showWord = true,
  tagline,
}: {
  size?: number;
  showWord?: boolean;
  tagline?: string;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark size={size} />
      {showWord && (
        <span className="flex flex-col" style={{ lineHeight: 1.05 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: size * 0.58,
              letterSpacing: "-0.015em",
              color: "var(--color-ink)",
            }}
          >
            Signal
            <span style={{ color: "var(--color-ember)", fontWeight: 600 }}>Forge</span>
          </span>
          {tagline && (
            <span className="rule-label" style={{ fontSize: size * 0.23, marginTop: 1 }}>
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
