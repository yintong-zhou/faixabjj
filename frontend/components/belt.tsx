import Image from "next/image";

import { beltLabel } from "@/utils/supabase/profile";
import { getDictionary } from "@/utils/i18n/server";

// How many stripe variants actually exist per colour, and — since a belt with
// no entry here has no artwork — which colours can be drawn at all. The files
// in public/belts are named after the `belt_rank` enum value, so the key is
// also the filename prefix. The person table caps stripes at 4, but a black
// belt has degrees up to 7, so the ceiling is per colour rather than a single
// number.
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
// An async Server Component so it can read the dictionary itself. Every place
// it is used renders on the server, and the alternative — threading the belt
// name through as a prop — would put the same lookup at a dozen call sites.
export async function Belt({
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
  const { t } = await getDictionary();
  const maxStripes = MAX_STRIPES[belt];
  const label = t.belts.label(beltLabel(belt, t), stripes);

  // An unknown colour means a new enum value arrived without its artwork.
  // Falling back to the words is better than a broken image.
  if (maxStripes === undefined) {
    return (
      <span
        className={`w-fit self-start rounded-full bg-secondary/40 px-2 py-0.5 text-xs ${className}`}
      >
        {label}
      </span>
    );
  }

  const capped = Math.min(Math.max(0, Math.round(stripes)), maxStripes);
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
        src={`/belts/${belt}-${capped}-stripe.png`}
        alt={label}
        width={width}
        height={Math.round(width * 0.3)}
      />
    </span>
  );
}
