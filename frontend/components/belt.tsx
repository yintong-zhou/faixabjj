import Image from "next/image";

import { BELT_LABELS } from "@/utils/supabase/profile";

// The files in public/belts are named by colour, and the enum's "purple" is
// "violet" there. Mapping here keeps the database vocabulary and the asset
// names independent of each other.
const BELT_FILE_COLOR: Record<string, string> = {
  white: "white",
  blue: "blue",
  purple: "violet",
  brown: "brown",
  black: "black",
};

// How many stripe variants actually exist per colour. The person table caps
// stripes at 4, but a black belt has degrees up to 7, so the ceiling is per
// colour rather than a single number.
const MAX_STRIPES: Record<string, number> = {
  white: 4,
  blue: 4,
  purple: 4,
  brown: 4,
  black: 7,
};

// 1000 × 300 source images, so every size keeps the 10:3 ratio.
const SIZES = {
  sm: 50,
  md: 84,
  lg: 120,
} as const;

export type BeltSize = keyof typeof SIZES;

export function beltLabel(belt: string, stripes: number): string {
  const name = BELT_LABELS[belt] ?? belt;
  if (stripes <= 0) return `Cintura ${name.toLowerCase()}`;
  return `Cintura ${name.toLowerCase()}, ${stripes} tacc${stripes === 1 ? "a" : "he"}`;
}

/**
 * The belt itself, drawn, rather than its colour and stripe count spelled out.
 *
 * The graphic sits on a bordered, faintly tinted plate on purpose: the belt
 * images are transparent PNGs, so a white belt would disappear against the
 * light theme and a black one against the dark theme. The plate gives both an
 * edge in both themes.
 *
 * The colour and stripe count stay available as the alt text, which is what a
 * screen reader reads and what the old text node used to say.
 */
export function Belt({
  belt,
  stripes,
  size = "sm",
  className = "",
}: {
  belt: string;
  stripes: number;
  size?: BeltSize;
  className?: string;
}) {
  const color = BELT_FILE_COLOR[belt];
  const label = beltLabel(belt, stripes);

  // An unknown colour means a new enum value arrived without its artwork.
  // Falling back to the words is better than a broken image.
  if (!color) {
    return (
      <span
        className={`w-fit self-start rounded-full bg-secondary/40 px-2 py-0.5 text-xs ${className}`}
      >
        {label}
      </span>
    );
  }

  const capped = Math.min(Math.max(0, Math.round(stripes)), MAX_STRIPES[color] ?? 4);
  const width = SIZES[size];

  // `w-fit` and `self-start` are what keep every belt the same size. A flex
  // *column* parent — the roll call row, the registry row's detail stack —
  // stretches its children across the cross axis by default, which made the
  // plate as wide as the row and the belt inside it grow to match. Pinning the
  // width here means the size comes only from `size`, never from the parent.
  return (
    <span
      title={label}
      className={`inline-flex w-fit shrink-0 self-start items-center rounded-[4px] border border-border bg-muted p-[3px] ${className}`}
    >
      <Image
        src={`/belts/${color}-${capped}-stripe.png`}
        alt={label}
        width={width}
        height={Math.round(width * 0.3)}
      />
    </span>
  );
}
