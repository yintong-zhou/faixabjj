import Link from "next/link";

import { ChevronLeftIcon, UserPlusIcon } from "@/components/icons";
import { DEFAULT_PASSWORD } from "@/utils/default-password";
import { getDictionary } from "@/utils/i18n/server";
import { beltLabels, roleLabels } from "@/utils/supabase/profile";
import { requireRegistryEditor } from "@/utils/supabase/require-admin";
import { addPerson } from "../actions";

const PATH = "/members/new";

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

// A form, not a second list of people. The project's rule is that every staff
// function *about the members* lives inside the Registro, which is why account
// management is a row menu there and why there is no promotions page. Moving
// this form to its own route does not touch that rule: it lists nobody, it is
// reached only from the Registro, and it returns straight to it.
//
// What it buys on a phone is the whole screen. Inside the list it was a panel
// that pushed every member below the fold the moment it opened, on a form long
// enough to need two columns at `sm:`.
//
// requireRegistryEditor, not Viewer: an instructor sees the Registro read-only
// and must not reach this at all. It answers 404, never 403 — a student should
// not learn the staff sections exist.
type Search = { from?: string };

export default async function AddPersonPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { from } = await searchParams;
  const { t } = await getDictionary();
  await requireRegistryEditor(PATH);

  // The list's filters travel here and back, so adding somebody while looking
  // at a filtered list returns to that list rather than resetting it — the same
  // contract every row action on the Registro already honours.
  const query = from ?? "";
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

      <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
        <UserPlusIcon className="h-5 w-5 shrink-0 text-accent" />
        {t.registro.addPerson}
      </h1>

      <form action={addPerson} className="flex flex-col gap-3 sm:gap-4">
        <input type="hidden" name="_query" value={query} />

        <p className="text-xs text-foreground/55">
          {t.registro.defaultPasswordNoteBefore}{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-medium">
            {DEFAULT_PASSWORD}
          </code>{" "}
          {t.registro.defaultPasswordNoteAfter}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="full_name" className="text-sm font-medium">
              {t.account.fullName}
            </label>
            <input id="full_name" name="full_name" required className={fieldClass} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              {t.auth.email}
            </label>
            <input id="email" name="email" type="email" required className={fieldClass} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-medium">
              {t.account.phone}
            </label>
            <input id="phone" name="phone" type="tel" className={fieldClass} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="birth_date" className="text-sm font-medium">
              {t.account.birthDate}
            </label>
            <input id="birth_date" name="birth_date" type="date" className={fieldClass} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="current_belt" className="text-sm font-medium">
              {t.account.belt}
            </label>
            <select
              id="current_belt"
              name="current_belt"
              required
              defaultValue=""
              className={fieldClass}
            >
              <option value="" disabled>
                {t.registro.select}
              </option>
              {Object.entries(beltLabels(t)).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="current_stripes" className="text-sm font-medium">
              {t.registro.stripes}
            </label>
            <select
              id="current_stripes"
              name="current_stripes"
              defaultValue="0"
              className={fieldClass}
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="rank_since" className="text-sm font-medium">
              {t.account.beltSince}{" "}
              <span className="text-foreground/50">{t.registro.todayIfEmpty}</span>
            </label>
            <input id="rank_since" name="rank_since" type="date" className={fieldClass} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="stripe_since" className="text-sm font-medium">
              {t.account.stripeSince}{" "}
              <span className="text-foreground/50">{t.registro.todayIfEmpty}</span>
            </label>
            <input
              id="stripe_since"
              name="stripe_since"
              type="date"
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="joined_at" className="text-sm font-medium">
              {t.account.joinedOn}
            </label>
            <input
              id="joined_at"
              name="joined_at"
              type="date"
              required
              className={fieldClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="role" className="text-sm font-medium">
            {t.registro.role}
          </label>
          {/* From roleLabels(), not five hardcoded Italian words: this select
              was the one place in the app still spelling the roles out, so it
              read "Allievo" to an English or Brazilian instructor. Admin stays
              in the list — this is the one screen where a portal-only account
              is legitimately created. */}
          <select id="role" name="role" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              {t.registro.select}
            </option>
            {Object.entries(roleLabels(t)).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-sm font-medium">
            {t.account.notes}
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            className={`${fieldClass} resize-y`}
          />
        </div>

        <button
          type="submit"
          className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t.registro.addToRegistry}
        </button>
      </form>
    </div>
  );
}
