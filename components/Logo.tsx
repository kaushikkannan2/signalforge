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
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="SignalForge"
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        {/* Heated steel: ember at the base, white-gold at the tip. */}
        <linearGradient id={`${uid}-molten`} x1="0" y1="20" x2="0" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E8431F" />
          <stop offset="45%" stopColor="#FF7A45" />
          <stop offset="78%" stopColor="#FFC53D" />
          <stop offset="100%" stopColor="#FFE9B0" />
        </linearGradient>
        {/* Cold steel for the anvil. */}
        <linearGradient id={`${uid}-steel`} x1="0" y1="18" x2="0" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7C8EA4" />
          <stop offset="55%" stopColor="#4A5A6E" />
          <stop offset="100%" stopColor="#2B3645" />
        </linearGradient>
        <radialGradient id={`${uid}-heat`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#FF7A45" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FF7A45" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Forge heat behind the work. */}
      {glow && <ellipse cx="17" cy="14" rx="13" ry="12" fill={`url(#${uid}-heat)`} />}

      {/*
        Three ascending bars. Signal strength and a revenue chart are the same
        shape — that ambiguity is the point of the mark.
      */}
      <rect x="8.5" y="13" width="4" height="7" rx="1.6" fill={`url(#${uid}-molten)`} />
      <rect x="14" y="8.5" width="4" height="11.5" rx="1.6" fill={`url(#${uid}-molten)`} />
      <rect x="19.5" y="3.5" width="4" height="16.5" rx="1.6" fill={`url(#${uid}-molten)`} />

      {/* Sparks off the hot end. */}
      <circle cx="26.6" cy="5.2" r="1.5" fill="#FFE9B0" />
      <circle cx="28.9" cy="9.4" r="0.95" fill="#FFC53D" />
      <circle cx="25.4" cy="11.3" r="0.65" fill="#FF7A45" />

      {/*
        The anvil: horn to the left, waisted stem, splayed base. Cold steel,
        and the only cool mass in the mark.
      */}
      <path
        d="M2.2 21.4c2.6-1.3 4.1-1.5 5.3-1.5h20.1c0.7 0 1.1 0.5 1.1 1.1v1.3c0 0.6-0.5 1.1-1.1 1.1h-7.3l-0.5 2.6h2.2c0.6 0 1 0.4 1 1v1.3c0 0.5-0.4 0.9-1 0.9H10.1c-0.5 0-1-0.4-1-0.9v-1.3c0-0.6 0.5-1 1-1h2.2l-0.5-2.6H8.3c-1.4 0-3.3 0.4-5.4 1.2-0.6 0.2-1.1-0.1-1.1-0.7v-1.9c0-0.3 0.2-0.5 0.4-0.6Z"
        fill={`url(#${uid}-steel)`}
      />
      {/* Highlight along the strike face — this is what makes it read as metal. */}
      <path d="M8.1 20.2h19.4c0.5 0 0.9 0.3 0.9 0.8H7.6c0-0.5 0.2-0.8 0.5-0.8Z" fill="#A8BACE" opacity="0.75" />
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
