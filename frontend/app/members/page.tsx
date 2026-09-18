import Link from "next/link";
import { Belt } from "@/components/belt";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { RowMenu } from "@/components/row-menu";
import { isAdminClientConfigured } from "@/utils/supabase/admin";
import { requireRegistryViewer } from "@/utils/supabase/require-admin";
import { beltLabel, beltLabels, roleLabel, roleLabels } from "@/utils/supabase/profile";
import { getDictionary } from "@/utils/i18n/server";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  FilterIcon,
  KeyIcon,
  MailIcon,
  TrendingUpIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "@/components/icons";
import { daysSince, formatDate, formatDays } from "@/utils/dates";
import { DEFAULT_PASSWORD } from "@/utils/default-password";
import { estimateNote, formatHours, hoursFor } from "@/utils/hours";
import { PORTAL_ONLY_ROLE, PORTAL_ONLY_ROLES } from "@/utils/members";
import {
  promotionStatus,
  type Criterion,
  type PromotionInput,
} from "@/utils/promotion";
import {
  addPerson,
  inviteToPortal,
  revokeAccess,
  setTemporaryPassword,
  updateCriterion,
} from "./actions";

const PAGE_SIZE = 20;

const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted";

const menuIconClass = "h-4 w-4 shrink-0";

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

type Member = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string | null;
  joined_at: string;
  current_belt: string;
  current_stripes: number;
  rank_since: string;
  stripe_since: string | null;
  birth_date: string | null;
  active_roles: string[];
  is_active: boolean;
  total_hours: number;
};

type Search = {
  q?: string;
  ruolo?: string;
  cintura?: string;
  attivi?: string;
  idonei?: string;
  p?: string;
  ok?: string;
  error?: string;
};

type RankHours = {
  person_id: string;
  lessons_since_rank: number;
  lessons_since_stripe: number;
};

