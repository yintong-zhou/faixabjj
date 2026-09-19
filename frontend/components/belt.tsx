import Image from "next/image";

import { beltLabel } from "@/utils/supabase/profile";
import { getDictionary } from "@/utils/i18n/server";

// What artwork exists, and how many stripe variants of it.
//
// The files are named after the `belt_rank` enum value with `_` written as `-`,
// so the key is also the filename prefix, and they sit in two folders because
// the children's belts are a separate set: public/belts/adults and
// public/belts/kids. White is in `adults` only and is shared — a child's white
// belt is the same belt, not a second graphic.
//
// The ceiling is per colour rather than one number: the person table caps
// stripes at 4, a black belt has degrees up to 7, and a children's belt has 3.
// A belt with no entry in either map has no artwork, and Belt falls back to the
// words rather than requesting an image that is not there.
const ADULT_ARTWORK: Record<string, number> = {
  white: 4,
  blue: 4,
  purple: 4,
  brown: 4,
  black: 7,
};

const KID_ARTWORK: Record<string, number> = {
  gray_white: 3,
  gray: 3,
  gray_black: 3,
  yellow_white: 3,
  yellow: 3,
  yellow_black: 3,
  orange_white: 3,
  orange: 3,
  orange_black: 3,
  green_white: 3,
  green: 3,
  green_black: 3,
};

function artworkFor(belt: string): { dir: string; maxStripes: number } | null {
  if (ADULT_ARTWORK[belt] !== undefined) {
    return { dir: "adults", maxStripes: ADULT_ARTWORK[belt] };
  }
  if (KID_ARTWORK[belt] !== undefined) {
    return { dir: "kids", maxStripes: KID_ARTWORK[belt] };
  }
  return null;
}

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
  const artwork = artworkFor(belt);
  const label = t.belts.label(beltLabel(belt, t), stripes);

  // An unknown colour means a new enum value arrived without its artwork.
  // Falling back to the words is better than a broken image.
  if (!artwork) {
    return (
      <span
        className={`w-fit self-start rounded-full bg-secondary/40 px-2 py-0.5 text-xs ${className}`}
      >
        {label}
      </span>
    );
  }

  const capped = Math.min(Math.max(0, Math.round(stripes)), artwork.maxStripes);
  const file = `${belt.replace(/_/g, "-")}-${capped}-stripe.png`;
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
        src={`/belts/${artwork.dir}/${file}`}
        alt={label}
        width={width}
        height={Math.round(width * 0.3)}
      />
    </span>
  );
}
