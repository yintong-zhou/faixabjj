import { LOCALES, type Locale } from "@/utils/i18n/locales";
import type { EmailTemplate } from "@/utils/notify-flow";

// What the /email page knows about notify-flow templates, with no network:
// which ones the app sends and with which variables, how placeholders are
// written, how a preview is drawn and what state each locale is in.
//
// Shared by the server (actions) and the editor in the browser, so no
// server-only import here.

// The variables each email the app sends carries, appName included (added by
// sendEmail()). This is a contract: notify-flow refuses a send whose
// variables differ from the template's declared list, so a template saved
// from /email always declares exactly these. Change it together with the
// code that sends the email (utils/account-emails.ts,
// app/members/requests/actions.ts).
export const APP_TEMPLATES = {
  "password-reset": { variables: ["appName", "name", "resetUrl"], builtin: true },
  "password-changed": { variables: ["appName", "name"], builtin: true },
  "email-change": { variables: ["appName", "name", "confirmUrl"], builtin: false },
  "email-changed": { variables: ["appName", "name", "newEmail"], builtin: false },
  welcome: { variables: ["appName", "name"], builtin: true },
} as const satisfies Record<EmailTemplate, { variables: readonly string[]; builtin: boolean }>;

const TEMPLATE_NAME = /^[a-z0-9-]{1,64}$/;
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function isAppTemplate(name: string): name is EmailTemplate {
  return Object.hasOwn(APP_TEMPLATES, name);
}

/** notify-flow's rule for a template name. */
export function isTemplateName(name: string): boolean {
  return TEMPLATE_NAME.test(name);
}

/** Each `{{ name }}` once, in order of first appearance. */
export function placeholders(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(PLACEHOLDER), (match) => match[1]))];
}

export function unknownPlaceholders(parts: string[], allowed: readonly string[]): string[] {
  return placeholders(parts.join("\n")).filter((name) => !allowed.includes(name));
}

/**
 * The variable list a PUT declares. For an email the app sends it is the
 * fixed contract, even when the content leaves a variable out; for any
 * other template it is what the content uses, plus appName, which every
 * send carries.
 */
export function declaredVariables(name: string, parts: string[]): string[] {
  if (isAppTemplate(name)) return [...APP_TEMPLATES[name].variables];
  return [...new Set(["appName", ...placeholders(parts.join("\n"))])].sort();
}

/** Values for the preview and the test send: realistic, never real. */
export function sampleValues(siteUrl: string, appName: string): Record<string, string> {
  return {
    appName,
    name: "Mario Rossi",
    resetUrl: `${siteUrl}/reset-password?token=example`,
    confirmUrl: `${siteUrl}/confirm-email?token=example`,
    newEmail: "mario.rossi@example.com",
  };
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** The HTML with each placeholder replaced by its value, escaped as notify-flow does. */
export function renderPreview(html: string, values: Record<string, string>): string {
  return html.replace(PLACEHOLDER, (written, name: string) =>
    Object.hasOwn(values, name) ? values[name].replace(/[&<>"']/g, (c) => ESCAPES[c]) : written,
  );
}

/**
 * A React key for the editor: the editor keeps its own state, and Next keeps
 * client state when only the search params change. A redirect back with new
 * content (a restored built-in) must start the editor afresh; one with the
 * same content (a refused save) must keep the unsaved edits.
 */
export function contentKey(
  content: { subject: string; html: string; text: string; builtin: boolean } | null,
): string {
  return content ? JSON.stringify([content.builtin, content.subject, content.html, content.text]) : "none";
}

// builtin    — notify-flow's own text, untouched
// customised — our row over a built-in (deleting it restores the built-in)
// custom     — our row, nothing behind it
// missing    — nothing: a send in this locale falls back to English, or fails
export type LocaleState = "builtin" | "customised" | "custom" | "missing";

export function templateStates(
  list: { name: string; locale: string; builtin: boolean }[],
): Map<string, Record<Locale, LocaleState>> {
  const names = [...new Set([...Object.keys(APP_TEMPLATES), ...list.map((t) => t.name)])];
  const states = new Map<string, Record<Locale, LocaleState>>();

  for (const name of names) {
    const rows = list.filter((t) => t.name === name);
    const hasBuiltin =
      (isAppTemplate(name) && APP_TEMPLATES[name].builtin) || rows.some((t) => t.builtin);
    const state = Object.fromEntries(LOCALES.map((l) => [l, "missing"])) as Record<Locale, LocaleState>;
    for (const row of rows) {
      if (!(LOCALES as readonly string[]).includes(row.locale)) continue;
      state[row.locale as Locale] = row.builtin ? "builtin" : hasBuiltin ? "customised" : "custom";
    }
    states.set(name, state);
  }
  return states;
}

/** The app's emails that have nothing to send in some locale. */
export function missingAppTemplates(
  states: Map<string, Record<Locale, LocaleState>>,
): { name: EmailTemplate; locale: Locale }[] {
  return Object.keys(APP_TEMPLATES).flatMap((name) =>
    LOCALES.filter((locale) => (states.get(name)?.[locale] ?? "missing") === "missing").map(
      (locale) => ({ name: name as EmailTemplate, locale }),
    ),
  );
}
