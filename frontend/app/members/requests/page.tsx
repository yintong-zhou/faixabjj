import type { Metadata } from "next";
import Link from "next/link";

import { Belt } from "@/components/belt";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { AlertCircleIcon, CheckCircleIcon, ChevronLeftIcon, UserPlusIcon } from "@/components/icons";
import { formatDate } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { beltLabels } from "@/utils/supabase/profile";
import { requireUserManager } from "@/utils/supabase/require-admin";

import { approveRegistration, rejectRegistration } from "./actions";
import { accountlessPeople, linkedPersonIn } from "./linked-person";

const PATH = "/members/requests";

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.requests.title };
}

type RequestRow = {
  id: string;
  full_name: string;
  email: string;
  username: string;
  birth_date: string;
  joined_at: string;
  current_belt: string;
  current_stripes: number;
  rank_since: string;
  stripe_since: string;
  created_at: string;
};

// Not a second list of members: these people are not members yet. A sub-route
// of the Registro like /members/new, reached only from its chip strip.
// requireUserManager (404): approving creates an account and sets a belt, which
// is the head coach's and the admin's call, never an instructor's.
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { t } = await getDictionary();
  const { supabase } = await requireUserManager(PATH);

  const { data, error: listError } = await supabase
    .from("registration_request")
    .select("id, full_name, email, username, birth_date, joined_at, current_belt, current_stripes, rank_since, stripe_since, created_at")
    .order("created_at");
  if (listError) logDbError("requests", "list", listError);
  const requests = (data ?? []) as RequestRow[];
  const people = requests.length ? await accountlessPeople(supabase) : [];
  const belts = Object.entries(beltLabels(t));

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:gap-5 sm:px-6 sm:py-7">
      <Link href="/members" className="flex w-fit items-center gap-1 text-sm font-medium text-accent hover:opacity-80">
        <ChevronLeftIcon className="h-4 w-4" />
        {t.nav.registro}
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
          <UserPlusIcon className="h-5 w-5 shrink-0 text-accent" />
          {t.requests.title}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">{t.requests.lead}</p>
      </header>

      {ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {requests.length === 0 ? <p className="text-sm text-foreground/65">{t.requests.empty}</p> : null}

      <ul className="flex flex-col gap-3">
        {requests.map((request) => {
          const linked = linkedPersonIn(people, request.email);
          return (
            <li key={request.id} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">{request.full_name}</p>
                  <p className="text-sm text-foreground/65">
                    {request.email} · @{request.username}
                  </p>
                  <p className="text-xs text-foreground/55">
                    {t.account.birthDate}: {formatDate(request.birth_date)} · {t.join.form.joinedAt}:{" "}
                    {formatDate(request.joined_at)} · {t.requests.sentOn(formatDate(request.created_at.slice(0, 10)))}
                  </p>
                </div>
                <Belt belt={request.current_belt} stripes={request.current_stripes} />
              </div>

              {linked ? (
                <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {t.requests.linkWarning(linked.full_name)}
                </p>
              ) : null}

              <details className="rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{t.requests.review}</summary>
                <form action={approveRegistration} className="grid gap-3 p-3 sm:grid-cols-2 sm:gap-4">
                  <input type="hidden" name="request_id" value={request.id} />
                  {/* The approver always sees and confirms the grade, so the
                      "first time" shortcut of the public form does not apply. */}
                  <input type="hidden" name="experienced" value="yes" />
                  <TextField id={`full_name-${request.id}`} name="full_name" label={t.join.form.fullName} defaultValue={request.full_name} required />
                  <TextField id={`email-${request.id}`} name="email" type="email" label={t.join.form.email} defaultValue={request.email} required />
                  <TextField id={`birth_date-${request.id}`} name="birth_date" type="date" label={t.join.form.birthDate} defaultValue={request.birth_date} required />
                  <TextField id={`joined_at-${request.id}`} name="joined_at" type="date" label={t.join.form.joinedAt} defaultValue={request.joined_at} required />
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`current_belt-${request.id}`} className="text-sm font-medium">{t.join.form.belt}</label>
                    <select id={`current_belt-${request.id}`} name="current_belt" defaultValue={request.current_belt} className={fieldClass}>
                      {belts.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`current_stripes-${request.id}`} className="text-sm font-medium">{t.join.form.stripes}</label>
                    <select id={`current_stripes-${request.id}`} name="current_stripes" defaultValue={String(request.current_stripes)} className={fieldClass}>
                      {[0, 1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <TextField id={`rank_since-${request.id}`} name="rank_since" type="date" label={t.account.beltSince} defaultValue={request.rank_since} />
                  <TextField id={`stripe_since-${request.id}`} name="stripe_since" type="date" label={t.account.stripeSince} defaultValue={request.stripe_since} />
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
                    >
                      {t.requests.approve}
                    </button>
                  </div>
                </form>
              </details>

              <form action={rejectRegistration}>
                <input type="hidden" name="request_id" value={request.id} />
                <ConfirmSubmitButton
                  message={t.requests.rejectConfirm(request.full_name)}
                  className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-muted"
                >
                  {t.requests.reject}
                </ConfirmSubmitButton>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TextField({
  id,
  name,
  label,
  defaultValue,
  type = "text",
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input id={id} name={name} type={type} required={required} defaultValue={defaultValue} className={fieldClass} />
    </div>
  );
}
