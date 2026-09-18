import { recordPromotion } from "../actions";
import { Belt } from "@/components/belt";
import type { PromotionStatus } from "@/utils/promotion";
import { BELT_ORDER, beltLabel } from "@/utils/supabase/profile";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";

// The reminders are keyed by the belt being awarded, and are text only: the
// spec is explicit that nothing here is saved. A tick box would promise a
// record the app does not keep.
const REMINDER_KEYS = ["blue", "purple", "brown", "black"] as const;

export function PromotePanel({
  personId,
  personName,
  status,
  today,
  t,
}: {
  personId: string;
  personName: string;
  status: PromotionStatus;
  today: string;
  t: Dictionary;
}) {
  const proposed = status.next;
  const reminderKey = REMINDER_KEYS.find((k) => k === proposed?.belt);

  return (
    <details id="promote" className="rounded-xl border border-border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        {t.promotions.promoteTitle(personName)}
      </summary>

      <div className="flex flex-col gap-4 border-t border-border p-4">
        <form action={recordPromotion} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="person_id" value={personId} />

          <label className="flex flex-col gap-1 text-xs text-foreground/65">
            {t.promotions.targetBelt}
            <select
              name="to_belt"
              defaultValue={proposed?.belt ?? ""}
              required
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              {BELT_ORDER.map((belt) => (
                <option key={belt} value={belt}>
                  {beltLabel(belt, t)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-foreground/65">
            {t.promotions.targetStripes}
            <select
              name="to_stripes"
              defaultValue={String(proposed?.stripe ?? 0)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-foreground/65">
            {t.promotions.promotedOn}
            {/* ISO on purpose: it is what the element accepts and posts back. */}
            <input
              type="date"
              name="promoted_on"
              defaultValue={today}
              max={today}
              required
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>

          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-foreground/65">
            {t.promotions.promotionNotes}
            <input
              type="text"
              name="notes"
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>

          <button
            type="submit"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
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
