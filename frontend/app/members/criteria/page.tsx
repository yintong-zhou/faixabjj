import Link from "next/link";

import { Belt } from "@/components/belt";
import { ChevronLeftIcon, TrendingUpIcon } from "@/components/icons";
import { getDictionary } from "@/utils/i18n/server";
import type { Criterion } from "@/utils/promotion";
import { requireRegistryEditor } from "@/utils/supabase/require-admin";
import { updateCriterion } from "../actions";

const PATH = "/members/criteria";

// The thresholds behind the eligibility alerts, on their own route.
//
// This is NOT the promotions page that was built and removed. That one was a
// *queue of people* — the same people the Registro already lists — and it broke
// the rule that there is one list of people, not two. The queue is still where
// it belongs: a count, a filter and a green dot on the Registro's own list.
// What lives here is a table of belts and numbers, which is nobody's list.
//
// It left the Registro because of its shape: seventeen belts times their
// stripes is around sixty rows of four number fields each, which as a panel
// buried the member list under a wall of inputs the moment it opened. On a
// phone that is several screens of scrolling before the first member.
//
// requireRegistryEditor, not Viewer: an instructor sees the Registro read-only
// and never edits a threshold. 404, never 403.
type Search = { from?: string; ok?: string; error?: string };

export default async function CriteriaPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const { t } = await getDictionary();
  const { supabase } = await requireRegistryEditor(PATH);

  const { data: criteriaRows } = await supabase
    .from("promotion_criteria")
    .select("belt, stripe, min_hours, min_time_at_rank_days, min_age_years, notes")
    .order("belt")
    .order("stripe");

  // numeric/bigint columns can come back from PostgREST as strings. Coerced
  // here, where they enter the page, so a string never wins a comparison later.
  const criteria = (
    (criteriaRows ?? []) as (Criterion & { notes: string | null })[]
  ).map((row) => ({
    ...row,
    min_hours: Number(row.min_hours),
    min_time_at_rank_days: Number(row.min_time_at_rank_days),
  }));

  const query = search.from ?? "";
  const backHref = query ? `/members?${query}` : "/members";

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:gap-5 sm:px-6 sm:py-7">
      <Link
        href={backHref}
        className="flex w-fit items-center gap-1 text-sm font-medium text-accent hover:opacity-80"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        {t.nav.registro}
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
          <TrendingUpIcon className="h-5 w-5 shrink-0 text-accent" />
          {t.promotions.criteriaPageTitle}
        </h1>
        <p className="text-sm text-foreground/65">{t.promotions.criteriaIntro}</p>
        {/* The unit has to be readable, not hovered: a `title` never appears on
            the phone this app is used on. */}
        <p className="text-xs leading-relaxed text-foreground/55">
          {t.promotions.hoursNote}
        </p>
      </div>

      {search.ok ? (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          {search.ok}
        </p>
      ) : null}
      {search.error ? (
        <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          {search.error}
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {criteria.map((criterion) => (
          <li key={`${criterion.belt}-${criterion.stripe}`} className="p-3 sm:p-4">
            {/* Two layouts from one markup.

                On a phone the row is a column: the belt on its own line as the
                heading of the block it names, then the three numbers side by
                side, then the note, then the button. Wrapping a single flex row
                instead — which is what this was — left the fields landing at
                different widths on each line and the belt pinned to the bottom
                edge of the first one, well away from the row it belongs to.

                From `sm:` up it is the original single row. `sm:contents` makes
                the mobile-only grid around the three numbers vanish, so its
                labels become direct children of the flex row again rather than
                a block that wraps as one. */}
            <form
              action={updateCriterion}
              className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
            >
              {/* Saving returns here, carrying the Registro's filters through
                  untouched so the back link still leads to the list you came
                  from. */}
              <input type="hidden" name="_from" value={query} />
              <input type="hidden" name="belt" value={criterion.belt} />
              <input type="hidden" name="stripe" value={criterion.stripe} />

              {/* `items-end` on the row at `sm:` is what aligns the belt: its
                  bottom edge lines up with the bottom of every input beside it,
                  rather than floating against labels that are taller than it. */}
              <span className="flex sm:min-w-[9rem] sm:items-end">
                <Belt belt={criterion.belt} stripes={criterion.stripe} size="md" />
              </span>

              <div className="grid grid-cols-3 gap-2 sm:contents">
                <label className="flex flex-col gap-1 text-xs text-foreground/65">
                  {t.promotions.minHours}
                  <input
                    type="number"
                    name="min_hours"
                    min={0}
                    step="0.5"
                    defaultValue={criterion.min_hours}
                    required
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm sm:w-24"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-foreground/65">
                  {t.promotions.minDays}
                  <input
                    type="number"
                    name="min_time_at_rank_days"
                    min={0}
                    step="1"
                    defaultValue={criterion.min_time_at_rank_days}
                    required
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm sm:w-24"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-foreground/65">
                  {t.promotions.minAge}
                  <input
                    type="number"
                    name="min_age_years"
                    min={0}
                    max={99}
                    step="1"
                    defaultValue={criterion.min_age_years ?? ""}
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm sm:w-20"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs text-foreground/65 sm:min-w-[12rem] sm:flex-1">
                {t.promotions.criterionNotes}
                <input
                  type="text"
                  name="notes"
                  defaultValue={criterion.notes ?? ""}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                />
              </label>

              <button
                type="submit"
                className="min-h-11 w-full rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 sm:min-h-0 sm:w-auto"
              >
                {t.promotions.save}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
