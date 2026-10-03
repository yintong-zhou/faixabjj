"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";

import { AlertCircleIcon } from "@/components/icons";
import { PasswordInput } from "@/components/password-input";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";
import { isValidUsername, normalizeUsername, suggestUsername, USERNAME_MAX } from "@/utils/username";

import type { JoinState, UsernameStatus } from "../actions";

type Labels = Dictionary["join"]["form"];

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

const INITIAL: JoinState = { error: null, values: {}, attempt: 0 };

export function JoinForm({
  action,
  checkUsername,
  labels,
  belts,
  turnstile,
}: {
  action: (prev: JoinState, formData: FormData) => Promise<JoinState>;
  checkUsername: (username: string) => Promise<UsernameStatus>;
  labels: Labels;
  belts: { value: string; label: string }[];
  turnstile: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  // A Turnstile token is redeemed once: after a refused attempt the widget
  // needs a fresh one, or the next submit fails the check again.
  useEffect(() => {
    if (state.attempt > 0) {
      (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
    }
  }, [state.attempt]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Remounted on every attempt so the fields restart from the values the
          action sent back. */}
      <Fields key={state.attempt} values={state.values} labels={labels} belts={belts} checkUsername={checkUsername} />

      {state.error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      {turnstile}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? labels.sending : labels.submit}
      </button>
    </form>
  );
}

function Fields({
  values,
  labels,
  belts,
  checkUsername,
}: {
  values: Record<string, string>;
  labels: Labels;
  belts: { value: string; label: string }[];
  checkUsername: (username: string) => Promise<UsernameStatus>;
}) {
  const [name, setName] = useState(values.full_name ?? "");
  // The username follows the name (Mario Rossi → mario.rossi) until typed by hand.
  const [typed, setTyped] = useState<string | null>(values.username || null);
  const username = typed ?? (name.trim() ? suggestUsername(name) : "");
  const [experienced, setExperienced] = useState(values.experienced ?? "");

  // Format checked here; availability asked of the server after a pause. The
  // answer is kept with the name it answers for, so a late reply for an old
  // name is never shown against the new one.
  const candidate = normalizeUsername(username);
  const [answer, setAnswer] = useState<{ candidate: string; status: UsernameStatus } | null>(null);
  useEffect(() => {
    if (!isValidUsername(candidate)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const status = await checkUsername(candidate);
      if (!cancelled) setAnswer({ candidate, status });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candidate, checkUsername]);

  const status: "idle" | "checking" | UsernameStatus = !candidate
    ? "idle"
    : !isValidUsername(candidate)
      ? "invalid"
      : answer?.candidate === candidate
        ? answer.status
        : "checking";
  const statusText = {
    idle: labels.usernameHelp,
    checking: labels.usernameChecking,
    available: labels.usernameAvailable,
    taken: labels.usernameTaken,
    invalid: labels.usernameInvalid,
    error: labels.usernameUnknown,
  }[status];
  const statusClass =
    status === "available" ? "text-foreground/80" : status === "taken" || status === "invalid" ? "text-accent" : "text-foreground/55";

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="full_name" className="text-sm font-medium">{labels.fullName}</label>
        <input
          id="full_name"
          name="full_name"
          required
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">{labels.email}</label>
        <input id="email" name="email" type="email" required autoComplete="email" defaultValue={values.email} className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor="username" className="text-sm font-medium">{labels.username}</label>
        <input
          id="username"
          name="username"
          required
          value={username}
          onChange={(event) => setTyped(event.target.value)}
          maxLength={USERNAME_MAX}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby="username-status"
          className={fieldClass}
        />
        <p id="username-status" aria-live="polite" className={`text-xs ${statusClass}`}>{statusText}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">{labels.password}</label>
        <PasswordInput id="password" name="password" required autoComplete="new-password" showLabel={labels.showPassword} hideLabel={labels.hidePassword} />
        <p className="text-xs text-foreground/55">{labels.passwordHint}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password_repeat" className="text-sm font-medium">{labels.passwordRepeat}</label>
        <PasswordInput id="password_repeat" name="password_repeat" required autoComplete="new-password" showLabel={labels.showPassword} hideLabel={labels.hidePassword} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="birth_date" className="text-sm font-medium">{labels.birthDate}</label>
        <input id="birth_date" name="birth_date" type="date" required defaultValue={values.birth_date} className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="joined_at" className="text-sm font-medium">{labels.joinedAt}</label>
        <input id="joined_at" name="joined_at" type="date" required defaultValue={values.joined_at} className={fieldClass} />
      </div>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">{labels.experienced}</legend>
        <div className="flex flex-wrap gap-4">
          {(["yes", "no"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="experienced"
                value={value}
                required
                checked={experienced === value}
                onChange={() => setExperienced(value)}
              />
              {value === "yes" ? labels.experiencedYes : labels.experiencedNo}
            </label>
          ))}
        </div>
        {experienced === "no" ? <p className="text-xs text-foreground/55">{labels.beginnerNote}</p> : null}
      </fieldset>

      {experienced === "yes" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="current_belt" className="text-sm font-medium">{labels.belt}</label>
            <select id="current_belt" name="current_belt" required defaultValue={values.current_belt ?? ""} className={fieldClass}>
              <option value="" disabled>{labels.select}</option>
              {belts.map((belt) => (
                <option key={belt.value} value={belt.value}>{belt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="current_stripes" className="text-sm font-medium">{labels.stripes}</label>
            <select id="current_stripes" name="current_stripes" defaultValue={values.current_stripes || "0"} className={fieldClass}>
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="rank_since" className="text-sm font-medium">{labels.rankSince}</label>
            <input id="rank_since" name="rank_since" type="date" defaultValue={values.rank_since} className={fieldClass} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="stripe_since" className="text-sm font-medium">{labels.stripeSince}</label>
            <input id="stripe_since" name="stripe_since" type="date" defaultValue={values.stripe_since} className={fieldClass} />
          </div>

          <p className="text-xs text-foreground/55 sm:col-span-2">{labels.datesHint}</p>
        </>
      ) : null}

      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="privacy" required defaultChecked={values.privacy === "on"} className="mt-0.5" />
        <span>
          {labels.privacyConsent} —{" "}
          <Link href="/privacy" target="_blank" className="font-medium text-accent hover:opacity-80">
            {labels.privacyLink}
          </Link>
        </span>
      </label>
    </div>
  );
}
