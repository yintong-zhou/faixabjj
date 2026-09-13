"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";

import { setLocale } from "@/app/actions/locale";
import {
  LOCALES,
  LOCALE_LABELS,
  LOCALE_SHORT,
  type Locale,
} from "@/utils/i18n/locales";

/**
 * The language switcher.
 *
 * A Client Component for one reason only: it needs the current path so the
 * action can send the reader back to the page they were reading, and a Server
 * Component has no way to know it. Everything else — storing the choice,
 * reading it back — happens on the server.
 *
 * It submits on change, and keeps a real submit button for the case where the
 * script has not loaded: a form that only works with JavaScript would be the
 * one control in this app that does.
 */
export function LanguageSwitcher({
  locale,
  label,
}: {
  locale: Locale;
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.toString();
  const next = query ? `${pathname}?${query}` : pathname;

  return (
    <form ref={formRef} action={setLocale} className="flex items-center">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="locale" className="sr-only">
        {label}
      </label>
      <select
        id="locale"
        name="locale"
        defaultValue={locale}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label={label}
        className="cursor-pointer rounded-full border border-border bg-transparent px-2.5 py-1.5 text-xs font-medium outline-none transition-colors hover:bg-muted focus:border-accent"
      >
        {LOCALES.map((value) => (
          <option key={value} value={value}>
            {/* The short form in the closed control, the full name once the
                list is open. Each language is named in itself, never
                translated: a Brazilian scans for "Português". */}
            {LOCALE_SHORT[value]} · {LOCALE_LABELS[value]}
          </option>
        ))}
      </select>
      <button type="submit" className="sr-only">
        {label}
      </button>
    </form>
  );
}
