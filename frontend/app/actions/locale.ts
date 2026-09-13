"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
} from "@/utils/i18n/locales";

/**
 * Store the chosen language and return where the reader was.
 *
 * A server action rather than client state: the language has to be known on
 * the server, which is where every page in this app is rendered, and a cookie
 * is the only thing the server can read on the next request. The switcher is
 * therefore a plain form and needs no client JavaScript, like the rest of the
 * app's controls.
 */
export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  // An unknown value is ignored rather than stored: the cookie is read back
  // and trusted on every request, so it must only ever hold a known locale.
  if (typeof locale === "string" && isLocale(locale)) {
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, locale, {
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
      path: "/",
    });
  }

  // Only same-site paths are honoured, so a crafted form cannot turn the
  // language switcher into an open redirect.
  const next = formData.get("next");
  const target =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/";

  redirect(target);
}
