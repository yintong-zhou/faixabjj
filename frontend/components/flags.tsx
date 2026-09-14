// The three flags of the language switcher, drawn by hand like every other
// icon in this project — `components/icons.tsx` is the same decision.
//
// They are SVG rather than the flag emoji (🇮🇹) on purpose: Windows ships no
// glyphs for the regional-indicator pairs, so an emoji flag renders there as
// the two bare letters "IT". The gym's front desk is exactly the machine that
// would show it.
//
// Each flag is drawn on a 24×16 viewBox. Strokes that run past that box are
// clipped by the SVG viewport itself, which is why no <clipPath> is needed —
// a clip path would need a unique id per instance, and these render three at
// a time.

type FlagProps = {
  className?: string;
};

const svgProps = {
  viewBox: "0 0 24 16",
  role: "presentation" as const,
  "aria-hidden": true,
};

export function FlagIT({ className }: FlagProps) {
  return (
    <svg {...svgProps} className={className}>
      <rect width="8" height="16" fill="#008C45" />
      <rect x="8" width="8" height="16" fill="#F4F5F0" />
      <rect x="16" width="8" height="16" fill="#CD212A" />
    </svg>
  );
}

export function FlagGB({ className }: FlagProps) {
  return (
    <svg {...svgProps} className={className}>
      <rect width="24" height="16" fill="#012169" />
      {/* White saltire, then the red one laid over it at half the width. */}
      <path d="M0 0 24 16M24 0 0 16" stroke="#FFFFFF" strokeWidth="3.4" />
      <path d="M0 0 24 16M24 0 0 16" stroke="#C8102E" strokeWidth="1.6" />
      {/* The upright cross sits on top, white fimbriation under the red. */}
      <path d="M12 0v16M0 8h24" stroke="#FFFFFF" strokeWidth="5.4" />
      <path d="M12 0v16M0 8h24" stroke="#C8102E" strokeWidth="3.2" />
    </svg>
  );
}

export function FlagBR({ className }: FlagProps) {
  return (
    <svg {...svgProps} className={className}>
      <rect width="24" height="16" fill="#009B3A" />
      <path d="M12 1.6 22.4 8 12 14.4 1.6 8Z" fill="#FEDF00" />
      <circle cx="12" cy="8" r="4" fill="#002776" />
      {/* The banner across the globe, reduced to the band alone: at 16px tall
          the motto and the stars are noise, but the band is what makes the
          flag readable at a glance. */}
      <path d="M8.3 9.4a6.2 6.2 0 0 1 7.5 1" stroke="#FFFFFF" strokeWidth="1.2" fill="none" />
    </svg>
  );
}
