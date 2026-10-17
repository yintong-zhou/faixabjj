"use client";

import { useState } from "react";

import { BeltPicker, type BeltOptionGroup } from "@/components/belt-picker";
import { beltImageSrc } from "@/utils/belt-artwork";

/**
 * The two pickers of the promote panel, belt and stripes, which depend on
 * each other: the stripes are drawn on the belt just chosen, and offered only
 * as far as that belt goes (four on an adult belt, three on a children's one,
 * six degrees on a black belt — record_promotion() refuses anything past that
 * anyway). Choosing a new belt
 * starts it at no stripes, which is what a belt promotion means.
 *
 * Words and limits come from the server as props, like every Client Component
 * here.
 */
export function PromotionTarget({
  beltLabel,
  stripesLabel,
  degreesLabel,
  beltGroups,
  maxStripes,
  stripeLabels,
  degreeLabels,
  defaultBelt,
  defaultStripes,
}: {
  beltLabel: string;
  stripesLabel: string;
  degreesLabel: string;
  beltGroups: BeltOptionGroup[];
  /** Highest stripe count per belt value. */
  maxStripes: Record<string, number>;
  /** stripeLabels[n] names n stripes; degreeLabels[n] n degrees. */
  stripeLabels: string[];
  degreeLabels: string[];
  defaultBelt: string;
  defaultStripes: number;
}) {
  const [belt, setBelt] = useState(defaultBelt);
  const [stripes, setStripes] = useState(defaultStripes);
  // The black belt is the one belt whose marks are degrees, not stripes: same
  // field (`to_stripes`), its own words.
  const degrees = belt === "black";
  const labels = degrees ? degreeLabels : stripeLabels;
  const max = Math.min(maxStripes[belt] ?? labels.length - 1, labels.length - 1);

  const stripeGroups: BeltOptionGroup[] = [
    {
      options: labels.slice(0, max + 1).map((label, n) => ({
        value: String(n),
        label,
        src: beltImageSrc(belt, n),
      })),
    },
  ];

  return (
    <>
      <BeltPicker
        name="to_belt"
        label={beltLabel}
        groups={beltGroups}
        value={belt}
        onChange={(next) => {
          setBelt(next);
          setStripes(0);
        }}
      />
      <BeltPicker
        name="to_stripes"
        label={degrees ? degreesLabel : stripesLabel}
        groups={stripeGroups}
        value={String(Math.min(stripes, max))}
        onChange={(next) => setStripes(Number(next))}
      />
    </>
  );
}
