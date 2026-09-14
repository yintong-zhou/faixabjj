"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, type ReactElement } from "react";

import { setLocale } from "@/app/actions/locale";
import { FlagBR, FlagGB, FlagIT } from "@/components/flags";
import {
  LOCALES,
  LOCALE_LABELS,
  LOCALE_SHORT,
  type Locale,
} from "@/utils/i18n/locales";

const FLAGS: Record<Locale, (props: { className?: string }) => ReactElement> = {
  it: FlagIT,
  en: FlagGB,
  "pt-BR": FlagBR,
};

/**
 * The language switcher: a flag and the two-letter code, nothing else.
 *
 * A Client Component for one reason only: it needs the current path so the
 * action can send the reader back to the page they were reading, and a Server
 * Component has no way to know it. Everything else — storing the choice,
 * reading it back — happens on the server.
 *
 * It is built on <details>/<summary> rather than a button with React state so
 * that it still opens, and still switches language, with no JavaScript: each
 * option is a real submit button carrying its own value. The effect below only
 * adds the two conveniences the element lacks — closing on Escape and on a
 * press outside — and the menu never needs closing on submit, because
 * switching language navigates and remounts this component.
 */
export function LanguageSwitcher({
  locale,
  label,
}: {
  locale: Locale;
  label: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.toString();
  const next = query ? `${pathname}?${query}` : pathname;

  useEffect(() => {
    const close = () => {
      if (detailsRef.current) detailsRef.current.open = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!detailsRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const Current = FLAGS[locale];

  return (
    <form action={setLocale} className="flex items-center">
      <input type="hidden" name="next" value={next} />
      <details ref={detailsRef} className="relative">
        <summary
          aria-label={label}
          title={label}
          // `list-none` plus the WebKit pseudo-element removes the disclosure
          // triangle in every engine; without both, Safari keeps drawing it.
          className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-medium text-foreground/70 transition-colors select-none hover:bg-muted [&::-webkit-details-marker]:hidden"
        >
          <Current className="h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-border" />
          {LOCALE_SHORT[locale]}
        </summary>

        <div className="absolute right-0 top-full z-30 mt-1 flex flex-col rounded-xl border border-border bg-surface p-1 shadow-lg">
          {LOCALES.map((value) => {
            const Flag = FLAGS[value];
            const active = value === locale;
            return (
              <button
                key={value}
                type="submit"
                name="locale"
                value={value}
                // The full name is the accessible name rather than visible
                // text: the flag and the code already say which language this
                // is, and each language is named in itself — never translated,
                // because a Brazilian scans for "Português".
                aria-label={LOCALE_LABELS[value]}
                title={LOCALE_LABELS[value]}
                aria-current={active ? "true" : undefined}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted ${
                  active ? "bg-muted text-foreground" : "text-foreground/70"
                }`}
              >
                <Flag className="h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-border" />
                {LOCALE_SHORT[value]}
              </button>
            );
          })}
        </div>
      </details>
    </form>
  );
}