// The filter state lives in the URL rather than in client state: the list is
// then shareable, survives a reload, and the page needs no client JS at all.
// `idonei` joins the other filters for the same reason: the eligibility queue
// is one more way of looking at this list, not a second page.
function queryString(search: Search, overrides: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const key of ["q", "ruolo", "cintura", "attivi", "idonei", "p"] as const) {
    const value = overrides[key] ?? search[key];
    if (value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return params.toString();
}

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const { t } = await getDictionary();
  // Staff only: an allievo or assistente gets a 404 here, not a redirect.
  const { supabase, access } = await requireRegistryViewer("/members");

  const page = Math.max(1, Number.parseInt(search.p ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const onlyEligible = Boolean(search.idonei);

  // Eligibility is computed over *every* active member, not over the rows of
  // the page being shown. That is what lets the count, the dots and the
  // `idonei` filter be the same fact seen three ways: a per-page computation
  // could not paginate a filter and could not produce a total. A gym is a few
  // hundred rows with narrow columns, so it is one small query.
  const [{ data: activeRows }, { data: rankRows }, { data: criteriaRows }] =
    await Promise.all([
      supabase
        .from("member_overview")
        .select(
          "id, current_belt, current_stripes, rank_since, stripe_since, joined_at, birth_date",
        )
        .eq("is_active", true)
        // Whoever runs the portal without teaching does not train here.
        .not("active_roles", "eq", PORTAL_ONLY_ROLES),
      supabase
        .from("person_rank_hours")
        .select("person_id, lessons_since_rank, lessons_since_stripe"),
      supabase
        .from("promotion_criteria")
        .select("belt, stripe, min_hours, min_time_at_rank_days, min_age_years, notes")
        .order("belt")
        .order("stripe"),
    ]);

  // numeric/bigint columns can come back from PostgREST as strings — coerce
  // here, the one place criteria rows enter the app, so that a string never
  // wins a `<` comparison inside promotionStatus().
  const criteria = (
    (criteriaRows ?? []) as (Criterion & { notes: string | null })[]
  ).map((row) => ({
    ...row,
    min_hours: Number(row.min_hours),
    min_time_at_rank_days: Number(row.min_time_at_rank_days),
  }));
  const rankById = new Map(
    ((rankRows ?? []) as RankHours[]).map((row) => [row.person_id, row]),
  );

  const eligibleIds = new Set(
    (
      (activeRows ?? []) as (Omit<
        PromotionInput,
        "stripe_since" | "lessons_since_rank" | "lessons_since_stripe"
      > & { id: string; stripe_since: string | null })[]
    )
      .filter((m) => {
        const counted = rankById.get(m.id);
        return promotionStatus(
          {
            current_belt: m.current_belt,
            current_stripes: m.current_stripes,
            rank_since: m.rank_since,
            stripe_since: m.stripe_since ?? m.rank_since,
            joined_at: m.joined_at,
            birth_date: m.birth_date,
            lessons_since_rank: Number(counted?.lessons_since_rank ?? 0),
            lessons_since_stripe: Number(counted?.lessons_since_stripe ?? 0),
          },
          criteria,
        ).eligible;
      })
      .map((m) => m.id),
  );
  const eligibleCount = eligibleIds.size;

  // With nobody eligible there is no `in` list to send: PostgREST would get an
  // empty one, so the empty state is rendered from here instead.
  const noEligible = onlyEligible && eligibleCount === 0;

  let members: Member[] = [];
  let total = 0;
  let queryError: { message?: string } | null = null;

  if (!noEligible) {
    let query = supabase
      .from("member_overview")
      .select("*", { count: "exact" })
      // Whoever runs the portal without teaching is not a member of the gym.
      .not("active_roles", "eq", PORTAL_ONLY_ROLES)
      .order("full_name");

    // Constraining by id *before* the count and the range is what keeps the
    // total and the paging right when the eligibility filter is on.
    if (onlyEligible) {
      query = query.in("id", [...eligibleIds]);
    }

    // Name only — searching by email was explicitly excluded. The strip keeps a
    // stray comma or parenthesis from breaking PostgREST's filter syntax.
    const term = (search.q ?? "").trim().replace(/[%,()\\]/g, "");
    if (term) {
      query = query.ilike("full_name", `%${term}%`);
    }
    if (search.ruolo) {
      query = query.contains("active_roles", [search.ruolo]);
    }
    if (search.cintura) {
      query = query.eq("current_belt", search.cintura);
    }
    if (search.attivi) {
      query = query.eq("is_active", true);
    }

    const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
    members = (data ?? []) as Member[];
    total = count ?? 0;
    queryError = error;
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentQuery = queryString(search);
  const eligibleQuery = queryString(search, { idonei: "1", p: "" });

  // `p` is paging, not filtering — it must not make the panel look active or
  // open itself on page 2 of an unfiltered list.
  const activeFilters = [
    search.q ? `"${search.q}"` : null,
    search.ruolo ? roleLabel(search.ruolo, t) : null,
    search.cintura ? beltLabel(search.cintura, t) : null,
    search.attivi ? t.registro.onlyActiveChip : null,
    onlyEligible ? t.promotions.queueTitle : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.registro.title}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          {access.canEditRegistry ? t.registro.leadEditor : t.registro.leadReadOnly}
        </p>
      </header>

      {search.ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {search.ok}
        </p>
      ) : null}
      {search.error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {search.error}
        </p>
      ) : null}
      {queryError ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t.registro.loadFailed}
          </span>
        </p>
      ) : null}

      {access.canEditRegistry ? (
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer px-4 py-3 font-heading text-base font-semibold sm:px-5 sm:py-4">
            <UserPlusIcon className="mr-2 inline-block h-4.5 w-4.5 align-[-0.2em] text-accent" />
            {t.registro.addPerson}
          </summary>

          <form action={addPerson} className="flex flex-col gap-3 px-4 pb-4 sm:gap-4 sm:px-5 sm:pb-5">
            <input type="hidden" name="_query" value={currentQuery} />

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
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className={fieldClass}
                />
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
                <input
                  id="birth_date"
                  name="birth_date"
                  type="date"
                  className={fieldClass}
                />
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
                <input
                  id="rank_since"
                  name="rank_since"
                  type="date"
                  className={fieldClass}
                />
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
              <select
                id="role"
                name="role"
                required
                defaultValue=""
                className={fieldClass}
              >
                <option value="" disabled>
                  {t.registro.select}
                </option>
                <option value="student">Allievo</option>
                <option value="assistant">Assistente</option>
                <option value="instructor">Istruttore</option>
                <option value="head_coach">Maestro</option>
                <option value="admin">Admin</option>
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
        </details>
      ) : null}

      {/* The criteria behind the count above. It is a panel on this page and
          not a page of its own for the same reason account management is: one
          list of people, not two. */}
      {access.canEditRegistry ? (
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer px-4 py-3 font-heading text-base font-semibold sm:px-5 sm:py-4">
            <TrendingUpIcon className="mr-2 inline-block h-4.5 w-4.5 align-[-0.2em] text-accent" />
            {t.promotions.criteriaTitle}
          </summary>

          <div className="flex flex-col gap-3 px-4 pb-4 sm:px-5 sm:pb-5">
            <p className="text-sm text-foreground/65">{t.promotions.criteriaIntro}</p>
            {/* The unit has to be readable, not hovered: a `title` never
                appears on the phone this app is used on. */}
            <p className="text-xs leading-relaxed text-foreground/55">
              {t.promotions.hoursNote}
            </p>

            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {criteria.map((criterion) => (
                <li key={`${criterion.belt}-${criterion.stripe}`} className="p-3 sm:p-4">
                  <form
                    action={updateCriterion}
                    className="flex flex-wrap items-end gap-3"
                  >
                    {/* Saving a criterion must come back to the list you were
                        looking at, like every other action on this page. */}
                    <input type="hidden" name="_query" value={currentQuery} />
                    <input type="hidden" name="belt" value={criterion.belt} />
                    <input type="hidden" name="stripe" value={criterion.stripe} />

                    <span className="flex min-w-[9rem] items-center gap-2 text-sm font-medium">
                      <Belt belt={criterion.belt} stripes={criterion.stripe} />
                    </span>

                    <label className="flex flex-col gap-1 text-xs text-foreground/65">
                      {t.promotions.minHours}
                      <input
                        type="number"
                        name="min_hours"
                        min={0}
                        step="0.5"
                        defaultValue={criterion.min_hours}
                        required
                        className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
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
                        className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
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
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                      />
                    </label>

                    <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-foreground/65">
                      {t.promotions.criterionNotes}
                      <input
                        type="text"
                        name="notes"
                        defaultValue={criterion.notes ?? ""}
                        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                      />
                    </label>

                    <button
                      type="submit"
                      className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
                    >
                      {t.promotions.save}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}

      {/* Open only when something is filtering: an untouched list keeps the
          panel out of the way, a filtered one shows why it is short. */}
      <details open={activeFilters.length > 0} className="rounded-xl border border-border">
        <summary className="cursor-pointer px-4 py-3 font-heading text-base font-semibold sm:px-5 sm:py-4">
          <FilterIcon className="mr-2 inline-block h-4.5 w-4.5 align-[-0.2em] text-accent" />
          {t.registro.filters}
          {activeFilters.length > 0 ? (
            <span className="font-body text-xs font-normal text-foreground/60">
              {" · "}
              {activeFilters.join(" · ")}
            </span>
          ) : null}
        </summary>

        <form
          method="get"
          action="/members"
          className="flex flex-col gap-2.5 px-4 pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3 sm:px-5 sm:pb-5"
        >
          {/* Carried through the form, or narrowing by belt while looking at
              the queue would silently drop you back into the whole list. */}
          {onlyEligible ? <input type="hidden" name="idonei" value="1" /> : null}

          <div className="flex min-w-52 flex-1 flex-col gap-1.5">
            <label htmlFor="q" className="text-xs font-medium text-foreground/65">
              {t.registro.name}
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={search.q ?? ""}
              placeholder={t.registro.searchByName}
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ruolo" className="text-xs font-medium text-foreground/65">
              {t.registro.role}
            </label>
            <select
              id="ruolo"
              name="ruolo"
              defaultValue={search.ruolo ?? ""}
              className={fieldClass}
            >
              <option value="">Tutti</option>
              {/* No "Admin" entry: a portal-only admin is filtered out of the
                  list below, so the option would always return nothing. Admin
                  is still assignable from "Aggiungi persona". */}
              {Object.entries(roleLabels(t))
                .filter(([value]) => value !== PORTAL_ONLY_ROLE)
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="cintura" className="text-xs font-medium text-foreground/65">
              {t.account.belt}
            </label>
            <select
              id="cintura"
              name="cintura"
              defaultValue={search.cintura ?? ""}
              className={fieldClass}
            >
              <option value="">Tutte</option>
              {Object.entries(beltLabels(t)).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 py-2.5 text-sm">
            <input
              type="checkbox"
              name="attivi"
              value="1"
              defaultChecked={Boolean(search.attivi)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            {t.registro.onlyActive}
          </label>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              {t.registro.filter}
            </button>
            {activeFilters.length > 0 ? (
              <Link
                href="/members"
                className="rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                {t.registro.reset}
              </Link>
            ) : null}
          </div>
        </form>
      </details>

      {/* The queue is a line above this list, not a list of its own: putting
          the eligible people in their own list would show the same person
          twice on one screen. It is a link that filters the list below. */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-border px-4 py-3 sm:px-5 sm:py-4">
        {eligibleCount === 0 ? (
          <span className="flex items-center gap-2 text-sm text-foreground/60">
            <TrendingUpIcon className="h-4 w-4 shrink-0" />
            {t.promotions.queueEmpty}
          </span>
        ) : onlyEligible ? (
          <span className="flex items-center gap-2 text-sm font-medium">
            <TrendingUpIcon className="h-4 w-4 shrink-0 text-accent" />
            {t.promotions.queueTitle}
            {" · "}
            {t.promotions.eligibleCount(eligibleCount)}
          </span>
        ) : (
          <Link
            href={`/members?${eligibleQuery}`}
            className="flex items-center gap-2 text-sm font-medium hover:text-accent"
          >
            <TrendingUpIcon className="h-4 w-4 shrink-0 text-accent" />
            {t.promotions.queueTitle}
            {" · "}
            {t.promotions.eligibleCount(eligibleCount)}
          </Link>
        )}
        <span className="text-xs leading-relaxed text-foreground/55">
          {t.promotions.queueIntro}
        </span>
        {/* Visible text, not a tooltip: a `title` never appears on the phone
            this app is used on. */}
        {eligibleCount > 0 ? (
          <span className="text-xs leading-relaxed text-foreground/55">
            {t.promotions.hoursNote}
          </span>
        ) : null}
      </div>

      <p className="text-sm text-foreground/60">
        {total === 0
          ? t.registro.noneFound
          : t.registro.countAndPage(total, page, lastPage)}
      </p>

      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {members.map((member) => {
          const canInvite =
            !member.auth_user_id && member.email && isAdminClientConfigured();
          const canManageAccount = Boolean(member.auth_user_id);
          const hours = hoursFor(member.joined_at, member.total_hours);

          // items-center keeps the kebab vertically centred against the row,
          // whose height is set by the details block on the left.
          return (
            <li key={member.id} className="flex items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {member.full_name}
                  <Belt
                    belt={member.current_belt}
                    stripes={member.current_stripes}
                  />
                  {eligibleIds.has(member.id) ? (
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-[var(--success)]"
                      title={t.promotions.queueTitle}
                      aria-label={t.promotions.queueTitle}
                    />
                  ) : null}
                  {member.auth_user_id ? null : (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-foreground/55">
                      {t.registro.noAccount}
                    </span>
                  )}
                </span>


                {/* Two counters, from two different dates: how long they have
                    trained at all (joined_at) and how long at the current rank
                    (rank_since) — the second is what promotion eligibility
                    actually hangs on. */}
                <span className="text-xs text-foreground/70">
                  {t.registro.trainingFor(formatDays(daysSince(member.joined_at), t))}
                  {" · "}
                  {/* The colour is no longer spelled out here: the belt is
                      drawn next to the name, a few pixels above. */}
                  {t.registro.atCurrentBelt(
                    formatDays(daysSince(member.rank_since), t),
                  )}
                </span>

                <span className="text-xs text-foreground/55">
                  {member.active_roles.length > 0
                    ? member.active_roles.map((r) => roleLabel(r, t)).join(", ")
                    : t.registro.noActiveRole}
                  {" · "}
                  {/* Mostly estimated until the gym has been recording for a
                      while, so the row says so rather than presenting an
                      assumption as a count. */}
                  <span title={hours.isPartlyEstimated ? estimateNote(hours.estimated, t) : undefined}>
                    {formatHours(hours.total, t)}
                    {hours.isPartlyEstimated ? t.registro.estimateSuffix : ""}
                  </span>
                  {t.registro.memberSince}
                  {formatDate(member.joined_at)}
                </span>
              </div>

              {/* Every action sits behind the kebab so none of them — least of
                  all revoking access — can be hit by a stray tap while
                  scrolling the list. */}
              <RowMenu label={t.registro.rowActions(member.full_name)}>
                <Link
                  href={`/members/${member.id}?from=${encodeURIComponent(currentQuery)}`}
                  className={menuItemClass}
                >
                  <FileTextIcon className={menuIconClass} />
                  {t.registro.details}
                </Link>

                {access.canEditRegistry ? (
                  <Link
                    href={`/members/${member.id}?from=${encodeURIComponent(currentQuery)}#promote`}
                    className={menuItemClass}
                  >
                    <TrendingUpIcon className={menuIconClass} />
                    {t.promotions.promote}
                  </Link>
                ) : null}

                {access.canEditRegistry && canInvite ? (
                    <form action={inviteToPortal}>
                      <input type="hidden" name="_query" value={currentQuery} />
                      <input type="hidden" name="email" value={member.email ?? ""} />
                      <input type="hidden" name="full_name" value={member.full_name} />
                      <button type="submit" className={menuItemClass}>
                        <MailIcon className={menuIconClass} />
                        {t.registro.invite}
                      </button>
                    </form>
                  ) : null}

                {access.canEditRegistry && canManageAccount ? (
                    <>
                      {/* The provisional password is the shared default, not
                          a chosen one, so the menu shows no field: nothing here
                          has to be read back off the screen. */}
                      <form action={setTemporaryPassword}>
                        <input type="hidden" name="_query" value={currentQuery} />
                        <input
                          type="hidden"
                          name="user_id"
                          value={member.auth_user_id ?? ""}
                        />
                        <ConfirmSubmitButton
                          message={t.registro.resetPasswordConfirm(member.full_name)}
                          className={menuItemClass}
                        >
                          <KeyIcon className={menuIconClass} />
                          {t.registro.resetPassword}
                        </ConfirmSubmitButton>
                      </form>

                      <form action={revokeAccess}>
                        <input type="hidden" name="_query" value={currentQuery} />
                        <input
                          type="hidden"
                          name="user_id"
                          value={member.auth_user_id ?? ""}
                        />
                        <ConfirmSubmitButton
                          message={t.registro.revokeConfirm(member.full_name)}
                          className={`${menuItemClass} text-accent hover:bg-accent/10`}
                        >
                          <UserMinusIcon className={menuIconClass} />
                          {t.registro.revoke}
                        </ConfirmSubmitButton>
                      </form>
                    </>
                  ) : null}
              </RowMenu>
            </li>
          );
        })}

        {members.length === 0 ? (
          <li className="px-3 py-3 text-sm text-foreground/60 sm:p-4">
            {t.registro.noMatch}
          </li>
        ) : null}
      </ul>

      {lastPage > 1 ? (
        <nav className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link
              href={`/members?${queryString(search, { p: String(page - 1) })}`}
              className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              {t.registro.previous}
            </Link>
          ) : (
            <span />
          )}

          {page < lastPage ? (
            <Link
              href={`/members?${queryString(search, { p: String(page + 1) })}`}
              className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              {t.registro.next}
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
