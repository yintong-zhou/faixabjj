import "server-only";

import { cookies, headers } from "next/headers";

import { en } from "./dictionaries/en";
import { it, type Dictionary } from "./dictionaries/it";
import { ptBR } from "./dictionaries/pt-BR";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type Locale,
  isLocale,
  matchLocale,
} from "./locales";

const DICTIONARIES: Record<Locale, Dictionary> = {
  it,
  en,
  "pt-BR": ptBR,
};

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? it;
}

/**
 * The reader's language: their saved choice, else the closest match to the
 * browser's `Accept-Language`, else English, the app's default language.
 *
 * The header is consulted only when no cookie exists. Once somebody has
 * chosen, the choice wins even if their browser disagrees — a Brazilian
 * instructor working on an Italian-configured gym laptop has made a decision,
 * and a header should not keep overruling it.
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  try {
    const headerStore = await headers();
    return matchLocale(headerStore.get("accept-language"));
  } catch {
    // Headers are not always available (a statically rendered page); the
    // default language is a sane answer rather than a crash.
    return DEFAULT_LOCALE;
  }
}

/**
 * The whole dictionary, accessed by property rather than through a `t("a.b")`
 * lookup: `t.registro.title` is checked by the compiler, autocompletes, and
 * needs no runtime path resolution.
 */
export async function getDictionary(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: dictionaryFor(locale) };
}
