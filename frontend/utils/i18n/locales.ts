// The languages the app speaks, and how a choice is remembered.
//
// The locale lives in a cookie rather than in the URL, an explicit decision:
// almost every page here sits behind a login, where a per-language URL buys
// nothing, and the alternative meant moving every route under `app/[locale]/`
// and rewriting every link and the proxy for the benefit of one public page.

export const LOCALES = ["it", "en", "pt-BR"] as const;

export type Locale = (typeof LOCALES)[number];

// English, not Italian: the gym's intake is international, and English is the
// language a first-time visitor is most likely to read. Italian stays the
// language the dictionaries are authored in (`it.ts` defines the type), which
// is a different thing from the language the app opens in.
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "faixabjj-locale";

/** A year: the choice is a preference, not a session detail. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Each language named in itself. A Brazilian looking for their language scans
 * for "Português", not for "Portuguese" — so this list is never translated.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  it: "Italiano",
  en: "English",
  "pt-BR": "Português (BR)",
};

/** Short label for the narrow switcher in the header. */
export const LOCALE_SHORT: Record<Locale, string> = {
  it: "IT",
  en: "EN",
  "pt-BR": "PT",
};

/** The tag for `<html lang>` and for Intl. */
export const LOCALE_TAG: Record<Locale, string> = {
  it: "it-IT",
  en: "en-GB",
  "pt-BR": "pt-BR",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Best match for an `Accept-Language` header, used only when no choice has
 * been made yet. Deliberately crude — it compares the primary subtag, so
 * "pt-PT" lands on Brazilian Portuguese, which is far closer than English.
 */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const wanted = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((entry) => entry.tag && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of wanted) {
    const exact = LOCALES.find((locale) => locale.toLowerCase() === tag);
    if (exact) return exact;

    const primary = tag.split("-")[0];
    const loose = LOCALES.find(
      (locale) => locale.toLowerCase().split("-")[0] === primary,
    );
    if (loose) return loose;
  }

  return DEFAULT_LOCALE;
}
