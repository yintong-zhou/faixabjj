// What artwork exists, and how many stripe variants of it.
//
// The files are named after the `belt_rank` enum value with `_` written as `-`,
// so the key is also the filename prefix, and they sit in two folders because
// the children's belts are a separate set: public/belts/adults and
// public/belts/kids. White is in `adults` only and is shared — a child's white
// belt is the same belt, not a second graphic.
//
// The ceiling is per colour rather than one number: the person table caps
// stripes at 4, a black belt has six degrees (IBJJF), and a children's belt has 3.
// A belt with no entry in either map has no artwork, and callers fall back to
// the words rather than requesting an image that is not there.
//
// Pure, with no server imports, so a Client Component (the belt picker) can
// use it as well as the server-rendered Belt.
const ADULT_ARTWORK: Record<string, number> = {
  white: 4,
  blue: 4,
  purple: 4,
  brown: 4,
  black: 6,
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

/** Path of the belt's image under /public, or null when there is no artwork. */
export function beltImageSrc(belt: string, stripes: number): string | null {
  const dir = ADULT_ARTWORK[belt] !== undefined ? "adults" : "kids";
  const max = ADULT_ARTWORK[belt] ?? KID_ARTWORK[belt];
  if (max === undefined) return null;
  const capped = Math.min(Math.max(0, Math.round(stripes)), max);
  return `/belts/${dir}/${belt.replace(/_/g, "-")}-${capped}-stripe.png`;
}
