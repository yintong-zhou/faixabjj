import { recordPromotion } from "../actions";
import { Belt } from "@/components/belt";
import type { BeltOptionGroup } from "@/components/belt-picker";
import { PromotionTarget } from "./promotion-target";
import { beltImageSrc } from "@/utils/belt-artwork";
import {
  BLACK_MAX_DEGREES,
  KID_MAX_STRIPES,
  MAX_STRIPES,
  type PromotionStatus,
} from "@/utils/promotion";
import { ADULT_BELTS, KID_BELTS, beltLabel, isKidBelt } from "@/utils/supabase/profile";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";

// The reminders are keyed by the belt being awarded, and are text only: the
// spec is explicit that nothing here is saved. A tick box would promise a
// record the app does not keep.
const REMINDER_KEYS = ["blue", "purple", "brown", "black"] as const;

export function PromotePanel({
  personId,
  personName,
  currentBelt,
  status,
  today,
  t,
}: {
  personId: string;
  personName: string;
  currentBelt: string;
  status: PromotionStatus;
  today: string;
  t: Dictionary;
}) {
  const proposed = status.next;
  const reminderKey = REMINDER_KEYS.find((k) => k === proposed?.belt);

  // Both ladders, the person's own first. White is shared and listed once,
  // with the adults; a white belt with no age reads as adult elsewhere too.
  const toGroup = (label: string, belts: readonly string[]): BeltOptionGroup => ({
    label,
    options: belts.map((belt) => ({
      value: belt,
      label: beltLabel(belt, t),
      src: beltImageSrc(belt, 0),
    })),
  });
  const adults = toGroup(t.promotions.adultBelts, ADULT_BELTS);
  const kids = toGroup(
    t.promotions.kidBelts,
    KID_BELTS.filter((belt) => belt !== "white"),
  );
  const beltGroups = isKidBelt(currentBelt) ? [kids, adults] : [adults, kids];

  // How far each belt's stripes go — degrees, on the black belt; the picker
  // offers no more, as record_promotion() accepts no more.
  const maxStripes = Object.fromEntries(
    beltGroups.flatMap((g) =>
      g.options.map((o) => [
        o.value,
        o.value === "black"
          ? BLACK_MAX_DEGREES
          : isKidBelt(o.value)
            ? KID_MAX_STRIPES
            : MAX_STRIPES,
      ]),
    ),
  );
  const stripeLabels = Array.from({ length: MAX_STRIPES + 1 }, (_, n) =>
    t.promotions.stripesOption(n),
  );
  const degreeLabels = Array.from({ length: BLACK_MAX_DEGREES + 1 }, (_, n) =>
    t.promotions.degreesOption(n),
  );

  return (
    <details id="promote" className="rounded-xl border border-border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        {t.promotions.promoteTitle(personName)}
      </summary>

      <div className="flex flex-col gap-4 border-t border-border p-4">
        {/* One height for every field (h-11, a comfortable tap target): the
            pickers carry a belt image and set it, the plain inputs match.
            Belt, stripes and date share a row; notes take the full width. */}
        <form
          action={recordPromotion}
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]"
        >
          <input type="hidden" name="person_id" value={personId} />

          <PromotionTarget
            beltLabel={t.promotions.targetBelt}
            stripesLabel={t.promotions.targetStripes}
            degreesLabel={t.promotions.targetDegrees}
            beltGroups={beltGroups}
            maxStripes={maxStripes}
            stripeLabels={stripeLabels}
            degreeLabels={degreeLabels}
            defaultBelt={proposed?.belt ?? currentBelt}
            defaultStripes={proposed?.stripe ?? 0}
          />

          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-foreground/65">
            {t.promotions.promotedOn}
            {/* ISO on purpose: it is what the element accepts and posts back. */}
            <input
              type="date"
              name="promoted_on"
              defaultValue={today}
              max={today}
              required
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-foreground/65 sm:col-span-3">
            {t.promotions.promotionNotes}
            <input
              type="text"
              name="notes"
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            />
          </label>

          <button
            type="submit"
            className="inline-flex h-11 items-center justify-self-start rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            {t.promotions.confirm}
          </button>
        </form>

        {reminderKey ? (
          <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Belt belt={reminderKey} stripes={0} />
              {t.promotions.remindersTitle}
            </p>
            <ul className="list-disc pl-5 text-xs leading-relaxed text-foreground/70">
              {t.promotions.reminders[reminderKey].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="text-xs text-foreground/55">{t.promotions.remindersNote}</p>
          </div>
        ) : null}
      </div>
    </details>
  );
}
